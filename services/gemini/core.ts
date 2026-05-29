import type { GenerateContentParameters } from "@google/genai";

// 模型配置：主模型 + 備用模型（來源：config/gemini-models.json）
import geminiModels from '../../config/gemini-models.json';
export const GEMINI_MODEL_PRIMARY = geminiModels.primary;
export const GEMINI_MODEL_FALLBACK = geminiModels.fallback;

// 預設 Gemini 請求逾時（毫秒）。Gemini 3.x 系列（pro thinking model）單張可達 200+ 秒，
// 120 秒會在 SDK 還在算的時候被前端切掉、token 白花，所以拉到 300 秒（對齊 Cloud Run timeout）。
export const DEFAULT_GEMINI_TIMEOUT_MS = 300_000;

// 每個模型遇到非取消類錯誤時，等待 RETRY_DELAY_MS 後重試一次（用於 503 / 網路偶發錯誤）。
export const RETRY_DELAY_MS = 1_500;

// 429（quota / rate limit）走較長的退避，避免在 quota 耗盡時還密集 retry 把情況惡化。
// 8 秒對應 Gemini RPM 限制中常見的「每 60 秒重置」的部分恢復視窗；若仍失敗，會接著走
// fallback 模型（不同 model 有獨立 RPM）。
export const RATE_LIMIT_RETRY_DELAY_MS = 8_000;

/**
 * Server-side proxy 回傳非 2xx 時拋出的錯誤。`httpStatus` 用於 callWithRetry
 * 決定退避時間（429 vs 其他）；`code` 是 server 端標記的錯誤分類字串。
 */
export class GeminiApiError extends Error {
  readonly httpStatus: number;
  readonly code?: string;
  constructor(httpStatus: number, message: string, code?: string) {
    super(message);
    this.name = 'GeminiApiError';
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

/** 可被 AbortSignal 中斷的 sleep；aborted 時拋 AbortError，避免 retry 等待期間無法取消。 */
const cancellableSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const rejectAbort = () => {
      const e = new Error('Cancelled during retry wait');
      e.name = 'AbortError';
      reject(e);
    };
    if (signal.aborted) return rejectAbort();
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      rejectAbort();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

/**
 * 透過後端 proxy 呼叫 Gemini，主模型失敗時自動降級；每個模型在非取消類錯誤
 * 發生時會等待後重試一次：
 *   - HTTP 429（quota / rate limit）→ 等待 RATE_LIMIT_RETRY_DELAY_MS（8s）
 *   - 其他（503 UNAVAILABLE / 網路偶發）→ 等待 RETRY_DELAY_MS（1.5s）
 *
 * 重試規則：primary → wait → retry primary → fallback → wait → retry fallback → throw
 * 最多 4 次呼叫。AbortError / GenerationTimeoutError 不會觸發 retry。
 *
 * 不同 model 有獨立 RPM quota，所以即便 primary 撞 429，fallback 仍可能成功。
 *
 * `forceModel`：強制使用指定模型，跳過 fallback 鏈（只 retry 該模型一次）。
 *   用於「快速重繪」「重試此頁」「指令修改」明確要求 pro 品質的情境，避免被
 *   降級到 flash 拉低品質。
 *
 * 內建逾時保護 — 超過 `timeoutMs` 會 abort 並拋出 name='GenerationTimeoutError' 的錯誤；
 * 若 caller 提供 `externalSignal`，外部取消也會立刻中止（不會被改寫成 timeout）。
 */
export const generateWithFallback = async (
  params: Omit<GenerateContentParameters, 'model'>,
  externalSignal?: AbortSignal,
  timeoutMs: number = DEFAULT_GEMINI_TIMEOUT_MS,
  forceModel?: string,
): Promise<{ text: string }> => {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort('external');
  const timeoutId = setTimeout(() => controller.abort('timeout'), timeoutMs);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort('external');
    else externalSignal.addEventListener('abort', onExternalAbort);
  }

  // 將 AbortError + reason='timeout' 改寫為 caller 可辨識的 GenerationTimeoutError
  const wrapError = (err: unknown): unknown => {
    if (err instanceof Error && err.name === 'AbortError' && controller.signal.reason === 'timeout') {
      const e = new Error(`Gemini 請求逾時（超過 ${Math.round(timeoutMs / 1000)} 秒）`);
      e.name = 'GenerationTimeoutError';
      return e;
    }
    return err;
  };

  const callProxy = async (model: string): Promise<{ text: string }> => {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, model }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string; code?: string };
      // 帶上 httpStatus 讓上層能判斷 retry 策略（429 → 長退避；其他 → 短退避）
      throw new GeminiApiError(res.status, err.error || `HTTP ${res.status}`, err.code);
    }
    return res.json() as Promise<{ text: string }>;
  };

  /** 呼叫指定 model；非取消類錯誤時等待後重試一次。429 走較長退避。 */
  const callWithRetry = async (model: string): Promise<{ text: string }> => {
    try {
      return await callProxy(model);
    } catch (firstError: unknown) {
      // 取消 / 逾時 → 不重試，直接拋
      if (controller.signal.aborted) throw firstError;
      const status = firstError instanceof GeminiApiError ? firstError.httpStatus : null;
      const delayMs = status === 429 ? RATE_LIMIT_RETRY_DELAY_MS : RETRY_DELAY_MS;
      const msg = firstError instanceof Error ? firstError.message : String(firstError);
      console.warn(`[Gemini] 模型 ${model} 第一次失敗（${status ?? '?'} ${msg}），${delayMs}ms 後重試`);
      await cancellableSleep(delayMs, controller.signal);
      return await callProxy(model);
    }
  };

  // forceModel 模式：只用指定模型 + retry，不切換到其他模型。
  if (forceModel) {
    try {
      return await callWithRetry(forceModel);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Gemini] 指定模型 ${forceModel} 失敗（含 retry）: ${msg}`);
      throw wrapError(err);
    } finally {
      clearTimeout(timeoutId);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }

  // 預設模式：primary → retry → fallback → retry。
  try {
    return await callWithRetry(GEMINI_MODEL_PRIMARY);
  } catch (primaryError: unknown) {
    // 已被取消或逾時 → 不降級重試，直接拋出
    if (controller.signal.aborted) throw wrapError(primaryError);
    const msg = primaryError instanceof Error ? primaryError.message : String(primaryError);
    console.warn(`[Gemini] 主模型 ${GEMINI_MODEL_PRIMARY} 失敗（含 retry）: ${msg}，切換備用模型 ${GEMINI_MODEL_FALLBACK}`);
    try {
      return await callWithRetry(GEMINI_MODEL_FALLBACK);
    } catch (fallbackError: unknown) {
      const fMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      // 兩個模型都失敗時，把 primary 錯誤也保留在 cause，方便診斷（避免只看到 fallback 錯誤）
      console.error(`[Gemini] 備用模型 ${GEMINI_MODEL_FALLBACK} 也失敗（含 retry）: ${fMsg}；主模型錯誤: ${msg}`);
      if (fallbackError instanceof Error && fallbackError.cause === undefined) {
        fallbackError.cause = primaryError;
      }
      throw wrapError(fallbackError);
    }
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
};
