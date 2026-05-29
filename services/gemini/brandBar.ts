/**
 * 品牌橫條合成 + Gemini 提取 pipeline。
 *
 * composeSvgWithBrandBar：用 buildBrandBarSvg() 把品牌橫條以向量 SVG group
 * 合成到生成投影片底部，內容（色彩 / 字型 / 版權字）隨使用者品牌設定動態變化。
 *
 * extractBrandBar：image 模式專用，AI 從上傳的模板截圖中提取底部品牌橫條 SVG。
 */

import { Type } from "@google/genai";
import { PROFILE } from "../../core/edition";
import { BRAND_BAR_HEIGHT, buildBrandBarSvg } from "../../constants/brandIdentity";
import { sanitizeSvg, flattenTransforms, PROHIBITED_TAGS, PROHIBITED_ATTRS, SVG_STYLE_ATTRS, pickFont } from "./svgSanitize";
import { generateWithFallback } from "./core";
import { DraftImage, BrandBar } from "../../types";

const BRAND_BAR_SAFETY_Y = 540 - BRAND_BAR_HEIGHT;

export const BRAND_BAR_PROMPT_CONSTRAINT = `\n    BRAND BAR SAFETY: The bottom ${BRAND_BAR_HEIGHT}px of the 960×540 canvas is reserved for the brand bar. All content MUST stay above y=${BRAND_BAR_SAFETY_Y}. Leave at least 10px safety margin above that line.`;

/** 從 data URL 中解析 MIME type */
export const getMimeType = (dataUrl: string): string => {
  const match = dataUrl.match(/^data:([^;]+);/);
  return match ? match[1] : "image/png";
};

/** 向量品牌橫條合成：buildBrandBarSvg() 產生的 group 疊到投影片底部 */
const composeSvgWithBrandBar = (generatedSvg: string, pageNumber?: number): string => {
  const barHeight = PROFILE.brand.brandBar.height;
  const barY = 540 - barHeight;
  const brandBarSvg = buildBrandBarSvg(pageNumber);

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(generatedSvg, "image/svg+xml");
    if (doc.querySelector("parsererror")) return generatedSvg;

    const svgEl = doc.documentElement;
    svgEl.setAttribute('width', '960');
    svgEl.setAttribute('height', '540');
    svgEl.setAttribute('viewBox', '0 0 960 540');

    const bgRect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', '0');
    bgRect.setAttribute('y', String(barY));
    bgRect.setAttribute('width', '960');
    bgRect.setAttribute('height', String(barHeight));
    bgRect.setAttribute('fill', '#FFFFFF');
    svgEl.appendChild(bgRect);

    const barDoc = parser.parseFromString(brandBarSvg, "image/svg+xml");
    if (!barDoc.querySelector("parsererror")) {
      const barGroup = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
      barGroup.setAttribute('transform', `translate(0, ${barY})`);
      Array.from(barDoc.documentElement.childNodes).forEach(child => {
        barGroup.appendChild(doc.importNode(child, true));
      });
      svgEl.appendChild(barGroup);
    }

    flattenTransforms(svgEl);

    let result = new XMLSerializer().serializeToString(doc);
    result = result.replace(/\s+xmlns:xlink="[^"]*"/g, '');
    result = result.replace(/\s+xml:space="[^"]*"/g, '');
    return result;
  } catch (e) {
    console.error("[composeSvgWithBrandBar] SVG 合成失敗:", e);
    return generatedSvg;
  }
};

/**
 * Gemini 回傳的 SVG 後處理：先 sanitize 再疊品牌橫條。
 * 所有 caller（image、storyline、patch）都應走這個 helper。
 */
export const processGeneratedSvg = (svg: string | undefined, pageNumber?: number): string | undefined => {
  if (!svg) return svg;
  return composeSvgWithBrandBar(sanitizeSvg(svg), pageNumber);
};

// ── image 模式：AI 從模板截圖提取品牌橫條 ────────────────────────────────

/** 清洗 AI 提取的品牌橫條 SVG */
const sanitizeBrandBarSvg = (svg: string, height: number): string => {
  if (!svg) return '';

  let clean = svg
    .replace(/```(?:xml|svg|html)?\s*/g, '')
    .replace(/```/g, '')
    .replace(/<\?xml[^?]*\?>/gi, '')
    .trim();

  clean = clean.replace(/<defs[\s\S]*?<\/defs>/gi, '');
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');
  clean = clean.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');

  const svgStart = clean.indexOf('<svg');
  if (svgStart === -1) return '';
  clean = clean.substring(svgStart);
  const svgEnd = clean.lastIndexOf('</svg>');
  if (svgEnd !== -1) clean = clean.substring(0, svgEnd + 6);

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(clean, "image/svg+xml");
    if (doc.querySelector("parsererror")) return '';

    const svgEl = doc.documentElement;
    doc.querySelectorAll(PROHIBITED_TAGS.join(', ')).forEach(el => el.remove());
    doc.querySelectorAll('defs').forEach(el => el.remove());

    doc.querySelectorAll('*').forEach(el => {
      PROHIBITED_ATTRS.forEach(attr => el.removeAttribute(attr));
      el.removeAttribute('href');
      el.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');

      const fill = el.getAttribute('fill');
      if (fill && fill.startsWith('url(')) el.setAttribute('fill', '#CCCCCC');
      const stroke = el.getAttribute('stroke');
      if (stroke && stroke.startsWith('url(')) el.setAttribute('stroke', '#999999');

      const inlineStyle = el.getAttribute('style');
      if (inlineStyle) {
        SVG_STYLE_ATTRS.forEach(prop => {
          const m = inlineStyle.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
          if (m) el.setAttribute(prop, m[1].trim());
        });
        el.removeAttribute('style');
      }
    });

    flattenTransforms(svgEl);

    doc.querySelectorAll('text').forEach(textEl => {
      const tspans = textEl.querySelectorAll('tspan');
      if (tspans.length > 0) {
        tspans.forEach(ts => ts.setAttribute('font-family', pickFont(ts.textContent || '')));
        const directText = Array.from(textEl.childNodes)
          .filter(n => n.nodeType === 3)
          .map(n => n.textContent || '')
          .join('');
        textEl.setAttribute('font-family', pickFont(directText));
      } else {
        textEl.setAttribute('font-family', pickFont(textEl.textContent || ''));
      }
    });

    svgEl.setAttribute('width', '960');
    svgEl.setAttribute('height', String(height));
    svgEl.setAttribute('viewBox', `0 0 960 ${height}`);
    svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgEl.removeAttribute('xmlns:xlink');

    let result = new XMLSerializer().serializeToString(doc);
    result = result.replace(/\s+xmlns:xlink="[^"]*"/g, '');
    result = result.replace(/\s+xml:space="[^"]*"/g, '');
    return result;
  } catch {
    return '';
  }
};

/**
 * image 模式：AI 從使用者上傳的模板截圖中提取底部品牌橫條。
 * 回傳 BrandBar（svg + height + sourceImage）供後續 composeSvgWithBrandBar 使用。
 */
export const extractBrandBar = async (templateImage: DraftImage): Promise<BrandBar> => {
  const mimeType = getMimeType(templateImage.data);
  const base64Data = templateImage.data.includes(',')
    ? templateImage.data.split(',')[1]
    : templateImage.data;

  console.log(`[Gemini] 開始提取品牌橫條, 圖片 MIME: ${mimeType}`);

  try {
    const response = await generateWithFallback({
      contents: [{ inlineData: { mimeType, data: base64Data } }],
      config: {
        systemInstruction: `You are a brand identity extraction specialist.
Analyze this presentation slide screenshot and identify the BOTTOM brand bar area (containing logos, company name, contact info, decorative borders, etc.).

RULES:
1. Identify the bottom brand/footer area of the slide.
2. Recreate it as a pure, PPT-compatible SVG with width=960 and height matching the bar's proportional height (typically 40-80px).
3. Use ONLY basic SVG elements: rect, text, circle, ellipse, line, polyline, polygon, path, g.
4. NO gradients, filters, clipPath, mask, image, foreignObject, defs, style tags.
5. Use inline attributes only (no CSS classes or style attributes).
6. Reproduce colors, text, and layout as faithfully as possible.
7. If no clear brand bar exists, return a minimal bar with height=0 and empty SVG.
8. The SVG viewBox should be "0 0 960 {height}".`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            svg: { type: Type.STRING, description: "Pure SVG code for the brand bar (960 x height). Attribute-styled, PPT-compatible." },
            height: { type: Type.NUMBER, description: "Height of the brand bar in pixels (based on 540px total canvas height)" },
          },
          required: ["svg", "height"]
        }
      }
    });

    const text = response.text;
    console.log(`[Gemini] 品牌橫條提取完成, 回應長度: ${text?.length ?? 0}`);
    if (!text) throw new Error("AI 品牌橫條提取回應為空");

    const parsed = JSON.parse(text.trim());
    if (parsed.svg && parsed.height > 0) {
      parsed.svg = sanitizeBrandBarSvg(parsed.svg, parsed.height);
    }

    console.log(`[Gemini] 品牌橫條高度: ${parsed.height}px`);
    return { svg: parsed.svg, height: parsed.height, sourceImage: templateImage.data };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '品牌橫條提取失敗';
    console.error(`[Gemini] 品牌橫條提取失敗:`, message);
    throw new Error(message);
  }
};
