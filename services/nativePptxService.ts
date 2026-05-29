
import PptxGenJS from 'pptxgenjs';
import { SlideData, SlideImageOverlay } from '../types';
import { prepareSvgForPpt } from './geminiService';
import { embedFontsAndSave, CJK_FONT_NAME, LATIN_FONT_NAME, PPTX_MIME } from './fontEmbedService';
import { triggerBlobDownload } from '../utils/download';

// ── 常數 ────────────────────────────────────────────
const SLIDE_W = 10;       // inches
const SLIDE_H = 5.625;    // inches
const SVG_W = 960;        // pixels
const SVG_H = 540;        // pixels

// ── 座標轉換 ────────────────────────────────────────
const px2inX = (px: number) => (px / SVG_W) * SLIDE_W;
const px2inY = (px: number) => (px / SVG_H) * SLIDE_H;
const safeNum = (v: number): number => (isFinite(v) && !isNaN(v)) ? v : 0;
const safePx2inX = (px: number): number => safeNum(px2inX(safeNum(px)));
const safePx2inY = (px: number): number => safeNum(px2inY(safeNum(px)));

// ── 顏色轉換 ────────────────────────────────────────
const CSS_NAMED_COLORS: Record<string, string> = {
  white: 'FFFFFF', black: '000000', red: 'FF0000', green: '008000',
  blue: '0000FF', yellow: 'FFFF00', orange: 'FFA500', purple: '800080',
  pink: 'FFC0CB', gray: '808080', grey: '808080',
  cyan: '00FFFF', magenta: 'FF00FF', lime: '00FF00', navy: '000080',
  teal: '008080', silver: 'C0C0C0', maroon: '800000', olive: '808000',
  coral: 'FF7F50', salmon: 'FA8072', gold: 'FFD700', indigo: '4B0082',
  violet: 'EE82EE', brown: 'A52A2A', beige: 'F5F5DC', ivory: 'FFFFF0',
  khaki: 'F0E68C', lavender: 'E6E6FA', mint: '98FF98',
};

const parseColor = (color: string | null | undefined): string | undefined => {
  if (!color || color === 'none' || color === 'transparent') return undefined;
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return (hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]).toUpperCase();
    }
    return hex.toUpperCase();
  }
  const rgbMatch = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return [r, g, b].map(v => parseInt(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  const named = CSS_NAMED_COLORS[color.toLowerCase()];
  if (named !== undefined) return named || undefined;
  return undefined;
};

const getAttr = (el: Element, name: string): string | null => el.getAttribute(name);
const getNum = (el: Element, name: string, fallback = 0): number => {
  const v = el.getAttribute(name);
  if (v == null) return fallback;
  const n = parseFloat(v);
  return isFinite(n) ? n : fallback;
};

// ── px → pt ─────────────────────────────────────────
const px2pt = (px: number): number => Math.round(px * 0.75 * 10) / 10;

// ── CJK 偵測 ────────────────────────────────────────
const CJK_REGEX = /[\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F\uFF00-\uFFEF\u2E80-\u2FDF\u31F0-\u31FF\uFE30-\uFE4F]/;
const isCJK = (ch: string): boolean => CJK_REGEX.test(ch);

const splitTextByFont = (
  text: string, baseFontSize: number, baseColor: string, baseBold: boolean
): PptxGenJS.TextProps[] => {
  if (!text) return [];
  const parts: PptxGenJS.TextProps[] = [];
  let currentRun = '';
  let currentIsCJK = isCJK(text[0]);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const chIsCJK = isCJK(ch);
    if (chIsCJK !== currentIsCJK && currentRun) {
      parts.push({
        text: currentRun,
        options: {
          fontSize: baseFontSize,
          fontFace: currentIsCJK ? CJK_FONT_NAME : LATIN_FONT_NAME,
          color: baseColor, bold: baseBold,
        }
      });
      currentRun = '';
      currentIsCJK = chIsCJK;
    }
    currentRun += ch;
  }
  if (currentRun) {
    parts.push({
      text: currentRun,
      options: {
        fontSize: baseFontSize,
        fontFace: currentIsCJK ? CJK_FONT_NAME : LATIN_FONT_NAME,
        color: baseColor, bold: baseBold,
      }
    });
  }
  return parts;
};

// ── SVG Path 解析器（安全版）─────────────────────────
// 回傳 PptxGenJS points 格式，每個座標都經過 safeNum 檢查
const parseSvgPath = (d: string): any[] => {
  const points: any[] = [];
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
  if (!tokens) return points;

  let cx = 0, cy = 0;
  let idx = 0;
  let cmd = '';

  const nextNum = (): number => {
    while (idx < tokens.length && /[A-Za-z]/.test(tokens[idx])) idx++;
    if (idx >= tokens.length) return 0;
    const val = parseFloat(tokens[idx]) || 0;
    idx++;
    return val;
  };

  while (idx < tokens.length) {
    const token = tokens[idx];
    if (/^[A-Za-z]$/.test(token)) {
      cmd = token;
      idx++;
      if (cmd === 'Z' || cmd === 'z') {
        points.push({ close: true });
        continue;
      }
    } else if (!cmd) {
      idx++;
      continue;
    }

    try {
      switch (cmd) {
        case 'M':
          cx = nextNum(); cy = nextNum();
          points.push({ x: safePx2inX(cx), y: safePx2inY(cy), moveTo: true });
          cmd = 'L'; // 後續隱式 L
          break;
        case 'm':
          cx += nextNum(); cy += nextNum();
          points.push({ x: safePx2inX(cx), y: safePx2inY(cy), moveTo: true });
          cmd = 'l';
          break;
        case 'L':
          cx = nextNum(); cy = nextNum();
          points.push({ x: safePx2inX(cx), y: safePx2inY(cy) });
          break;
        case 'l':
          cx += nextNum(); cy += nextNum();
          points.push({ x: safePx2inX(cx), y: safePx2inY(cy) });
          break;
        case 'H':
          cx = nextNum();
          points.push({ x: safePx2inX(cx), y: safePx2inY(cy) });
          break;
        case 'h':
          cx += nextNum();
          points.push({ x: safePx2inX(cx), y: safePx2inY(cy) });
          break;
        case 'V':
          cy = nextNum();
          points.push({ x: safePx2inX(cx), y: safePx2inY(cy) });
          break;
        case 'v':
          cy += nextNum();
          points.push({ x: safePx2inX(cx), y: safePx2inY(cy) });
          break;
        case 'C': {
          const x1 = nextNum(), y1 = nextNum(), x2 = nextNum(), y2 = nextNum();
          cx = nextNum(); cy = nextNum();
          points.push({
            x: safePx2inX(cx), y: safePx2inY(cy),
            curve: { type: 'cubic', x1: safePx2inX(x1), y1: safePx2inY(y1), x2: safePx2inX(x2), y2: safePx2inY(y2) }
          });
          break;
        }
        case 'c': {
          const dx1 = nextNum(), dy1 = nextNum(), dx2 = nextNum(), dy2 = nextNum(), dx = nextNum(), dy = nextNum();
          const ax1 = cx + dx1, ay1 = cy + dy1, ax2 = cx + dx2, ay2 = cy + dy2;
          cx += dx; cy += dy;
          points.push({
            x: safePx2inX(cx), y: safePx2inY(cy),
            curve: { type: 'cubic', x1: safePx2inX(ax1), y1: safePx2inY(ay1), x2: safePx2inX(ax2), y2: safePx2inY(ay2) }
          });
          break;
        }
        case 'Q': {
          const x1 = nextNum(), y1 = nextNum();
          cx = nextNum(); cy = nextNum();
          points.push({
            x: safePx2inX(cx), y: safePx2inY(cy),
            curve: { type: 'quadratic', x1: safePx2inX(x1), y1: safePx2inY(y1) }
          });
          break;
        }
        case 'q': {
          const dx1 = nextNum(), dy1 = nextNum(), dx = nextNum(), dy = nextNum();
          const ax1 = cx + dx1, ay1 = cy + dy1;
          cx += dx; cy += dy;
          points.push({
            x: safePx2inX(cx), y: safePx2inY(cy),
            curve: { type: 'quadratic', x1: safePx2inX(ax1), y1: safePx2inY(ay1) }
          });
          break;
        }
        case 'S': case 's': {
          // smooth cubic bezier: S x2 y2 x y（省略反射控制點，直接記錄終點）
          nextNum(); nextNum(); // x2 y2（控制點，跳過）
          const sx = nextNum(), sy = nextNum();
          if (cmd === 'S') { cx = sx; cy = sy; } else { cx += sx; cy += sy; }
          points.push({ x: safePx2inX(cx), y: safePx2inY(cy) });
          break;
        }
        case 'T': case 't': {
          // smooth quadratic bezier: T x y
          const tx = nextNum(), ty = nextNum();
          if (cmd === 'T') { cx = tx; cy = ty; } else { cx += tx; cy += ty; }
          points.push({ x: safePx2inX(cx), y: safePx2inY(cy) });
          break;
        }
        case 'A': case 'a': {
          // arc: A rx ry x-rotation large-arc-flag sweep-flag x y
          nextNum(); nextNum(); nextNum(); nextNum(); nextNum(); // rx ry rot flag flag
          const ax = nextNum(), ay = nextNum();
          if (cmd === 'A') { cx = ax; cy = ay; } else { cx += ax; cy += ay; }
          points.push({ x: safePx2inX(cx), y: safePx2inY(cy) });
          break;
        }
        default:
          idx++;
          break;
      }
    } catch {
      idx++;
    }
  }

  // 驗證：移除任何含 NaN/Infinity 的點
  return points.filter((p: any) => {
    if (p.close) return true;
    if (!isFinite(p.x) || !isFinite(p.y)) return false;
    if (p.curve) {
      if (!isFinite(p.curve.x1) || !isFinite(p.curve.y1)) return false;
      if (p.curve.type === 'cubic' && (!isFinite(p.curve.x2) || !isFinite(p.curve.y2))) return false;
    }
    return true;
  });
};

// ── 原生形狀渲染器 ──────────────────────────────────

const renderRect = (slide: PptxGenJS.Slide, el: Element) => {
  const x = getNum(el, 'x');
  const y = getNum(el, 'y');
  const w = getNum(el, 'width');
  const h = getNum(el, 'height');
  if (w <= 0 || h <= 0) return;

  const rx = getNum(el, 'rx');
  const fill = parseColor(getAttr(el, 'fill'));
  const stroke = parseColor(getAttr(el, 'stroke'));
  const strokeWidth = getNum(el, 'stroke-width');
  const opacity = getAttr(el, 'opacity');

  const opts: any = { x: px2inX(x), y: px2inY(y), w: px2inX(w), h: px2inY(h) };
  if (fill) opts.fill = { color: fill, transparency: opacity ? Math.round((1 - parseFloat(opacity)) * 100) : 0 };
  if (stroke && strokeWidth > 0) opts.line = { color: stroke, width: strokeWidth * 0.75 };

  if (rx > 0) {
    opts.rectRadius = px2inX(rx);
    slide.addShape('roundRect' as any, opts);
  } else {
    slide.addShape('rect' as any, opts);
  }
};

const renderEllipse = (slide: PptxGenJS.Slide, el: Element) => {
  const tag = el.tagName.toLowerCase();
  let cx: number, cy: number, rx: number, ry: number;
  if (tag === 'circle') {
    cx = getNum(el, 'cx'); cy = getNum(el, 'cy');
    rx = ry = getNum(el, 'r');
  } else {
    cx = getNum(el, 'cx'); cy = getNum(el, 'cy');
    rx = getNum(el, 'rx'); ry = getNum(el, 'ry');
  }
  if (rx <= 0 || ry <= 0) return;

  const fill = parseColor(getAttr(el, 'fill'));
  const stroke = parseColor(getAttr(el, 'stroke'));
  const strokeWidth = getNum(el, 'stroke-width');

  const opts: any = { x: px2inX(cx - rx), y: px2inY(cy - ry), w: px2inX(rx * 2), h: px2inY(ry * 2) };
  if (fill) opts.fill = { color: fill };
  if (stroke && strokeWidth > 0) opts.line = { color: stroke, width: strokeWidth * 0.75 };
  slide.addShape('ellipse' as any, opts);
};

const renderLine = (slide: PptxGenJS.Slide, el: Element) => {
  const x1 = getNum(el, 'x1'), y1 = getNum(el, 'y1');
  const x2 = getNum(el, 'x2'), y2 = getNum(el, 'y2');
  const stroke = parseColor(getAttr(el, 'stroke')) || '999999';
  const strokeWidth = getNum(el, 'stroke-width', 1);

  // OOXML 要求 cx/cy 為非負值；正規化起點為左上角，方向用 flipH/flipV 表示
  slide.addShape('line' as any, {
    x: px2inX(Math.min(x1, x2)), y: px2inY(Math.min(y1, y2)),
    w: px2inX(Math.abs(x2 - x1)), h: px2inY(Math.abs(y2 - y1)),
    line: { color: stroke, width: strokeWidth * 0.75 },
    flipH: x2 < x1,
    flipV: y2 < y1,
  });
};

const renderText = (slide: PptxGenJS.Slide, el: Element) => {
  const x = getNum(el, 'x');
  const y = getNum(el, 'y');
  const fontSizePx = getNum(el, 'font-size', 16);
  const fontSizePt = px2pt(fontSizePx);
  const fill = parseColor(getAttr(el, 'fill')) || '333333';
  const fontWeight = getAttr(el, 'font-weight');
  const textAnchor = getAttr(el, 'text-anchor');
  const isBold = fontWeight === 'bold' || fontWeight === '700';

  const emitLine = (
    parts: PptxGenJS.TextProps[],
    lineX: number,
    lineY: number,
    lineFontSizePx: number
  ) => {
    if (parts.length === 0) return;
    const fullText = parts.map(p => p.text).join('');
    const estWidth = Math.max(
      [...fullText].reduce((w, ch) => w + (isCJK(ch) ? lineFontSizePx : lineFontSizePx * 0.55), 0), 80
    );
    const textY = lineY - lineFontSizePx * 0.85;
    let align: 'left' | 'center' | 'right' = 'left';
    let textX = lineX;
    if (textAnchor === 'middle') { align = 'center'; textX = lineX - estWidth / 2; }
    else if (textAnchor === 'end') { align = 'right'; textX = lineX - estWidth; }
    slide.addText(parts, {
      x: px2inX(Math.max(0, textX)),
      y: px2inY(Math.max(0, textY)),
      w: px2inX(Math.min(estWidth, SVG_W - Math.max(0, textX))),
      h: px2inY(lineFontSizePx * 1.4),
      align, valign: 'top', wrap: false, margin: 0,
    });
  };

  // 只取直接子 tspan
  const tspans = Array.from(el.children).filter(c => c.tagName.toLowerCase() === 'tspan');

  // 判斷 tspan 是否需要「分別 emit」：以下任一條件成立都要分開
  //   (a) 多行：tspan y 跟父 text 不同
  //   (b) 多欄：tspan x 跟父 text 不同（Gemini 常把「1. 標題」拆成同 y 不同 x 兩個 tspan，
  //            這時必須各自落在自己的 x，不能塞同一個 text frame）
  // 注意：prepareSvgForPpt.resolveTspanPositions 會幫每個 tspan 補 x/y（inline 補成跟父一樣），
  //       所以不能看「有沒有屬性」，必須比較「值是否與父不同」。
  // 純 inline（tspan x/y 都跟父一樣）：合併成「一個 text frame 內多個 run」，
  //   否則拆開後個別套 text-anchor=middle 會全部置中於同一個 x → 重疊（slide 2 的 bug）。
  const hasDistinctTspanPos = tspans.some(ts => {
    const tsY = ts.getAttribute('y');
    const tsX = ts.getAttribute('x');
    return (tsY !== null && parseFloat(tsY) !== y) ||
           (tsX !== null && parseFloat(tsX) !== x);
  });

  if (tspans.length > 0 && hasDistinctTspanPos) {
    // 多行 tspan：existing 邏輯（每個 tspan 自己 emit 一行）
    let curX = x;
    let curY = y;
    tspans.forEach(tspan => {
      const text = tspan.textContent || '';
      if (!text.trim()) return;

      const tsDx = getNum(tspan, 'dx', 0);
      const tsDy = getNum(tspan, 'dy', 0);
      const tsAbsY = tspan.getAttribute('y');
      const tsAbsX = tspan.getAttribute('x');
      const parsedY = tsAbsY !== null ? parseFloat(tsAbsY) : NaN;
      const parsedX = tsAbsX !== null ? parseFloat(tsAbsX) : NaN;
      curY = isFinite(parsedY) ? parsedY : curY + tsDy;
      curX = isFinite(parsedX) ? parsedX : curX + tsDx;

      const tsFontSizePx = getNum(tspan, 'font-size', fontSizePx);
      const tsFontSizePt = px2pt(tsFontSizePx);
      const tsFill = parseColor(getAttr(tspan, 'fill')) || fill;
      const tsFontWeight = getAttr(tspan, 'font-weight') || fontWeight;
      const tsBold = tsFontWeight === 'bold' || tsFontWeight === '700';
      emitLine(splitTextByFont(text, tsFontSizePt, tsFill, tsBold), curX, curY, tsFontSizePx);

      const tspanAdvance = [...text].reduce(
        (w, ch) => w + (isCJK(ch) ? tsFontSizePx : tsFontSizePx * 0.55), 0,
      );
      curX += tspanAdvance;
    });
  } else if (tspans.length > 0) {
    // 單行 tspan（無 y/dy）：收集 text node + tspan 的所有 run 到一個 text frame。
    // 用 childNodes 保留順序（包含直接文字節點與 tspan）。
    const runs: PptxGenJS.TextProps[] = [];
    for (const node of Array.from(el.childNodes)) {
      const nType: number = (node as any).nodeType;
      if (nType === 3) {
        // 文字節點
        const text = node.textContent || '';
        if (!text.trim()) continue;
        runs.push(...splitTextByFont(text, fontSizePt, fill, isBold));
      } else if (nType === 1 && (node as Element).tagName.toLowerCase() === 'tspan') {
        const tspan = node as Element;
        const text = tspan.textContent || '';
        if (!text.trim()) continue;
        const tsFontSizePx = getNum(tspan, 'font-size', fontSizePx);
        const tsFontSizePt = px2pt(tsFontSizePx);
        const tsFill = parseColor(getAttr(tspan, 'fill')) || fill;
        const tsFontWeight = getAttr(tspan, 'font-weight') || fontWeight;
        const tsBold = tsFontWeight === 'bold' || tsFontWeight === '700';
        runs.push(...splitTextByFont(text, tsFontSizePt, tsFill, tsBold));
      }
    }
    if (runs.length > 0) emitLine(runs, x, y, fontSizePx);
  } else {
    const text = el.textContent || '';
    if (!text.trim()) return;
    emitLine(splitTextByFont(text, fontSizePt, fill, isBold), x, y, fontSizePx);
  }
};

/**
 * 從 points 陣列計算 bounding box，並把每個 point 的座標相對 bbox 左上角正規化。
 * PptxGenJS 的 custGeom 要求 caller 提供 x/y/w/h（shape bbox），且 points 是
 * 相對 bbox 的座標。沒提供 bbox 時 PptxGenJS 用 1×1 inch 預設，path 內 absolute
 * 座標的點會被誤認為超出 viewport → 整個 path 被壓縮 / 跑位（slide 4 藍 header
 * 蓋住 item 2 的 bug）。
 */
const computePathBbox = (
  pts: any[],
): { x: number; y: number; w: number; h: number; normalized: any[] } | null => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const include = (x: number, y: number) => {
    if (!isFinite(x) || !isFinite(y)) return;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const p of pts) {
    if (p.close) continue;
    include(p.x, p.y);
    if (p.curve) {
      if (typeof p.curve.x1 === 'number') include(p.curve.x1, p.curve.y1);
      if (typeof p.curve.x2 === 'number') include(p.curve.x2, p.curve.y2);
    }
  }
  if (!isFinite(minX)) return null;
  const w = Math.max(maxX - minX, 0.001); // 避免 0 寬高
  const h = Math.max(maxY - minY, 0.001);
  const normalized = pts.map(p => {
    if (p.close) return p;
    const np: any = { x: p.x - minX, y: p.y - minY };
    if (p.moveTo) np.moveTo = true;
    if (p.curve) {
      np.curve = { ...p.curve };
      if (typeof p.curve.x1 === 'number') {
        np.curve.x1 = p.curve.x1 - minX;
        np.curve.y1 = p.curve.y1 - minY;
      }
      if (typeof p.curve.x2 === 'number') {
        np.curve.x2 = p.curve.x2 - minX;
        np.curve.y2 = p.curve.y2 - minY;
      }
    }
    return np;
  });
  return { x: minX, y: minY, w, h, normalized };
};

const renderPolygon = (slide: PptxGenJS.Slide, el: Element) => {
  const pointsAttr = getAttr(el, 'points');
  if (!pointsAttr) return;
  const fill = parseColor(getAttr(el, 'fill'));
  const stroke = parseColor(getAttr(el, 'stroke'));
  const strokeWidth = getNum(el, 'stroke-width');
  const isPolygon = el.tagName.toLowerCase() === 'polygon';

  const coords = pointsAttr.trim().split(/[\s,]+/).map(Number).filter(isFinite);
  if (coords.length < 4) return;

  const pts: any[] = [];
  for (let i = 0; i < coords.length - 1; i += 2) {
    const pt: any = { x: safePx2inX(coords[i]), y: safePx2inY(coords[i + 1]) };
    if (i === 0) pt.moveTo = true;
    pts.push(pt);
  }
  if (isPolygon && pts.length > 0) pts.push({ close: true });
  if (pts.length < 2) return;

  const bbox = computePathBbox(pts);
  if (!bbox) return;

  const opts: any = {
    points: bbox.normalized,
    x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h,
  };
  if (fill && fill !== 'NONE') opts.fill = { color: fill };
  // 無 fill 時必須給透明填充，否則 PowerPoint（特別是 Mac 版）會用預設黑色
  // 把 custGeom 內部填滿，<polyline fill="none"> 看起來像被黑色色塊遮住。
  else opts.fill = { color: 'FFFFFF', transparency: 100 };
  if (stroke && strokeWidth > 0) opts.line = { color: stroke, width: strokeWidth * 0.75 };
  slide.addShape('custGeom' as any, opts);
};

const renderPath = (slide: PptxGenJS.Slide, el: Element) => {
  const d = getAttr(el, 'd');
  if (!d || d.trim().length < 3) return;
  const fill = parseColor(getAttr(el, 'fill'));
  const stroke = parseColor(getAttr(el, 'stroke'));
  const strokeWidth = getNum(el, 'stroke-width');

  let pts: any[];
  try {
    pts = parseSvgPath(d);
  } catch {
    console.warn('[NativePPTX] Path parse failed, skip:', d.slice(0, 50));
    return;
  }
  // 確保至少有一個 moveTo + 一個點
  const realPoints = pts.filter((p: any) => !p.close);
  if (realPoints.length < 2) return;

  const bbox = computePathBbox(pts);
  if (!bbox) return;

  const opts: any = {
    points: bbox.normalized,
    x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h,
  };
  if (fill && fill !== 'NONE') opts.fill = { color: fill };
  else opts.fill = { color: 'FFFFFF', transparency: 100 }; // 透明填充防止黑底
  if (stroke && strokeWidth > 0) opts.line = { color: stroke, width: strokeWidth * 0.75 };
  slide.addShape('custGeom' as any, opts);
};

// ── SVG 遍歷 ────────────────────────────────────────
const renderSvgElement = (slide: PptxGenJS.Slide, el: Element) => {
  const tag = el.tagName.toLowerCase();
  try {
    switch (tag) {
      case 'rect': renderRect(slide, el); break;
      case 'circle':
      case 'ellipse': renderEllipse(slide, el); break;
      case 'line': renderLine(slide, el); break;
      case 'text': renderText(slide, el); break;
      case 'polygon':
      case 'polyline': renderPolygon(slide, el); break;
      case 'path': renderPath(slide, el); break;
      case 'g':
        Array.from(el.children).forEach(child => renderSvgElement(slide, child));
        break;
      default: break;
    }
  } catch (err) {
    console.warn(`[NativePPTX] Skip <${tag}>:`, err);
  }
};

// ── 主匯出函式（全原生）──────────────────────────────
export const exportToNativePPTX = async (
  slides: SlideData[],
  imageOverlays?: Map<number, SlideImageOverlay>,
  multiOverlays?: Map<number, SlideImageOverlay[]>
) => {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_16x9';
  pres.title = 'Apoint Native Export';

  for (let i = 0; i < slides.length; i++) {
    const slideData = slides[i];
    const pptSlide = pres.addSlide();

    if (slideData.svg) {
      try {
        const processedSvg = prepareSvgForPpt(slideData.svg);
        const parser = new DOMParser();
        const doc = parser.parseFromString(processedSvg, 'image/svg+xml');
        const svgEl = doc.documentElement;

        if (svgEl.tagName.toLowerCase() !== 'parsererror' && !doc.querySelector('parsererror')) {
          Array.from(svgEl.children).forEach(child => {
            renderSvgElement(pptSlide, child);
          });
        }
      } catch (err) {
        console.error(`[NativePPTX] Slide ${i + 1} failed:`, err);
        pptSlide.addText(`轉換失敗: ${slideData.title}`, { x: 1, y: 2, color: 'FF0000' });
      }
    }

    // 圖片覆蓋層
    const overlay = imageOverlays?.get(i);
    if (overlay) {
      pptSlide.addImage({
        data: overlay.imageData,
        x: px2inX(overlay.x), y: px2inY(overlay.y),
        w: px2inX(overlay.w), h: px2inY(overlay.h),
      });
    }
    const mOverlays = multiOverlays?.get(i);
    if (mOverlays) {
      for (const ov of mOverlays) {
        pptSlide.addImage({
          data: ov.imageData,
          x: px2inX(ov.x), y: px2inY(ov.y),
          w: px2inX(ov.w), h: px2inY(ov.h),
        });
      }
    }

    // 品牌橫條已由 composeSvgWithBrandBar 以向量 SVG group 合成進投影片 SVG，
    // 在上面的 SVG → 原生形狀渲染時即一併輸出，這裡不需再額外疊加。

    pptSlide.addText(slideData.title || `Slide ${i + 1}`, {
      x: 0, y: 0, w: 0, h: 0, fontSize: 1, color: 'FFFFFF'
    });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `Presentation_Native_${timestamp}.pptx`;
  const pptxBuffer = await pres.write({ outputType: 'arraybuffer' }) as ArrayBuffer;
  try {
    await embedFontsAndSave(pptxBuffer, fileName);
  } catch (fontErr) {
    console.warn('[NativePPTX] 字型嵌入失敗，降級為無嵌入字型版本:', fontErr);
    triggerBlobDownload(new Blob([pptxBuffer], { type: PPTX_MIME }), fileName);
    throw new Error(`PPTX 已下載，但字型嵌入失敗（開啟時需安裝 ${CJK_FONT_NAME}）：${fontErr instanceof Error ? fontErr.message : fontErr}`);
  }
};
