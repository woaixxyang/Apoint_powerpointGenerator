/**
 * 守護 nativePptxService 的 SVG 屬性 → PPTX 英吋座標換算。
 *
 * 換算基準：SLIDE_W=10in / SVG_W=960px、SLIDE_H=5.625in / SVG_H=540px
 *   → 兩軸都是 1 inch = 96px（px2inX = px2inY = px/96）。
 * 形狀座標換算錯誤 = 匯出後元素位置/大小整批跑掉，是排版穩定性的根。
 *
 * 透過 mock pptxgenjs 捕捉 addShape 呼叫，斷言 x/y/w/h（單位：吋）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const addShapeCalls: { kind: string; opts: any }[] = [];

vi.mock('pptxgenjs', () => {
  class FakeSlide {
    addText() { /* noop */ }
    addShape(kind: string, opts: any) { addShapeCalls.push({ kind, opts }); }
    addImage() { /* noop */ }
  }
  class FakePptx {
    layout = '';
    title = '';
    addSlide() { return new FakeSlide(); }
    async write() { return new ArrayBuffer(64); }
  }
  return { default: FakePptx };
});

vi.mock('../services/fontEmbedService', async () => {
  const actual = await vi.importActual<any>('../services/fontEmbedService');
  return { ...actual, embedFontsAndSave: async () => { /* noop */ } };
});

vi.mock('../utils/download', () => ({ triggerBlobDownload: async () => { /* noop */ } }));

beforeEach(() => { addShapeCalls.length = 0; });

const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">${inner}</svg>`;

const renderOne = async (inner: string) => {
  const { exportToNativePPTX } = await import('../services/nativePptxService');
  await exportToNativePPTX([{ svg: wrap(inner), title: 't' } as any]);
};

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 4);

describe('nativePptxService — SVG → PPTX 英吋座標換算', () => {
  it('rect：x/y/w/h 以 1in=96px 換算', async () => {
    await renderOne(`<rect x="96" y="96" width="192" height="96" fill="#ff0000"/>`);
    const rect = addShapeCalls.find(c => c.kind === 'rect' && Math.abs(c.opts.w - 2) < 1e-6);
    expect(rect).toBeTruthy();
    close(rect!.opts.x, 1);
    close(rect!.opts.y, 1);
    close(rect!.opts.w, 2);
    close(rect!.opts.h, 1);
  });

  it('rect 帶 rx → roundRect，rectRadius 同步換算', async () => {
    await renderOne(`<rect x="0" y="0" width="96" height="96" rx="48" fill="#00ff00"/>`);
    const rr = addShapeCalls.find(c => c.kind === 'roundRect');
    expect(rr).toBeTruthy();
    close(rr!.opts.rectRadius, 0.5); // 48px / 96
  });

  it('circle：左上角 = (cx-r, cy-r)、寬高 = 2r', async () => {
    await renderOne(`<circle cx="480" cy="288" r="96" fill="#0000ff"/>`);
    const c = addShapeCalls.find(x => x.kind === 'ellipse');
    expect(c).toBeTruthy();
    close(c!.opts.x, (480 - 96) / 96); // 4
    close(c!.opts.y, (288 - 96) / 96); // 2
    close(c!.opts.w, 2);
    close(c!.opts.h, 2);
  });

  it('line：正規化左上角 + flipH/flipV 表示方向', async () => {
    // 反向線：x2<x1, y2<y1 → 起點正規化到左上角，flip 皆 true
    await renderOne(`<line x1="288" y1="192" x2="96" y2="96" stroke="#000000"/>`);
    const ln = addShapeCalls.find(x => x.kind === 'line');
    expect(ln).toBeTruthy();
    close(ln!.opts.x, 1);          // min(288,96)/96
    close(ln!.opts.y, 1);          // min(192,96)/96
    close(ln!.opts.w, 2);          // |288-96|/96
    close(ln!.opts.h, 1);          // |192-96|/96
    expect(ln!.opts.flipH).toBe(true);
    expect(ln!.opts.flipV).toBe(true);
  });

  it('退化形狀（w/h<=0、r<=0）不產生 shape，不丟出 NaN', async () => {
    await renderOne(`<rect x="0" y="0" width="0" height="50"/><circle cx="10" cy="10" r="0"/>`);
    expect(addShapeCalls.every(c => Number.isFinite(c.opts.x) && Number.isFinite(c.opts.w))).toBe(true);
    expect(addShapeCalls.find(c => c.kind === 'rect')).toBeFalsy();
    expect(addShapeCalls.find(c => c.kind === 'ellipse')).toBeFalsy();
  });
});
