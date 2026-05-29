import { describe, it, expect } from 'vitest';
import { prepareSvgForPpt } from '../services/geminiService';

/**
 * 守護 prepareSvgForPpt 對 tspan 座標 / 單位的處理。
 * 過去 parseFloat("1.2em") 會回 1.2 → 被當 px → tspan 位置塌到頂端，
 * 視覺上像「文字消失」。
 */

const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">${inner}</svg>`;

const parse = (svg: string): Document =>
  new DOMParser().parseFromString(svg, 'image/svg+xml');

describe('prepareSvgForPpt — tspan 座標解析', () => {
  it('多行 tspan 用絕對 y → 各自保留 y 值', () => {
    const out = prepareSvgForPpt(wrap(
      `<text x="50" y="100" font-size="20">
        <tspan y="100">第一行</tspan>
        <tspan y="130">第二行</tspan>
      </text>`,
    ));
    const tspans = parse(out).querySelectorAll('tspan');
    expect(tspans[0].getAttribute('y')).toBe('100');
    expect(tspans[1].getAttribute('y')).toBe('130');
  });

  it('多欄 tspan（同 y 不同 x）→ 各自保留 x 值，不被父 x 蓋掉', () => {
    const out = prepareSvgForPpt(wrap(
      `<text x="50" y="100" font-size="20">
        <tspan x="50">1.</tspan>
        <tspan x="120">業務概況</tspan>
      </text>`,
    ));
    const tspans = parse(out).querySelectorAll('tspan');
    expect(tspans[0].getAttribute('x')).toBe('50');
    expect(tspans[1].getAttribute('x')).toBe('120');
  });

  it('inline tspan（無 x/y/dx/dy）→ x/y 補成跟父一致（slide 2 兼容性）', () => {
    const out = prepareSvgForPpt(wrap(
      `<text x="500" y="200" font-size="24" text-anchor="middle">大標<tspan font-weight="bold">關鍵字</tspan>補充</text>`,
    ));
    const tspan = parse(out).querySelector('tspan')!;
    expect(tspan.getAttribute('x')).toBe('500');
    expect(tspan.getAttribute('y')).toBe('200');
  });

  it('dy 是 em → 用繼承 font-size 換算為 px', () => {
    // 24px font-size、dy="1.5em" → 24 × 1.5 = 36 px 位移
    const out = prepareSvgForPpt(wrap(
      `<text x="100" y="100" font-size="24">
        <tspan>第一行</tspan>
        <tspan dy="1.5em">第二行</tspan>
      </text>`,
    ));
    const tspans = parse(out).querySelectorAll('tspan');
    // 第一行 y = 100，第二行 y = 100 + 36 = 136
    expect(parseFloat(tspans[1].getAttribute('y')!)).toBeCloseTo(136, 1);
    // dy 屬性應被移除（已解析為絕對 y）
    expect(tspans[1].hasAttribute('dy')).toBe(false);
  });

  it('dy 是 % → 以 font-size 為基準 (50% = 0.5em)', () => {
    const out = prepareSvgForPpt(wrap(
      `<text x="100" y="100" font-size="20">
        <tspan>line1</tspan>
        <tspan dy="50%">line2</tspan>
      </text>`,
    ));
    const tspans = parse(out).querySelectorAll('tspan');
    // 0.5 × 20 = 10，y = 100 + 10 = 110
    expect(parseFloat(tspans[1].getAttribute('y')!)).toBeCloseTo(110, 1);
  });

  it('未知 / 壞掉的 dy → 忽略偏移（避免座標跳到 NaN 或頂端）', () => {
    const out = prepareSvgForPpt(wrap(
      `<text x="100" y="100" font-size="20">
        <tspan>line1</tspan>
        <tspan dy="abc">line2</tspan>
      </text>`,
    ));
    const tspans = parse(out).querySelectorAll('tspan');
    // 解析失敗的 dy 應該被當 0，y 維持 100（不是 NaN，不是 0）
    expect(parseFloat(tspans[1].getAttribute('y')!)).toBe(100);
  });

  it('dx 累加：兩個 dx 串接時用 em 解析', () => {
    const out = prepareSvgForPpt(wrap(
      `<text x="0" y="100" font-size="10">
        <tspan>A</tspan>
        <tspan dx="2em">B</tspan>
        <tspan dx="3em">C</tspan>
      </text>`,
    ));
    const tspans = parse(out).querySelectorAll('tspan');
    expect(parseFloat(tspans[0].getAttribute('x')!)).toBe(0);
    expect(parseFloat(tspans[1].getAttribute('x')!)).toBeCloseTo(20, 1);  // 0 + 2*10
    expect(parseFloat(tspans[2].getAttribute('x')!)).toBeCloseTo(50, 1);  // 20 + 3*10
  });

  it('解析失敗時整個 SVG 原樣回傳，不破壞 caller', () => {
    const bad = '<not-svg>not xml</wrong>';
    expect(prepareSvgForPpt(bad)).toBe(bad);
    expect(prepareSvgForPpt('')).toBe('');
  });
});
