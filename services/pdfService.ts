import { jsPDF } from 'jspdf';
import 'svg2pdf.js'; // 副作用：在 jsPDF.prototype 註冊 .svg() method
import { SlideData } from '../types';

/**
 * PDF 匯出：將每張投影片 SVG 透過 svg2pdf.js 寫成「向量」PDF 指令，
 * 取代過去 SVG → PNG raster（檔案常 30–80MB，jsPDF ArrayBuffer 容易爆掉）的做法。
 *
 * 設計重點：
 *   1. 採用 pt 為單位、頁面尺寸 960×540 直接對齊 SVG viewBox 1:1，
 *      免除座標換算造成的字距/位置位移。
 *   2. 中文/西文字型走「方案 A：註冊 TTF 到 jsPDF VFS」。
 *      svg2pdf.js 在繪製 <text> 時會查 jsPDF 已註冊字型表；對 CJK 而言把字
 *      轉成 <path> 不可靠（字數多、字型表大、開源 opentype 在 happy-dom 上
 *      也跑不動），hybrid raster fallback 邏輯又會把 bundle 越塞越重。
 *   3. 整個模組由 App 端動態 import，TTF 也只在按下「匯出 PDF」當下才下載，
 *      不影響首屏 / 主 bundle 大小。TTF 透過 module-scope 變數快取，
 *      第二次匯出零下載。
 *
 * 注意事項：
 *   - sanitizeSvg 已把 <image> 標籤從 AI 生成的 SVG 移除，但 composeSvgWithBrandBar
 *     會在 sanitize 後重新塞入品牌橫條的 base64 PNG <image>。svg2pdf.js 內建
 *     image 支援會用 jsPDF.addImage 寫進去，PDF 仍是混合向量 + 點陣，
 *     體積遠小於整頁 raster。
 *   - flattenTransforms / Arc→Cubic 等 PPT 專用清理 svg2pdf.js 不需要，
 *     此處直接吃 SlideData.svg 原樣即可。
 */

// SVG 畫布尺寸（與整個 app 一致），同時作為 PDF page 的 pt 尺寸
const SVG_W = 960;
const SVG_H = 540;

// 字型名稱必須對齊 SVG 的 font-family（geminiService 寫入 "Montserrat, 'Noto Sans TC', sans-serif"）。
// svg2pdf.js 比對時會逐一查 font-family 字串中每個 token，所以兩種都要註冊。
const CJK_FONT_NAME = 'Noto Sans TC';
const LATIN_FONT_NAME = 'Montserrat';

type FontStyle = 'normal' | 'bold';

interface FontAsset {
  name: string;
  file: string;
  style: FontStyle;
  base64: string;
}

// 每個 (family, style) 對應一支獨立 TTF。SVG `font-weight="bold"` 在 svg2pdf
// 渲染時會挑 style="bold"，沒有真 Bold TTF 時 jsPDF 會合成假粗 → CJK 容易糊掉。
const FONT_ASSETS_SPEC: { name: string; file: string; style: FontStyle }[] = [
  { name: CJK_FONT_NAME,   file: 'NotoSansTC-Regular.ttf',  style: 'normal' },
  { name: CJK_FONT_NAME,   file: 'NotoSansTC-Bold.ttf',     style: 'bold'   },
  { name: LATIN_FONT_NAME, file: 'Montserrat-Regular.ttf',  style: 'normal' },
  { name: LATIN_FONT_NAME, file: 'Montserrat-Bold.ttf',     style: 'bold'   },
];

// 模組層快取：同一個 SPA 生命週期內僅下載一次（首次匯出兩個 family × 兩個字重 ~15MB）
let fontCachePromise: Promise<FontAsset[]> | null = null;

/**
 * 將 ArrayBuffer 轉為 base64（chunk 避免 String.fromCharCode 爆 stack）
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}

/**
 * 載入所有 (family, style) TTF base64，模組快取。
 */
async function loadFontsOnce(): Promise<FontAsset[]> {
  if (fontCachePromise) return fontCachePromise;

  fontCachePromise = (async () => {
    const assets: FontAsset[] = await Promise.all(
      FONT_ASSETS_SPEC.map(async (spec): Promise<FontAsset> => {
        const res = await fetch(`/fonts/${spec.file}`);
        if (!res.ok) {
          throw new Error(`無法載入字型 ${spec.file} (HTTP ${res.status})`);
        }
        const buf = await res.arrayBuffer();
        return { ...spec, base64: arrayBufferToBase64(buf) };
      }),
    );
    return assets;
  })().catch(err => {
    // 失敗時清掉快取以便下次重試
    fontCachePromise = null;
    throw err;
  });

  return fontCachePromise;
}

/**
 * 把每支 TTF 註冊成自己對應的 jsPDF style：Regular → 'normal'，Bold → 'bold'。
 * 沒有 italic 變體，把 italic / bolditalic 退回到同 family 的 normal / bold（svg2pdf
 * 在沒指定 italic 的 SVG 上不會走這條路，但 jsPDF 內部 fallback 需要這四個 key 存在）。
 */
function registerFontsOnPdf(pdf: jsPDF, fonts: FontAsset[]): void {
  const seenFiles = new Set<string>();
  for (const asset of fonts) {
    if (!seenFiles.has(asset.file)) {
      pdf.addFileToVFS(asset.file, asset.base64);
      seenFiles.add(asset.file);
    }
    pdf.addFont(asset.file, asset.name, asset.style);
    // italic / bolditalic 沒專屬檔，分別 alias 到 normal / bold（同一個 TTF）
    const italicStyle = asset.style === 'bold' ? 'bolditalic' : 'italic';
    pdf.addFont(asset.file, asset.name, italicStyle);
  }
}

/**
 * 將 SVG 字串 parse 成 SVGElement，並把它臨時掛到 document 上。
 * svg2pdf.js 內部會呼叫 element.getBBox() / getComputedStyle()，
 * 必須是「真的有渲染樹」的節點，detached element 在某些路徑會回傳 0。
 */
function attachSvgForMeasurement(svgString: string): { el: SVGElement; cleanup: () => void } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('SVG parse 失敗');
  }
  const el = doc.documentElement as unknown as SVGElement;

  // 隔離容器：放在畫面外但仍納入渲染（svg2pdf 需要 layout）
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.width = `${SVG_W}px`;
  host.style.height = `${SVG_H}px`;
  host.style.pointerEvents = 'none';
  host.appendChild(el);
  document.body.appendChild(host);

  return {
    el,
    cleanup: () => {
      if (host.parentNode) host.parentNode.removeChild(host);
    },
  };
}

/**
 * 匯出多頁 PDF（16:9 landscape，pt 直接對應 SVG 960×540）。
 */
export async function exportToPDF(slides: SlideData[]): Promise<void> {
  if (slides.length === 0) return;

  // 1. 預先載字型（與 PDF 物件初始化並行；TTF 約 12MB+0.7MB）
  const fonts = await loadFontsOnce();

  // 2. 建立 PDF：pt 單位、頁面 = SVG viewBox，svg2pdf 不需任何縮放
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: [SVG_W, SVG_H],
    compress: true, // 啟用 PDF 內建 zlib 壓縮（向量指令、嵌入 image stream 都會壓）
  });

  registerFontsOnPdf(pdf, fonts);

  // 3. 逐頁 render
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (i > 0) pdf.addPage([SVG_W, SVG_H], 'landscape');

    if (!slide.svg) {
      pdf.setFontSize(18);
      pdf.text(slide.title || `Slide ${i + 1}`, 40, 60);
      continue;
    }

    let attached: ReturnType<typeof attachSvgForMeasurement> | null = null;
    try {
      attached = attachSvgForMeasurement(slide.svg);
      await pdf.svg(attached.el, { x: 0, y: 0, width: SVG_W, height: SVG_H });
    } catch (err) {
      console.error(`[exportToPDF] Slide ${i + 1} render 失敗，改用文字 fallback:`, err);
      pdf.setFontSize(18);
      pdf.text(slide.title || `Slide ${i + 1}`, 40, 60);
      pdf.setFontSize(11);
      pdf.text('SVG 向量轉換失敗', 40, 90);
    } finally {
      attached?.cleanup();
    }
  }

  // 4. 觸發下載
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  pdf.save(`Presentation_${timestamp}.pdf`);
}
