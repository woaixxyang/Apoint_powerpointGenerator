/**
 * SVG sanitize / transform flattening / arc → bezier 純函式工具。
 * 不依賴 Gemini API，可獨立測試（tests/svgSanitize.test.ts）。
 */

/** PPT 不支援的標籤 */
export const PROHIBITED_TAGS = [
  'foreignObject', 'switch', 'style', 'script', 'link',
  'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feFlood',
  'feComposite', 'feMerge', 'feMergeNode', 'feColorMatrix',
  'clipPath', 'mask', 'pattern', 'use', 'symbol',
  'animate', 'animateTransform', 'animateMotion', 'set',
  'image', 'a'
];

/**
 * PPT 不支援的屬性（非 on* 類）
 *
 * 注意：`style` 不在此清單。inline style 由下面的提取邏輯（line ~798）把
 * fill / stroke / opacity 等屬性轉成 SVG attribute 後，才移除 style 本身。
 * 若放在這裡會先被移除，提取邏輯永遠跑不到（dead code）。
 */
export const PROHIBITED_ATTRS = [
  'class', 'id', 'data-name',
  'dominant-baseline', 'alignment-baseline',
  'clip-path', 'mask', 'filter',
];

/** inline style 中需提取為 SVG attribute 的屬性名稱 */
export const SVG_STYLE_ATTRS = [
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap',
  'opacity', 'fill-opacity', 'stroke-opacity',
  'font-size', 'font-weight', 'font-family', 'font-style',
  'text-anchor', 'letter-spacing',
];

/** 根據文字內容選擇字型：含 CJK 字元使用 Noto Sans TC，否則 Montserrat */
export const pickFont = (text: string): string => {
  if (/[　-鿿가-힯豈-﫿]/.test(text)) {
    return "Montserrat, 'Noto Sans TC', sans-serif";
  }
  return 'Montserrat, sans-serif';
};

const errorSvg = (msg: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
    <rect width="960" height="540" fill="#f8d7da" />
    <text x="480" y="270" font-family="Arial" font-size="20" fill="#721c24" text-anchor="middle">${msg}</text>
  </svg>`;

// ─── SVG Transform Flattening ─────────────────────────────────────────────
// PPT 的 SVG→EMF 轉換器無法正確處理 <g transform="translate(x,y)">，
// 此函式遞迴展開所有 translate 群組，將座標直接寫入子元素。

/** 從 transform 屬性中解析 translate(dx, dy)，僅在純 translate 時回傳 */
const parseTranslate = (transform: string | null): { dx: number; dy: number } | null => {
  if (!transform) return null;
  // 安全檢查：若含有 rotate/scale/matrix/skew，不展開（會遺失非 translate 變換）
  if (/(?:rotate|scale|matrix|skew)\s*\(/i.test(transform)) return null;
  // 分隔符：空白/逗號，或「下一個數字以正負號開頭」（合法 SVG 可省略分隔符，如 translate(10-5)）
  const m = transform.match(/translate\(\s*([+-]?[\d.]+)(?:[\s,]+|(?=[+-]))([+-]?[\d.]+)\s*\)/);
  if (m) return { dx: parseFloat(m[1]), dy: parseFloat(m[2]) };
  // translate(x) — y defaults to 0
  const m2 = transform.match(/translate\(\s*([+-]?[\d.]+)\s*\)/);
  if (m2) return { dx: parseFloat(m2[1]), dy: 0 };
  return null;
};

/** 將數值屬性偏移指定量（屬性不存在時視為預設值 0，設為 delta） */
const offsetNumAttr = (el: Element, attr: string, delta: number) => {
  const raw = el.getAttribute(attr);
  if (raw != null) {
    el.setAttribute(attr, String(parseFloat(raw) + delta));
  } else if (delta !== 0) {
    el.setAttribute(attr, String(delta));
  }
};

/**
 * 偏移 <path> d 屬性中的絕對座標指令
 * 僅偏移大寫（絕對）指令：M, L, C, S, Q, T, A, H, V
 * 小寫（相對）指令不需要偏移
 */
const offsetPathD = (d: string, dx: number, dy: number): string => {
  if (dx === 0 && dy === 0) return d;

  const tokens = d.match(/[a-zA-Z][^a-zA-Z]*/g);
  if (!tokens) return d;

  return tokens.map(token => {
    const cmd = token[0];
    const paramsStr = token.substring(1).trim();
    if (!paramsStr) return token;

    const nums = paramsStr.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g);
    if (!nums) return token;

    const values = nums.map(Number);

    switch (cmd) {
      case 'M': case 'L': case 'T': {
        for (let i = 0; i < values.length; i += 2) {
          values[i] += dx;
          if (i + 1 < values.length) values[i + 1] += dy;
        }
        break;
      }
      case 'H': {
        for (let i = 0; i < values.length; i++) values[i] += dx;
        break;
      }
      case 'V': {
        for (let i = 0; i < values.length; i++) values[i] += dy;
        break;
      }
      case 'C': {
        for (let i = 0; i < values.length; i += 2) {
          values[i] += dx;
          if (i + 1 < values.length) values[i + 1] += dy;
        }
        break;
      }
      case 'S': case 'Q': {
        for (let i = 0; i < values.length; i += 2) {
          values[i] += dx;
          if (i + 1 < values.length) values[i + 1] += dy;
        }
        break;
      }
      case 'A': {
        // Arc 特殊解析：A rx ry x-rot large-arc-flag sweep-flag x y
        // flags 是 0|1 可無分隔符相鄰（如 "01"），通用 regex 無法正確拆分
        const arcRe = /([+-]?[\d.]+)[\s,]*([+-]?[\d.]+)[\s,]*([+-]?[\d.]+)[\s,]*([01])[\s,]*([01])[\s,]*([+-]?[\d.]+)[\s,]*([+-]?[\d.]+)/g;
        let arcResult = cmd;
        let arcMatch;
        while ((arcMatch = arcRe.exec(paramsStr)) !== null) {
          const [, rx, ry, xRot, largeArc, sweep, ex, ey] = arcMatch;
          arcResult += `${rx} ${ry} ${xRot} ${largeArc} ${sweep} ${Number(ex) + dx} ${Number(ey) + dy} `;
        }
        return arcResult.trimEnd();
      }
      default:
        return token;
    }
    return cmd + values.join(' ');
  }).join('');
};

/** 偏移 points 屬性（polygon / polyline） */
const offsetPoints = (points: string, dx: number, dy: number): string => {
  if (dx === 0 && dy === 0) return points;
  const nums = points.trim().split(/[\s,]+/).map(Number);
  const result: number[] = [];
  for (let i = 0; i < nums.length; i += 2) {
    result.push(nums[i] + dx);
    if (i + 1 < nums.length) result.push(nums[i + 1] + dy);
  }
  return result.join(' ');
};

/** 偏移單一元素的座標屬性 */
const offsetElementCoords = (el: Element, dx: number, dy: number) => {
  if (dx === 0 && dy === 0) return;
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'rect':
      offsetNumAttr(el, 'x', dx);
      offsetNumAttr(el, 'y', dy);
      break;
    case 'circle':
    case 'ellipse':
      offsetNumAttr(el, 'cx', dx);
      offsetNumAttr(el, 'cy', dy);
      break;
    case 'line':
      offsetNumAttr(el, 'x1', dx);
      offsetNumAttr(el, 'y1', dy);
      offsetNumAttr(el, 'x2', dx);
      offsetNumAttr(el, 'y2', dy);
      break;
    case 'text':
      offsetNumAttr(el, 'x', dx);
      offsetNumAttr(el, 'y', dy);
      el.querySelectorAll('tspan').forEach(ts => {
        if (ts.hasAttribute('x')) offsetNumAttr(ts, 'x', dx);
        if (ts.hasAttribute('y')) offsetNumAttr(ts, 'y', dy);
      });
      break;
    case 'path': {
      const d = el.getAttribute('d');
      if (d) el.setAttribute('d', offsetPathD(d, dx, dy));
      break;
    }
    case 'polygon':
    case 'polyline': {
      const pts = el.getAttribute('points');
      if (pts) el.setAttribute('points', offsetPoints(pts, dx, dy));
      break;
    }
  }
};

/**
 * 遞迴展開所有 <g transform="translate(...)"> 群組，
 * 將座標直接寫入子元素，使 SVG 不依賴群組 transform。
 * 無 transform 的 <g> 保留作為邏輯分組。
 */
/** 可從 <g> 繼承到子元素的 SVG 屬性 */
const INHERITABLE_ATTRS = [
  'fill', 'stroke', 'stroke-width', 'font-family', 'font-size',
  'font-weight', 'opacity', 'text-anchor', 'letter-spacing',
  'fill-opacity', 'stroke-opacity',
];

/** 將 <g> 的可繼承屬性向下傳遞到直接子元素（僅補缺，不覆蓋） */
const propagateInheritedAttrs = (gEl: Element) => {
  for (const attr of INHERITABLE_ATTRS) {
    const val = gEl.getAttribute(attr);
    if (!val) continue;
    for (const child of Array.from(gEl.children)) {
      if (!child.hasAttribute(attr)) {
        child.setAttribute(attr, val);
      }
    }
  }
};

export const flattenTransforms = (root: Element) => {
  const processNode = (node: Element, accDx: number, accDy: number) => {
    const children = Array.from(node.children);

    for (const child of children) {
      if (child.tagName.toLowerCase() === 'g') {
        const translate = parseTranslate(child.getAttribute('transform'));
        if (translate) {
          const newDx = accDx + translate.dx;
          const newDy = accDy + translate.dy;
          processNode(child, newDx, newDy);
          // 移除 <g> 前，將其繼承屬性下發到子元素
          propagateInheritedAttrs(child);
          while (child.firstChild) {
            node.insertBefore(child.firstChild, child);
          }
          child.remove();
        } else {
          processNode(child, accDx, accDy);
        }
      } else {
        offsetElementCoords(child, accDx, accDy);
        if (child.children.length > 0) {
          processNode(child, 0, 0);
        }
      }
    }
  };

  processNode(root, 0, 0);
};

/**
 * SVG Arc → Cubic Bezier 轉換
 * PPT 的 SVG 解析器對 Arc (A) 指令支援差，轉為 C 指令可確保圓角正確顯示
 * 演算法來自 W3C SVG Implementation Notes (F.6)
 */
const arcToCubicBeziers = (
  x1: number, y1: number,
  rx: number, ry: number,
  xAxisRotation: number,
  largeArcFlag: number,
  sweepFlag: number,
  x2: number, y2: number
): number[][] => {
  // 退化情況
  if (rx === 0 || ry === 0) return [[x2, y2]]; // 直線

  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (xAxisRotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // Step 1: 計算 (x1', y1')
  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  // Step 2: 校正半徑（確保橢圓夠大）
  let rxSq = rx * rx;
  let rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;
  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx *= sqrtLambda;
    ry *= sqrtLambda;
    rxSq = rx * rx;
    rySq = ry * ry;
  }

  // Step 3: 計算圓心 (cx', cy')
  let num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
  let den = rxSq * y1pSq + rySq * x1pSq;
  if (num < 0) num = 0;
  let sq = Math.sqrt(num / den);
  if (largeArcFlag === sweepFlag) sq = -sq;
  const cxp = sq * (rx * y1p) / ry;
  const cyp = sq * -(ry * x1p) / rx;

  // Step 4: 計算圓心 (cx, cy)
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  // Step 5: 計算 θ1 和 dθ
  const vectorAngle = (ux: number, uy: number, vx: number, vy: number): number => {
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    let cos = dot / len;
    if (cos < -1) cos = -1;
    if (cos > 1) cos = 1;
    return sign * Math.acos(cos);
  };

  const theta1 = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = vectorAngle(
    (x1p - cxp) / rx, (y1p - cyp) / ry,
    (-x1p - cxp) / rx, (-y1p - cyp) / ry
  );

  if (sweepFlag === 0 && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweepFlag === 1 && dTheta < 0) dTheta += 2 * Math.PI;

  // 分割成 ≤ 90° 的圓弧段，每段用一條 cubic bezier 近似
  const segments = Math.ceil(Math.abs(dTheta) / (Math.PI / 2));
  const delta = dTheta / segments;
  const t = (4 / 3) * Math.tan(delta / 4);

  const curves: number[][] = [];
  let angle = theta1;

  for (let i = 0; i < segments; i++) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const cosA2 = Math.cos(angle + delta);
    const sinA2 = Math.sin(angle + delta);

    // 橢圓上的控制點（未旋轉）
    const ep1x = rx * cosA;
    const ep1y = ry * sinA;
    const ep2x = rx * cosA2;
    const ep2y = ry * sinA2;

    const cp1x = ep1x - t * rx * sinA;
    const cp1y = ep1y + t * ry * cosA;
    const cp2x = ep2x + t * rx * sinA2;
    const cp2y = ep2y - t * ry * cosA2;

    // 旋轉 + 平移至實際位置
    curves.push([
      cosPhi * cp1x - sinPhi * cp1y + cx,
      sinPhi * cp1x + cosPhi * cp1y + cy,
      cosPhi * cp2x - sinPhi * cp2y + cx,
      sinPhi * cp2x + cosPhi * cp2y + cy,
      cosPhi * ep2x - sinPhi * ep2y + cx,
      sinPhi * ep2x + cosPhi * ep2y + cy,
    ]);
    angle += delta;
  }

  return curves;
};

/**
 * 將 <path> d 屬性中的 Arc (A/a) 指令轉為 Cubic Bezier (C/c)
 * PPT 對 A 指令支援差，但對 C 指令支援良好
 */
export const convertArcsInPath = (d: string): string => {
  // 快速檢查：無 arc 指令則直接返回
  if (!/[Aa]/.test(d)) return d;

  const tokens = d.match(/[a-zA-Z][^a-zA-Z]*/g);
  if (!tokens) return d;

  let curX = 0, curY = 0;
  let startX = 0, startY = 0;

  const result: string[] = [];

  for (const token of tokens) {
    const cmd = token[0];
    const paramsStr = token.substring(1).trim();

    // 更新當前位置（用於後續 arc 轉換需要起始點）
    if (cmd === 'A' || cmd === 'a') {
      // Arc 指令 — 逐一解析並轉為 cubic bezier
      const arcRe = /([+-]?[\d.]+)[\s,]*([+-]?[\d.]+)[\s,]*([+-]?[\d.]+)[\s,]*([01])[\s,]*([01])[\s,]*([+-]?[\d.]+)[\s,]*([+-]?[\d.]+)/g;
      let arcMatch;
      while ((arcMatch = arcRe.exec(paramsStr)) !== null) {
        let [, rxS, ryS, xRotS, laFlagS, swFlagS, exS, eyS] = arcMatch;
        let arcRx = Number(rxS), arcRy = Number(ryS), xRot = Number(xRotS);
        let laFlag = Number(laFlagS), swFlag = Number(swFlagS);
        let endX = Number(exS), endY = Number(eyS);

        if (cmd === 'a') {
          // 相對座標 → 絕對座標
          endX += curX;
          endY += curY;
        }

        const curves = arcToCubicBeziers(curX, curY, arcRx, arcRy, xRot, laFlag, swFlag, endX, endY);

        for (const c of curves) {
          if (c.length === 2) {
            // 退化為直線
            result.push(`L${c[0].toFixed(2)} ${c[1].toFixed(2)}`);
          } else {
            result.push(`C${c.map(v => v.toFixed(2)).join(' ')}`);
          }
        }

        curX = endX;
        curY = endY;
      }
      continue;
    }

    // 非 arc 指令：原樣保留，但追蹤當前位置
    result.push(token);

    if (!paramsStr) {
      if (cmd === 'Z' || cmd === 'z') { curX = startX; curY = startY; }
      continue;
    }

    const nums = paramsStr.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g);
    if (!nums) continue;
    const values = nums.map(Number);

    switch (cmd) {
      case 'M':
        if (values.length >= 2) { curX = values[values.length - 2]; curY = values[values.length - 1]; startX = values[0]; startY = values[1]; }
        break;
      case 'm':
        // m dx0 dy0 dx1 dy1 ... → moveto + implicit relative lineto；需累加所有 pair
        if (values.length >= 2) {
          for (let i = 0; i + 1 < values.length; i += 2) { curX += values[i]; curY += values[i + 1]; }
          startX = curX; startY = curY;
        }
        break;
      case 'L': case 'T':
        if (values.length >= 2) { curX = values[values.length - 2]; curY = values[values.length - 1]; }
        break;
      case 'l': case 't':
        if (values.length >= 2) { curX += values[values.length - 2]; curY += values[values.length - 1]; }
        break;
      case 'H':
        curX = values[values.length - 1];
        break;
      case 'h':
        curX += values[values.length - 1];
        break;
      case 'V':
        curY = values[values.length - 1];
        break;
      case 'v':
        curY += values[values.length - 1];
        break;
      case 'C':
        if (values.length >= 6) { curX = values[values.length - 2]; curY = values[values.length - 1]; }
        break;
      case 'c':
        if (values.length >= 6) { curX += values[values.length - 2]; curY += values[values.length - 1]; }
        break;
      case 'S': case 'Q':
        if (values.length >= 4) { curX = values[values.length - 2]; curY = values[values.length - 1]; }
        break;
      case 's': case 'q':
        if (values.length >= 4) { curX += values[values.length - 2]; curY += values[values.length - 1]; }
        break;
      case 'Z': case 'z':
        curX = startX; curY = startY;
        break;
    }
  }

  return result.join('');
};

export const sanitizeSvg = (svg: string): string => {
  const canvasHeight = 540;
  if (!svg) return errorSvg("Empty SVG");

  let clean = svg
    .replace(/```(?:xml|svg|html)?\s*/g, '')
    .replace(/```/g, '')
    .replace(/<\?xml[^?]*\?>/gi, '')
    .trim();

  clean = clean.replace(/<defs[\s\S]*?<\/defs>/gi, '');
  clean = clean.replace(/<defs[^>]*\/>/gi, '');
  clean = clean.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
  clean = clean.replace(/<foreignObject[^>]*\/>/gi, '');
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');

  const svgStartIndex = clean.indexOf('<svg');
  if (svgStartIndex === -1) return errorSvg("No SVG root found");
  clean = clean.substring(svgStartIndex);

  const svgEndIndex = clean.lastIndexOf('</svg>');
  if (svgEndIndex !== -1) {
    clean = clean.substring(0, svgEndIndex + 6);
  } else {
    // AI 輸出被截斷，沒有 </svg> — 嘗試補閉合
    console.warn("[sanitizeSvg] </svg> missing — attempting auto-close");
    // 關閉所有可能未閉合的 <g> tag，再補 </svg>
    const openGs = (clean.match(/<g[\s>]/g) || []).length;
    const closeGs = (clean.match(/<\/g>/g) || []).length;
    const unclosed = openGs - closeGs;
    for (let i = 0; i < unclosed; i++) {
      clean += '</g>';
    }
    clean += '</svg>';
  }

  // Fix: 修復文字內容中的裸 & 符號（如 Q&A, R&D）避免 XML parse 失敗
  // 只替換不屬於 XML entity 的裸 & (不在 &amp; &lt; &gt; &quot; &apos; &#xx; 前面)
  clean = clean.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(clean, "image/svg+xml");

    if (doc.querySelector("parsererror")) {
      console.error("[sanitizeSvg] SVG parse error, raw SVG (first 500 chars):", clean.substring(0, 500));
      console.error("[sanitizeSvg] parseerror detail:", doc.querySelector("parsererror")?.textContent);
      return errorSvg("SVG Parse Error");
    }

    const svgEl = doc.documentElement;

    const selector = PROHIBITED_TAGS.join(', ');
    doc.querySelectorAll(selector).forEach(el => el.remove());
    doc.querySelectorAll('defs').forEach(el => el.remove());

    const allElements = doc.querySelectorAll('*');
    allElements.forEach(el => {
      PROHIBITED_ATTRS.forEach(attr => el.removeAttribute(attr));
      // 移除所有 on* 事件屬性（用 allowlist 外的全掃，不依賴明細清單）
      el.getAttributeNames()
        .filter(a => a.startsWith('on'))
        .forEach(a => el.removeAttribute(a));
      el.removeAttribute('href');
      el.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');

      const fill = el.getAttribute('fill');
      if (fill && fill.startsWith('url(')) el.setAttribute('fill', '#CCCCCC');
      const stroke = el.getAttribute('stroke');
      if (stroke && stroke.startsWith('url(')) el.setAttribute('stroke', '#999999');

      const inlineStyle = el.getAttribute('style');
      if (inlineStyle) {
        // 用 regex 逐一比對，避免 split(':') 截斷含冒號的值（如 data: URI）
        SVG_STYLE_ATTRS.forEach(prop => {
          const m = inlineStyle.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
          if (m) el.setAttribute(prop, m[1].trim());
        });
        el.removeAttribute('style');
      }
    });

    // 展開所有 <g transform="translate(...)"> 為絕對座標（PPT 解構相容性）
    flattenTransforms(svgEl);
    // 注意：不在此處執行 flattenTspans()。
    // PPT 以 SVG 圖片嵌入，瀏覽器與 PPT 都能正確渲染 <tspan>，
    // 拆解 tspan 反而破壞多行文字結構與位置。

    // 統一使用 CSS fallback 字型堆疊：Montserrat 渲染英文，Noto Sans TC 渲染中文
    const fallbackFontFamily = "Montserrat, 'Noto Sans TC', sans-serif";
    doc.querySelectorAll('text').forEach(textEl => {
      textEl.setAttribute('font-family', fallbackFontFamily);
      textEl.querySelectorAll('tspan').forEach(ts => {
        ts.setAttribute('font-family', fallbackFontFamily);
      });
    });

    svgEl.setAttribute('width', '960');
    svgEl.setAttribute('height', String(canvasHeight));
    svgEl.setAttribute('viewBox', `0 0 960 ${canvasHeight}`);
    svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgEl.removeAttribute('xmlns:xlink');

    clean = new XMLSerializer().serializeToString(doc);
    // XMLSerializer 可能重新注入命名空間屬性，清除以確保 PPT 相容性
    clean = clean.replace(/\s+xmlns:xlink="[^"]*"/g, '');
    clean = clean.replace(/\s+xml:space="[^"]*"/g, '');
  } catch (e) {
    console.error("DOM Sanitization failed:", e);
    return errorSvg("SVG Sanitization Error");
  }

  const lower = clean.toLowerCase();
  if (lower.includes('foreignobject') || lower.includes('<script') || lower.includes('<image')) {
    return errorSvg("Render Error: Unsupported Tag");
  }

  return clean;
};
