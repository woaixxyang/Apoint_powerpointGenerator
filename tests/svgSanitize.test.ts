import { describe, it, expect } from 'vitest';
import { sanitizeSvg, convertArcsInPath, flattenTransforms } from '../services/geminiService';

/**
 * SVG 處理鏈是「外觀過得去但暗坑多」型函式。守護幾個歷史 bug 點：
 *   - sanitizeSvg: inline style data:URI 不被 split(':') 截斷（commit 0f57d59）
 *   - convertArcsInPath: 相對 m 多 pair 必須累加（commit 0f57d59）
 *   - flattenTransforms: PPT 轉換器不支援 <g translate>，必須展開
 */

const SVG_NS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540">';

describe('sanitizeSvg', () => {
  it('removes prohibited tags (foreignObject / filter / clipPath / mask / use / animate / image)', () => {
    const input =
      SVG_NS +
      '<foreignObject></foreignObject>' +
      '<filter id="f"><feGaussianBlur/></filter>' +
      '<clipPath><rect/></clipPath>' +
      '<mask><rect/></mask>' +
      '<use href="#x"/>' +
      '<animate/>' +
      '<image href="x.png"/>' +
      '<rect width="10" height="10"/>' +
      '</svg>';
    const out = sanitizeSvg(input);

    for (const tag of ['foreignObject', '<filter', '<clipPath', '<mask', '<use', '<animate', '<image']) {
      expect(out).not.toContain(tag);
    }
    expect(out).toContain('<rect');
  });

  it('removes prohibited attrs (class / id / style / dominant-baseline)', () => {
    const input =
      SVG_NS +
      '<rect class="foo" id="bar" dominant-baseline="middle" width="10" height="10"/>' +
      '</svg>';
    const out = sanitizeSvg(input);

    expect(out).not.toMatch(/class\s*=/);
    expect(out).not.toMatch(/\sid\s*=/);
    expect(out).not.toContain('dominant-baseline');
  });

  it('strips on* event handlers without needing an allowlist', () => {
    const input =
      SVG_NS +
      '<rect onclick="alert(1)" onmouseover="x()" width="10" height="10"/>' +
      '</svg>';
    const out = sanitizeSvg(input);

    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onmouseover');
  });

  it('converts inline style props to attributes', () => {
    const input =
      SVG_NS +
      '<rect style="fill: red; stroke: blue; stroke-width: 2" width="10" height="10"/>' +
      '</svg>';
    const out = sanitizeSvg(input);

    expect(out).toMatch(/fill="red"/);
    expect(out).toMatch(/stroke="blue"/);
    expect(out).toMatch(/stroke-width="2"/);
    // 原 style 屬性應該被移除（PROHIBITED_ATTRS 有 'style'）
    expect(out).not.toMatch(/style\s*=/);
  });

  it('does NOT truncate data: URI inside style (regression for commit 0f57d59)', () => {
    // 用 SVG_STYLE_ATTRS 內的 prop 才會被提取，data:URI 不在白名單所以不會被提取，
    // 但這個 case 主要是確保 split(':') 那段不會把 'data' 當成 prop 抓走整段 URI
    const input =
      SVG_NS +
      '<rect style="fill: url(data:image/png;base64,abc:def); opacity: 0.5" width="10" height="10"/>' +
      '</svg>';
    const out = sanitizeSvg(input);

    // opacity 屬性應該被正確提取（不會被前面的 data: 干擾）
    expect(out).toMatch(/opacity="0\.5"/);
  });

  it('escapes bare & in text content (Q&A, R&D)', () => {
    const input = SVG_NS + '<text>Q&A and R&D</text></svg>';
    const out = sanitizeSvg(input);

    expect(out).toContain('Q&amp;A');
    expect(out).toContain('R&amp;D');
  });

  it('auto-closes truncated SVG output', () => {
    // AI 輸出被截斷沒 </svg>，sanitize 應該補回去
    const input = SVG_NS + '<g><rect width="10" height="10"/>';
    const out = sanitizeSvg(input);

    expect(out).toContain('</svg>');
    // unclosed <g> 也應該補上
    expect(out).toContain('</g>');
  });
});

describe('convertArcsInPath', () => {
  it('returns input unchanged when no Arc commands', () => {
    const d = 'M10 10 L20 20 C30 30 40 40 50 50 Z';
    expect(convertArcsInPath(d)).toBe(d);
  });

  it('converts absolute Arc to Cubic Bezier', () => {
    const d = 'M0 0 A50 50 0 0 0 100 0';
    const out = convertArcsInPath(d);

    // 應該不再有 A，且包含 C
    expect(out).not.toMatch(/[Aa]\d/);
    expect(out).toMatch(/C/);
  });

  it('tracks current position across relative m with multiple pairs (commit 0f57d59 regression)', () => {
    // M100 200 m10 20 30 40 A50 50 0 0 0 200 300
    //   M100 200 → cur = (100, 200)
    //   m10 20 30 40 → cur = (100+10+30, 200+20+40) = (140, 260)   (修復前 bug：只累加最後 pair)
    //   A 應從 (140, 260) 算起，而非從 bug 前的 (130, 240)
    //
    // 我們可以間接驗證：用兩個輸入比較
    const fixed = convertArcsInPath('M100 200 m10 20 30 40 A50 50 0 0 0 200 300');
    const onePair = convertArcsInPath('M100 200 m40 60 A50 50 0 0 0 200 300');

    // 兩者 arc 的「起點」應該一樣（都是 (140, 260)），轉成的 C 命令應該相同
    // 取最後一段 C 命令做比對
    const lastC = (s: string) => s.match(/C[^MLAaZz]*/g)?.slice(-1)[0];
    expect(lastC(fixed)).toBe(lastC(onePair));
  });
});

describe('flattenTransforms', () => {
  // 構造 SVG DOM 的小工具
  const parseSvg = (s: string): Element => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(s, 'image/svg+xml');
    return doc.documentElement;
  };

  it('flattens <g transform="translate(dx,dy)"> by offsetting child coords', () => {
    const root = parseSvg(SVG_NS + '<g transform="translate(10,20)"><rect x="5" y="5" width="3" height="4"/></g></svg>');

    flattenTransforms(root);

    const rect = root.querySelector('rect')!;
    expect(rect.getAttribute('x')).toBe('15');
    expect(rect.getAttribute('y')).toBe('25');
    // <g> 應該被移除
    expect(root.querySelector('g')).toBeNull();
  });

  it('accumulates nested translates', () => {
    const root = parseSvg(
      SVG_NS +
        '<g transform="translate(10,20)"><g transform="translate(3,5)"><rect x="1" y="2" width="1" height="1"/></g></g>' +
        '</svg>',
    );

    flattenTransforms(root);

    const rect = root.querySelector('rect')!;
    expect(rect.getAttribute('x')).toBe('14');
    expect(rect.getAttribute('y')).toBe('27');
  });

  it('does NOT flatten <g> with rotate/scale/matrix (保留非 translate 變換)', () => {
    const root = parseSvg(SVG_NS + '<g transform="rotate(45)"><rect x="5" y="5" width="3" height="4"/></g></svg>');

    flattenTransforms(root);

    // <g> 應該保留（因為含有 rotate）
    expect(root.querySelector('g')).not.toBeNull();
    // rect 座標不變
    const rect = root.querySelector('rect')!;
    expect(rect.getAttribute('x')).toBe('5');
    expect(rect.getAttribute('y')).toBe('5');
  });

  it('offsets <text> element x/y as well as <rect>', () => {
    const root = parseSvg(SVG_NS + '<g transform="translate(100,50)"><text x="20" y="30">hello</text></g></svg>');

    flattenTransforms(root);

    const text = root.querySelector('text')!;
    expect(text.getAttribute('x')).toBe('120');
    expect(text.getAttribute('y')).toBe('80');
  });
});
