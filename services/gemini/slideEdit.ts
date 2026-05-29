import { Type } from "@google/genai";
import { SlideData } from "../../types";
import { generateWithFallback, GEMINI_MODEL_FALLBACK } from "./core";
import { processGeneratedSvg } from "./brandBar";

// ── Patch Mode（局部修改）─────────────────────────────

/**
 * 局部修改已生成的 SVG — Patch Mode
 * 將現有 SVG 源碼 + 用戶指令傳給 AI，僅修改指定部分，其餘保持不變。
 */
export const patchSlide = async (
  currentSvg: string,
  currentTitle: string,
  patchInstruction: string,
  pageIndex?: number,
  externalSignal?: AbortSignal,
): Promise<SlideData> => {

  const systemInstruction = `
You are an SVG Patch Editor. Your task is to make TARGETED modifications to an existing 960x540 SVG presentation slide.

## CRITICAL RULES:
1. **MINIMAL CHANGES ONLY**: ONLY modify elements the user explicitly requests. All other elements MUST remain byte-for-byte identical.
2. **COPY-PASTE PRINCIPLE**: Treat unaffected areas as a copy-paste operation. Do NOT reformat, reindent, reorder attributes, or adjust coordinates of anything the user did not ask to change.
3. **PPT COMPATIBILITY**: No foreignObject, style tags, filters, clipPath, mask, pattern, use, symbol, animate, image, or script tags. No class/style attributes. Inline SVG attributes only.
4. **CANVAS SIZE**: 960x540. Do not change dimensions.

## YOUR TASK:
Given the existing SVG below, apply ONLY the user's requested changes. Return the COMPLETE modified SVG (not a diff).
`.trim();

  const contents = `## EXISTING SVG (title: "${currentTitle}"):\n\`\`\`svg\n${currentSvg}\n\`\`\`\n\n## USER PATCH REQUEST:\n${patchInstruction}`;

  console.log(`[Gemini] 開始局部修改, SVG 長度: ${currentSvg.length}, 指令: "${patchInstruction.substring(0, 50)}..."`);

  try {
    const response = await generateWithFallback({
      contents: [contents],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Slide title (keep original unless user asked to change it)" },
            svg: { type: Type.STRING, description: "Complete modified SVG code (960x540). Attribute-styled, PPT-compatible." },
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
    }, externalSignal, undefined, GEMINI_MODEL_FALLBACK);  // patchSlide 永遠用 pro，使用者指令明確、品質優先

    const responseText = response.text;
    console.log(`[Gemini] 局部修改回應長度: ${responseText?.length ?? 0}`);
    if (!responseText) throw new Error("AI 回應為空");

    const jsonResponse = JSON.parse(responseText.trim());
    jsonResponse.svg = processGeneratedSvg(
      jsonResponse.svg,
      pageIndex != null ? pageIndex + 1 : undefined,
    );
    console.log(`[Gemini] 局部修改完成: ${jsonResponse.title}`);
    return jsonResponse;
  } catch (error: any) {
    if (externalSignal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    console.error(`[Gemini] 局部修改失敗:`, error?.message);
    if (error?.name === 'GenerationTimeoutError') {
      throw new Error(`局部修改 ${error.message}`);
    }
    throw new Error(error?.message || "局部修改失敗");
  }
};
