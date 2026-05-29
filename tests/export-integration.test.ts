/**
 * 整合測試（非標準單測）— 從 disk 讀使用者匯出的 SVG，
 * 跑完整 exportToNativePPTX pipeline，把產物 PPTX 寫到 Downloads 給人工驗證。
 *
 * 用途：在不需要重新呼叫 Gemini 的情況下快速 iterate 匯出 bug 修復。
 *
 * 跑法：npx vitest run tests/export-integration.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SVG_DIR = '/Users/avaxu/Downloads/drive-download-20260513T191351Z-3-001';
const OUT_PATH = '/Users/avaxu/Downloads/Test_Conversion.pptx';
const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts');

// 1. Mock triggerBlobDownload：抓住 blob，不要真的觸發下載
let capturedBlob: Blob | null = null;
let capturedFileName: string | null = null;
vi.mock('../utils/download', () => ({
  triggerBlobDownload: async (blob: Blob, fileName: string) => {
    capturedBlob = blob;
    capturedFileName = fileName;
  },
}));

// 2. Mock fetch：把 /fonts/* 對應到本地 public/fonts/
const origFetch = globalThis.fetch;
globalThis.fetch = (async (input: any) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('/fonts/')) {
    const fp = path.join(FONTS_DIR, url.replace('/fonts/', ''));
    if (fs.existsSync(fp)) {
      const buf = fs.readFileSync(fp);
      return new Response(buf, {
        status: 200,
        headers: { 'Content-Type': 'font/ttf' },
      });
    }
    return new Response('', { status: 404 });
  }
  return origFetch(input);
}) as typeof fetch;

// 3. 收集所有 SVG，依 slide_N 排序，重複版本取最新（Drive 加 "(1)" "(2)" 後綴，
//    數字越大越新）
function loadSlideSvgs() {
  const files = fs.readdirSync(SVG_DIR);
  // slide_N.svg or slide_N (M).svg
  const re = /^slide_(\d+)(?:\s*\((\d+)\))?\.svg$/;
  type Entry = { n: number; ver: number; path: string };
  const entries: Entry[] = [];
  for (const f of files) {
    const m = f.match(re);
    if (!m) continue;
    entries.push({
      n: parseInt(m[1], 10),
      ver: m[2] ? parseInt(m[2], 10) : 0,
      path: path.join(SVG_DIR, f),
    });
  }
  // 同一 slide_N 取 ver 最大
  const latest = new Map<number, Entry>();
  for (const e of entries) {
    const cur = latest.get(e.n);
    if (!cur || e.ver > cur.ver) latest.set(e.n, e);
  }
  const sortedNums = [...latest.keys()].sort((a, b) => a - b);
  return sortedNums.map(n => ({
    n,
    svg: fs.readFileSync(latest.get(n)!.path, 'utf8'),
  }));
}

// 此測試依賴本地 SVG 資料夾，CI / 其他環境跑不到時自動跳過
const SHOULD_RUN = fs.existsSync(SVG_DIR);

describe.skipIf(!SHOULD_RUN)('PPTX export integration (from real SVGs)', () => {
  it('builds PPTX from all SVGs and writes to Downloads', async () => {
    // 動態 import 在 mock 設定之後
    const { exportToNativePPTX } = await import('../services/nativePptxService');
    const slides = loadSlideSvgs().map(({ n, svg }) => ({
      title: `Slide ${n}`,
      svg,
      elements: [],
    }));
    console.log(`[integration] 載入 ${slides.length} 張 slide`);

    await exportToNativePPTX(slides);

    expect(capturedBlob).not.toBeNull();
    const buffer = Buffer.from(await capturedBlob!.arrayBuffer());
    fs.writeFileSync(OUT_PATH, buffer);
    console.log(`[integration] 寫入 ${buffer.length} bytes → ${OUT_PATH}`);
    console.log(`[integration] 原始檔名 (僅參考): ${capturedFileName}`);
  }, 120_000);
});
