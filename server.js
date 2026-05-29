import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GoogleGenAI } from '@google/genai';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const geminiModels = require('./config/gemini-models.json');

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

if (!process.env.GEMINI_API_KEY) {
  console.error('FATAL: GEMINI_API_KEY not set');
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { apiVersion: 'v1alpha' },
});

const ALLOWED_MODELS = new Set([geminiModels.primary, geminiModels.fallback]);

// 最多同時 10 個 Gemini 呼叫，超過排隊等待
const MAX_CONCURRENT = 10;
let active = 0;
const waitQueue = [];
const acquire = () => new Promise(r =>
  active < MAX_CONCURRENT ? (active++, r()) : waitQueue.push(() => (active++, r()))
);
const release = () => { active--; waitQueue.length && waitQueue.shift()(); };

const app = express();
app.use(express.json({ limit: '20mb' }));

/**
 * 從 @google/genai 拋出的 ApiError 中取 HTTP status。
 * 非 ApiError（網路 / 程式錯誤）回 null。
 */
const extractApiStatus = (err) => {
  if (!err || typeof err !== 'object') return null;
  if (err.name === 'ApiError' && typeof err.status === 'number') return err.status;
  // 防禦：某些情境 status 可能掛在不同層
  if (typeof err.status === 'number') return err.status;
  return null;
};

app.post('/api/generate', async (req, res) => {
  const { model, contents, config } = req.body ?? {};
  if (!model || !contents) {
    return res.status(400).json({ error: '缺少必要欄位 model / contents' });
  }
  if (!ALLOWED_MODELS.has(model)) {
    return res.status(400).json({ error: `不允許的模型: ${model}` });
  }
  const safeBody = { model, contents, ...(config ? { config } : {}) };

  await acquire();
  try {
    const result = await ai.models.generateContent(safeBody);
    res.json({ text: result.text ?? '' });
  } catch (e) {
    const apiStatus = extractApiStatus(e);
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Gemini proxy]', apiStatus ?? 'unknown-status', msg);

    // 429（quota / rate limit）：客戶端應做 exponential backoff，不要密集 retry
    if (apiStatus === 429) {
      return res.status(429).json({
        error: 'Gemini quota 已用盡或請求過頻繁，請稍候再試',
        code: 'RATE_LIMIT',
      });
    }
    // 503（service unavailable）：通常是 Gemini 那端臨時抖動，短 retry 即可恢復
    if (apiStatus === 503) {
      return res.status(503).json({
        error: 'Gemini 服務暫時不可用，請稍後再試',
        code: 'UNAVAILABLE',
      });
    }
    // 4xx 認證 / 權限類錯誤：直接透傳，讓前端能顯示具體原因
    if (apiStatus && apiStatus >= 400 && apiStatus < 500) {
      return res.status(apiStatus).json({
        error: msg || `Gemini 拒絕請求（HTTP ${apiStatus}）`,
        code: 'CLIENT_ERROR',
      });
    }
    // 其他（含未分類的 5xx、網路錯誤、程式 bug）統一 500
    res.status(500).json({ error: 'AI 生成失敗，請稍後再試' });
  } finally {
    release();
  }
});

// 商業 usage 路由（私有；OSS 公眾版無 services/commercial/ → 略過，server 仍正常運作）
try {
  const { mountUsageRoutes } = await import('./services/commercial/usageSheets.server.js');
  mountUsageRoutes(app);
} catch (e) {
  console.log('[usage] 商業 usage 模組未載入（OSS 版屬正常）:', e?.code || e?.message || e);
}

app.use(express.static(join(__dirname, 'dist')));
app.get('*', (_, res) => res.sendFile(join(__dirname, 'dist/index.html')));

app.listen(PORT, () => console.log(`Apoint server on :${PORT}`));
