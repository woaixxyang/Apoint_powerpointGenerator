/**
 * 守護 nativePptxService.renderText 的 tspan 分支選擇：
 *   - 多行（不同 y） → 分別 emit
 *   - 多欄（不同 x） → 分別 emit  ← 這是 fix 的重點，避免「1. 標題」被壓在同一個 x
 *   - 純 inline（x/y 都同父）→ 收進同一個 text frame（slide 2 兼容）
 *
 * 透過 mock 整個 pptxgenjs 模組捕捉 addText 呼叫，比 PPTX zip 解析快、易讀。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 收集每張 slide 的 addText 呼叫：[(parts, opts)]
type AddTextCall = { parts: any; opts: any };
const addTextCalls: AddTextCall[] = [];
const addShapeCalls: { kind: string; opts: any }[] = [];
const addImageCalls: any[] = [];

vi.mock('pptxgenjs', () => {
  class FakeSlide {
    slideNumber: any;
    addText(parts: any, opts: any) { addTextCalls.push({ parts, opts }); }
    addShape(kind: string, opts: any) { addShapeCalls.push({ kind, opts }); }
    addImage(opts: any) { addImageCalls.push(opts); }
  }
  class FakePptx {
    layout = '';
    title = '';
    addSlide() { return new FakeSlide(); }
    async write({ outputType: _outputType }: any) {
      return new ArrayBuffer(64); // dummy buffer，fontEmbedService 會被 mock 掉
    }
  }
  return { default: FakePptx };
});

// 不真的做字型嵌入 / 下載
vi.mock('../services/fontEmbedService', async () => {
  const actual = await vi.importActual<any>('../services/fontEmbedService');
  return {
    ...actual,
    embedFontsAndSave: async () => { /* noop */ },
  };
});

vi.mock('../utils/download', () => ({
  triggerBlobDownload: async () => { /* noop */ },
}));

// 依 fontFace 過濾出實際 SVG 來源的文字（排除品牌橫條 / slide title 隱藏元素）
const isCJKFont = (parts: any): boolean => {
  if (!Array.isArray(parts)) return false;
  return parts.some(p => p?.options?.fontFace === 'Noto Sans TC' || p?.options?.fontFace === 'Montserrat');
};

const textOf = (parts: any): string =>
  Array.isArray(parts) ? parts.map(p => p.text).join('') : String(parts);

beforeEach(() => {
  addTextCalls.length = 0;
  addShapeCalls.length = 0;
  addImageCalls.length = 0;
});

const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">${inner}</svg>`;

describe('nativePptxService.renderText tspan 分支選擇', () => {
  it('多欄 tspan（同 y 不同 x）→ 分兩個 text frame，各自落在自己的 x', async () => {
    const { exportToNativePPTX } = await import('../services/nativePptxService');
    await exportToNativePPTX([{
      svg: wrap(
        `<text x="50" y="200" font-size="20">
          <tspan x="50">1.</tspan>
          <tspan x="200">業務概況</tspan>
        </text>`,
      ),
      title: 'test',
    } as any]);

    const fromSvg = addTextCalls.filter(c => isCJKFont(c.parts));
    expect(fromSvg.length).toBe(2);
    const texts = fromSvg.map(c => textOf(c.parts));
    expect(texts).toEqual(expect.arrayContaining(['1.', '業務概況']));

    // x 應該明顯不同：「1.」應該在「業務概況」左側
    const numberCall = fromSvg.find(c => textOf(c.parts) === '1.')!;
    const titleCall = fromSvg.find(c => textOf(c.parts) === '業務概況')!;
    expect(titleCall.opts.x).toBeGreaterThan(numberCall.opts.x);
  });

  it('純 inline tspan（無 x/y/dx/dy）→ 收進同一個 text frame（避免重複 center 重疊）', async () => {
    const { exportToNativePPTX } = await import('../services/nativePptxService');
    await exportToNativePPTX([{
      svg: wrap(
        `<text x="480" y="200" font-size="24" text-anchor="middle">大標<tspan font-weight="bold">關鍵字</tspan>補充</text>`,
      ),
      title: 'test',
    } as any]);

    const fromSvg = addTextCalls.filter(c => isCJKFont(c.parts));
    // 三段（"大標" / "關鍵字" / "補充"）應該被合進同一個 addText 呼叫
    expect(fromSvg.length).toBe(1);
    expect(textOf(fromSvg[0].parts)).toBe('大標關鍵字補充');
  });

  it('多行 tspan（不同 y）→ 維持各自一行 emit', async () => {
    const { exportToNativePPTX } = await import('../services/nativePptxService');
    await exportToNativePPTX([{
      svg: wrap(
        `<text x="50" y="100" font-size="18">
          <tspan x="50" y="100">第一行</tspan>
          <tspan x="50" y="140">第二行</tspan>
        </text>`,
      ),
      title: 'test',
    } as any]);

    const fromSvg = addTextCalls.filter(c => isCJKFont(c.parts));
    expect(fromSvg.length).toBe(2);
    // 第二行的 y 必須比第一行大
    const ys = fromSvg.map(c => c.opts.y).sort((a, b) => a - b);
    expect(ys[1]).toBeGreaterThan(ys[0]);
  });
});
