import { DraftImage } from '../types';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * 將 PDF 檔案的每一頁轉為高解析度圖片（image 模式模板輸入）。
 * 純前端，不需後端或 OAuth。各 edition 共用（核心輸入能力，非商業）。
 * 由 App.tsx 以 dynamic import 載入，pdfjs-dist 不進主 bundle。
 */
export async function pdfToImages(file: File): Promise<DraftImage[]> {
  console.log('[PDF] 開始解析:', file.name);

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  console.log(`[PDF] 共 ${totalPages} 頁`);

  const images: DraftImage[] = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);

    // 以 2x 縮放渲染，確保品質
    const scale = 2;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');

    // pdfjs-dist 5.x：RenderParameters 新增了 canvas 必填欄位（除了 canvasContext 之外）
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;

    const dataUrl = canvas.toDataURL('image/png');
    images.push({
      name: `${file.name} - 第 ${i} 頁`,
      data: dataUrl,
    });

    console.log(`[PDF] 第 ${i}/${totalPages} 頁完成`);
  }

  return images;
}
