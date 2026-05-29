import { describe, it, expect } from 'vitest';
import { sanitizeSvg } from '../services/geminiService';

/**
 * 守護「匯出排版穩定性」的座標數學層 —— translate 群組展開。
 *
 * PPT 的 SVG→EMF 轉換器不支援 <g transform="translate(x,y)">。展開發生在「生成階段」
 * 的 sanitizeSvg（非 prepareSvgForPpt），把位移寫入子元素絕對座標並移除 <g>。
 * 若展開失敗，匯出後該群組的元素會整批跑位。
 *
 * 注意：座標數字正確 ≠ 視覺正確；本檔只能擋「座標跑掉 / 未展開」這類數學錯誤，
 * 文字換行、擠壓、壓到品牌橫條仍需人眼開檔確認。
 */

const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">${inner}</svg>`;

const firstRect = (svg: string) => {
  const m = svg.match(/<rect\b[^>]*>/);
  if (!m) throw new Error('找不到 rect');
  const x = parseFloat(/\bx="([^"]+)"/.exec(m[0])?.[1] ?? 'NaN');
  const y = parseFloat(/\by="([^"]+)"/.exec(m[0])?.[1] ?? 'NaN');
  return { x, y, hasGroup: /<g[\s>]/.test(svg) };
};

describe('sanitizeSvg — translate 群組展開（匯出排版穩定性）', () => {
  it('逗號分隔 translate(100, 50) → 子 rect 座標加位移、<g> 移除', () => {
    const r = firstRect(sanitizeSvg(wrap(
      `<g transform="translate(100, 50)"><rect x="10" y="20" width="40" height="30"/></g>`,
    )));
    expect(r).toEqual({ x: 110, y: 70, hasGroup: false });
  });

  it('空白分隔 translate(100 50) → 同樣展開', () => {
    const r = firstRect(sanitizeSvg(wrap(
      `<g transform="translate(100 50)"><rect x="10" y="20" width="40" height="30"/></g>`,
    )));
    expect(r).toEqual({ x: 110, y: 70, hasGroup: false });
  });

  it('巢狀 translate 群組 → 位移累加', () => {
    const r = firstRect(sanitizeSvg(wrap(
      `<g transform="translate(100, 50)"><g transform="translate(10, 5)"><rect x="0" y="0" width="40" height="30"/></g></g>`,
    )));
    expect(r).toEqual({ x: 110, y: 55, hasGroup: false });
  });

  it('負號當分隔 translate(10-5) → 第二參數為 -5（合法 SVG，無分隔符）', () => {
    const r = firstRect(sanitizeSvg(wrap(
      `<g transform="translate(10-5)"><rect x="100" y="100" width="40" height="30"/></g>`,
    )));
    expect(r).toEqual({ x: 110, y: 95, hasGroup: false });
  });

  it('單參數 translate(1050) → 不可被誤拆成 (105, 0)（y 維持原值，僅 x 加 1050）', () => {
    const r = firstRect(sanitizeSvg(wrap(
      `<g transform="translate(1050)"><rect x="0" y="200" width="40" height="30"/></g>`,
    )));
    expect(r).toEqual({ x: 1050, y: 200, hasGroup: false });
  });

  it('含 rotate 的 transform → 不展開（避免遺失非 translate 變換，座標保持原樣）', () => {
    const r = firstRect(sanitizeSvg(wrap(
      `<g transform="translate(100,50) rotate(30)"><rect x="10" y="20" width="40" height="30"/></g>`,
    )));
    expect(r.x).toBe(10);
    expect(r.y).toBe(20);
  });
});
