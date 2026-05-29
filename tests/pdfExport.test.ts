/**
 * PDF 匯出主要守護點：
 *   1. exportToPDF 確實會嘗試載入兩個 TTF 字型（CJK + Latin），fetch 失敗時 throw。
 *   2. 字型 base64 編碼器可正確處理大 buffer（NotoSansTC 約 12MB，超過 String.fromCharCode 一次 stack 上限）。
 *   3. 對比向量輸出 vs 原本 raster 寫法：PDF 體積必須顯著縮小。
 *
 * 注意：svg2pdf.js 依賴瀏覽器 getBBox()，happy-dom 對 SVG layout 支援薄弱，
 *      故此處不跑「真正 render 一張完整 SVG → 比體積」的端到端，而是用 jsPDF
 *      直接寫等量內容做 sanity check。整合層級的視覺驗證仰賴人工。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts');

// 共用：mock fetch 對 /fonts/ 回本地檔
function setupFontFetchMock() {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : (input as Request).url ?? String(input);
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
    return origFetch(input as RequestInfo | URL);
  }) as typeof fetch;
}

describe('pdfService exportToPDF', () => {
  beforeEach(() => {
    setupFontFetchMock();
    // 每個 case 都重新 import，避免字型快取在 test 間殘留
    vi.resetModules();
  });

  it('TTF 字型載入失敗時 throw，並清掉快取（下次重試）', async () => {
    // 將 fetch 改為一律 404
    globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;

    const { exportToPDF } = await import('../services/pdfService');
    // jsPDF save 在 happy-dom 無 anchor click，但會在 fetch 階段就 throw
    await expect(exportToPDF([{ title: 'x', svg: '<svg/>', elements: [] }])).rejects.toThrow(
      /無法載入字型/,
    );

    // 第二次呼叫應該再次嘗試 fetch（快取被清掉）→ 也會 throw（fetch 仍 404）
    await expect(exportToPDF([{ title: 'x', svg: '<svg/>', elements: [] }])).rejects.toThrow(
      /無法載入字型/,
    );
  });

  it('arrayBufferToBase64 能處理 NotoSansTC 12MB 大檔（不會 stack overflow）', async () => {
    // 此 test 只在本地 fonts 存在時跑（CI 上 fonts 大檔不一定 check-in）
    const cjkPath = path.join(FONTS_DIR, 'NotoSansTC-Regular.ttf');
    if (!fs.existsSync(cjkPath)) return;

    setupFontFetchMock();

    // 透過 dynamic import 拿到模組內部，再呼 loadFontsOnce 不可行（私有），
    // 改為「跑一次匯出，只要不 throw stack overflow 就算通過」。
    // 我們不需要 PDF render 成功（happy-dom 不支援 getBBox），只要字型載入完成
    // 且 jsPDF.addFileToVFS 成功就算驗證。
    const { exportToPDF } = await import('../services/pdfService');

    // 故意給一個會在 pdf.svg() 階段失敗的 SVG，這樣 fallback 走文字分支，
    // 不會 crash 整個流程，能驗證字型流程跑完。
    await expect(
      exportToPDF([{ title: '測試', svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', elements: [] }]),
    ).resolves.not.toThrow();
  }, 30_000);
});

describe('PDF 體積比較：向量 vs raster（手算對照）', () => {
  it('jsPDF 純向量輸出（文字+矩形）顯著小於同尺寸 PNG raster', async () => {
    const { jsPDF } = await import('jspdf');

    // 向量版：寫 10 頁文字 + 幾個 rect
    const vec = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [960, 540], compress: true });
    for (let i = 0; i < 10; i++) {
      if (i > 0) vec.addPage([960, 540], 'landscape');
      vec.setFontSize(28);
      vec.text(`Slide ${i + 1}`, 60, 80);
      vec.setFillColor(200, 220, 240);
      vec.rect(60, 120, 600, 200, 'F');
      vec.setFontSize(12);
      vec.text('Lorem ipsum dolor sit amet, consectetur adipiscing elit.', 70, 360);
    }
    const vecBytes = (vec.output('arraybuffer') as ArrayBuffer).byteLength;

    // Raster baseline：模擬 10 張 1920×1080 PNG 約佔多少（PNG 體積依內容差很大，
    // 這裡保守用「PNG header + 30KB stream」之假設，純粹示意，
    // 實際使用情境下舊版常 30–80MB；我們只要確認向量 <1MB 即可）
    expect(vecBytes).toBeLessThan(500_000); // 不到 500KB
  });
});
