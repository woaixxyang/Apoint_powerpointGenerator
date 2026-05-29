import { generateWithFallback } from "./core";

// ── 大綱優化 ─────────────────────────────────────────

/**
 * 優化大綱：根據用戶輸入的關鍵字或粗略大綱，生成結構化的簡報大綱。
 * 每頁標題為該頁 key message，內容為支持該結論的論點。
 * 各頁 key message 邏輯連貫，形成 storyline。
 */
export const optimizeOutline = async (
  currentOutline: string,
  mode: 'refine' | 'regenerate' = 'regenerate',
  externalSignal?: AbortSignal,
): Promise<string> => {
  const baseRules = `## OUTPUT FORMAT:
Use this exact format (Traditional Chinese):
p1 [Key Message 標題]
  - [支持論點 1]
  - [支持論點 2]
p2 [Key Message 標題]
  - [支持論點 1]
  - [支持論點 2]
...

## RULES:
1. Each page title (after pN) must be that page's KEY MESSAGE — a clear, assertive conclusion statement, not a generic topic label.
   - BAD: "市場分析" (too vague, just a topic)
   - GOOD: "目標市場年增長率達 15%，潛力巨大" (clear key message)
2. Bullet points under each page are SUPPORTING ARGUMENTS that back up the key message.
3. All pages must form a LOGICAL STORYLINE — each key message should naturally lead to the next, building a coherent narrative arc.
4. Keep content concise — each bullet point should be one line.
5. Use Traditional Chinese (繁體中文).
6. Do NOT add markdown formatting, code fences, or any wrapper. Output ONLY the plain text outline.
7. Each page should have 2-4 bullet points maximum.`;

  const systemInstruction = mode === 'refine'
    ? `You are a presentation storyline editor. The user has manually edited their outline and wants you to REFINE it while preserving their changes.

${baseRules}

## REFINE MODE — IMPORTANT:
- The user has made intentional manual edits to this outline. RESPECT and PRESERVE their changes.
- Do NOT restructure the outline or change the number of pages unless absolutely necessary.
- Do NOT remove or rewrite content the user has added — only polish and improve.
- Focus on: fixing grammar, improving wording clarity, strengthening key messages, and ensuring logical flow.
- Keep the user's intended structure, page order, and main ideas intact.
- Only add bullet points if a page clearly lacks supporting arguments.
- Think of this as light editing / 微調, not a rewrite.`
    : `You are a presentation storyline architect. Your task is to take the user's rough outline, keywords, or draft and transform it into a well-structured presentation storyline.

${baseRules}

## ADDITIONAL RULES:
1. Typical storyline structure: Context/Problem → Evidence/Analysis → Solution → Benefits → Call to Action
2. If the user's input is just keywords or a topic, expand into 4-6 pages with full storyline.
3. If the user already has a structured outline, IMPROVE it: sharpen key messages, strengthen logic flow, add missing supporting points.`;

  const userPrompt = mode === 'refine'
    ? `使用者已手動修改了以下大綱，請在保留修改的基礎上微調優化：\n\n${currentOutline}`
    : `請優化以下簡報大綱：\n\n${currentOutline}`;

  try {
    const response = await generateWithFallback({
      contents: [{ text: userPrompt }],
      config: {
        systemInstruction,
        temperature: mode === 'refine' ? 0.4 : 0.7,
      },
    }, externalSignal);

    const text = response.text;
    if (!text) throw new Error('AI 回應為空');

    // Clean up: remove possible code fences or extra whitespace
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```[\s\S]*?\n/, '').replace(/\n```\s*$/, '');
    return cleaned.trim();
  } catch (error: any) {
    if (externalSignal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    console.error('[Gemini] 大綱優化失敗:', error?.message);
    if (error?.name === 'GenerationTimeoutError') {
      throw new Error(`大綱優化 ${error.message}`);
    }
    throw new Error(error?.message || '大綱優化失敗');
  }
};

export const translateOutline = async (
  currentOutline: string,
  externalSignal?: AbortSignal,
): Promise<string> => {
  const systemInstruction = `You are a translation assistant for presentation outlines. Your task is to detect the primary language of the outline and translate it:
- If the outline is primarily in Chinese → translate to English
- If the outline is primarily in English → translate to Traditional Chinese (繁體中文)

## RULES:
1. Preserve the exact pN format (p1, p2, p3...) and indentation structure (  - bullet points).
2. Only translate the content text, NOT the structural markers (p1, p2, etc.).
3. Keep the meaning, tone, and level of detail identical.
4. Do NOT add markdown formatting, code fences, or any wrapper. Output ONLY the plain text outline.
5. Keep numbers, statistics, and proper nouns as-is where appropriate.`;

  try {
    const response = await generateWithFallback({
      contents: [{ text: `請翻譯以下簡報大綱：\n\n${currentOutline}` }],
      config: {
        systemInstruction,
        temperature: 0.3,
      },
    }, externalSignal);

    const text = response.text;
    if (!text) throw new Error('AI 回應為空');

    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```[\s\S]*?\n/, '').replace(/\n```\s*$/, '');
    return cleaned.trim();
  } catch (error: any) {
    if (externalSignal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    console.error('[Gemini] 大綱翻譯失敗:', error?.message);
    if (error?.name === 'GenerationTimeoutError') {
      throw new Error(`大綱翻譯 ${error.message}`);
    }
    throw new Error(error?.message || '大綱翻譯失敗');
  }
};
