import { Type } from "@google/genai";
import { SlideData, DraftImage, StorylineSegment } from "../../types";
import { buildDesignSystemPrompt } from "../../constants/designSystem";
import { generateWithFallback, GEMINI_MODEL_FALLBACK } from "./core";
import { processGeneratedSvg, BRAND_BAR_PROMPT_CONSTRAINT, getMimeType } from "./brandBar";

export const generateSingleSlide = async (
  draftImage: DraftImage,
  userNotes: string,
  pageIndex: number,
  previousSvg?: string,
  detectImages?: boolean,
  externalSignal?: AbortSignal,
  useQualityModel?: boolean,
): Promise<SlideData> => {

  const brandBarConstraint = BRAND_BAR_PROMPT_CONSTRAINT;

  const redesignConstraint = previousSvg
    ? `
    ### REDESIGN CONSTRAINT (CRITICAL):
    The user is DISSATISFIED with the previous design shown below. You MUST create a COMPLETELY DIFFERENT layout.
    - Use a DIFFERENT layout structure (e.g., if previous was 3-column, try 2-column or card-grid)
    - Use DIFFERENT visual emphasis (e.g., if previous used bar charts, try large numbers or donuts)
    - Use DIFFERENT spacing and grouping strategies
    - Keep the SAME data/content from the source image, but present it in a fresh way
    - Do NOT replicate the previous design's structure

    PREVIOUS DESIGN (DO NOT REPEAT THIS):
    \`\`\`svg
    ${previousSvg}
    \`\`\`
    `
    : '';

  const systemInstruction = `
    You are a Presentation Content Designer specializing in creating visually compelling SVG slides for Microsoft PowerPoint.

    ${buildDesignSystemPrompt()}

    ### COMPILATION RULES:
    1. ANALYZE the source draft image carefully and CONVERT into a 960x540 SVG.
    2. CALCULATE absolute (x, y) coordinates for EVERY line of text. AVOID 'dominant-baseline'.
    3. ${userNotes ? `USER PREFERENCE: "${userNotes}"` : ""}${brandBarConstraint}
    ${redesignConstraint}

    ${detectImages ? `### IMAGE DETECTION & PRESERVATION:
    Carefully analyze the source image for any photographs, logos, product images, charts rendered as images, or other raster/bitmap content (NOT text or vector shapes).
    For each detected image region:
    1. Identify its position in the SOURCE image as sourceX, sourceY, sourceW, sourceH (in a 960x540 coordinate space)
    2. In your NEW layout, place it in an appropriate position that fits the new design
    3. Return it as an element with type:'image' in the elements array, with:
       - x, y, w, h: the DESTINATION position in your new 960x540 SVG layout
       - sourceX, sourceY, sourceW, sourceH: the SOURCE position from the original image
    4. In the SVG, leave the destination area empty (use a light gray rect placeholder with rx="4") — the real image will be overlaid by the frontend
    5. Design text and shapes AROUND the image areas — do NOT overlap
    ` : ''}### OUTPUT:
    Return a JSON object with slide title and pure, valid, 960x540 PPT-compatible SVG code.
  `;

  const mimeType = getMimeType(draftImage.data);
  const base64Data = draftImage.data.includes(',')
    ? draftImage.data.split(",")[1]
    : draftImage.data;

  console.log(`[Gemini] 開始生成第 ${pageIndex + 1} 頁, 圖片 MIME: ${mimeType}, base64 長度: ${base64Data.length}`);

  try {
    const response = await generateWithFallback({
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
      ],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            svg: { type: Type.STRING, description: `Pure SVG code (960x540). Attribute-styled, PPT-compatible.` },
            elements: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  content: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  w: { type: Type.NUMBER },
                  h: { type: Type.NUMBER },
                  sourceX: { type: Type.NUMBER, description: 'Source X in original image (960x540 space)' },
                  sourceY: { type: Type.NUMBER, description: 'Source Y in original image (960x540 space)' },
                  sourceW: { type: Type.NUMBER, description: 'Source width in original image' },
                  sourceH: { type: Type.NUMBER, description: 'Source height in original image' }
                },
                required: ["type", "x", "y", "w", "h"]
              }
            }
          },
          required: ["title", "svg", "elements"]
        }
      }
    }, externalSignal, undefined, useQualityModel ? GEMINI_MODEL_FALLBACK : undefined);

    const responseText = response.text;
    console.log(`[Gemini] 第 ${pageIndex + 1} 頁回應長度: ${responseText?.length ?? 0}`);

    if (!responseText) throw new Error("AI 回應為空");

    const jsonResponse = JSON.parse(responseText.trim());
    jsonResponse.svg = processGeneratedSvg(jsonResponse.svg, pageIndex + 1);
    console.log(`[Gemini] 第 ${pageIndex + 1} 頁生成成功: ${jsonResponse.title}`);
    return jsonResponse;
  } catch (error: any) {
    if (externalSignal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    console.error(`[Gemini] 第 ${pageIndex + 1} 頁失敗:`, error);
    if (error?.name === 'GenerationTimeoutError') {
      throw new Error(`第 ${pageIndex + 1} 頁 ${error.message}`);
    }
    throw new Error(error?.message || "設計生成失敗");
  }
};

// ── Storyline → SVG 生成 ─────────────────────────────

export const generateFromStoryline = async (
  segments: StorylineSegment[],
  pageIndex: number,
  aiExpand: boolean,
  referenceImages?: DraftImage[],
  boundImage?: DraftImage,
  externalSignal?: AbortSignal,
  useQualityModel?: boolean,
): Promise<SlideData> => {

  const currentSegment = segments[pageIndex];
  if (!currentSegment) throw new Error(`找不到第 ${pageIndex + 1} 頁的內容`);

  const brandBarConstraint = BRAND_BAR_PROMPT_CONSTRAINT;

  const storylineContext = segments.map((seg, i) => {
    const marker = i === pageIndex ? '  >>> CURRENT PAGE <<<' : '';
    return `P${seg.pageNumber}: ${seg.content}${marker}`;
  }).join('\n');

  const aiExpandInstruction = aiExpand
    ? `You should EXPAND the user's outline into a complete, visually rich slide. Add relevant details, statistics placeholders, supporting points, and visual elements that make this a professional presentation page.`
    : `STRICTLY use ONLY the content provided by the user. Do NOT add extra content, statistics, or details that are not in the outline. Present the given content in a clean, professional layout.`;

  const systemInstruction = `
    You are a Presentation Content Designer specializing in creating visually compelling SVG slides from text outlines.

    ${buildDesignSystemPrompt()}

    ### YOUR TASK:
    Convert the text outline below into a professional 960×540 SVG slide.

    ### CONTENT RULES:
    1. ${aiExpandInstruction}
    2. The slide should feel like a complete, polished presentation page — not a text dump.
    3. Use appropriate visual structures: bullet lists, number cards, icon placeholders, comparison layouts, etc.
    4. CALCULATE absolute (x, y) coordinates for EVERY text element. AVOID 'dominant-baseline'.
    ${brandBarConstraint}

    ### FULL STORYLINE (for narrative context):
    ${storylineContext}

    ### CURRENT PAGE CONTENT (P${currentSegment.pageNumber}):
    ${currentSegment.content}

    ${boundImage ? `### BOUND IMAGE:
    The user has bound a specific image to this page. You MUST:
    1. Reserve a rectangular region in the slide layout for this image (at least 300px wide, 200px tall).
    2. In the elements[] array, include an element with type:'image' specifying the exact x, y, w, h coordinates where the image should be placed.
    3. Design the text and visual content AROUND this reserved space — do NOT overlap.
    4. Choose a position that makes visual sense given the slide content (e.g., right side for text-heavy content, center for hero images).
    ` : ''}### OUTPUT:
    Return a JSON object with slide title and pure, valid, 960×540 PPT-compatible SVG code.
  `;

  const contents: any[] = [];
  if (boundImage) {
    const mimeType = getMimeType(boundImage.data);
    const base64Data = boundImage.data.includes(',') ? boundImage.data.split(',')[1] : boundImage.data;
    contents.push({ inlineData: { mimeType, data: base64Data } });
  }
  if (referenceImages && referenceImages.length > 0) {
    for (const img of referenceImages) {
      const mimeType = getMimeType(img.data);
      const base64Data = img.data.includes(',') ? img.data.split(',')[1] : img.data;
      contents.push({ inlineData: { mimeType, data: base64Data } });
    }
  }
  contents.push({ text: `Generate slide for page P${currentSegment.pageNumber}: ${currentSegment.content}` });

  console.log(`[Gemini] Storyline 模式：生成第 ${pageIndex + 1} 頁 (P${currentSegment.pageNumber})`);

  try {
    const response = await generateWithFallback({
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            svg: { type: Type.STRING, description: 'Pure SVG code (960x540). Attribute-styled, PPT-compatible.' },
            elements: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  content: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  w: { type: Type.NUMBER },
                  h: { type: Type.NUMBER }
                },
                required: ["type", "x", "y", "w", "h"]
              }
            }
          },
          required: ["title", "svg", "elements"]
        }
      }
    }, externalSignal, undefined, useQualityModel ? GEMINI_MODEL_FALLBACK : undefined);

    const responseText = response.text;
    console.log(`[Gemini] Storyline 第 ${pageIndex + 1} 頁回應長度: ${responseText?.length ?? 0}`);

    if (!responseText) throw new Error("AI 回應為空");

    const jsonResponse = JSON.parse(responseText.trim());
    jsonResponse.svg = processGeneratedSvg(jsonResponse.svg, pageIndex + 1);
    console.log(`[Gemini] Storyline 第 ${pageIndex + 1} 頁生成成功: ${jsonResponse.title}`);
    return jsonResponse;
  } catch (error: any) {
    if (externalSignal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    console.error(`[Gemini] Storyline 第 ${pageIndex + 1} 頁失敗:`, error);
    if (error?.name === 'GenerationTimeoutError') {
      throw new Error(`第 ${pageIndex + 1} 頁 ${error.message}`);
    }
    throw new Error(error?.message || "Storyline 設計生成失敗");
  }
};
