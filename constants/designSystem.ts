/**
 * Apoint — Design System Integration Layer
 * 整合品牌識別（固定）+ 視覺風格 + PPT 技術約束
 * 此檔案為統一入口，各模組定義在各自檔案中。
 */

// ── Re-export 品牌識別（僅外部實際使用的符號）──────────
export {
  BRAND_BAR_HEIGHT,
  BRAND_BAR_TEXT,
} from './brandIdentity';

// ── 內部引入（用於組合 prompt）──────────────────────────
import { BRAND_IDENTITY_PROMPT } from './brandIdentity';
import { buildVisualStylePrompt } from './visualStyle';
import { SVG_ARCHITECTURE_RULES, EXAMPLE_STRUCTURE } from './svgConstraints';

/** 組合完整設計系統 prompt */
export function buildDesignSystemPrompt(): string {
  return `
${SVG_ARCHITECTURE_RULES}

${EXAMPLE_STRUCTURE}

${BRAND_IDENTITY_PROMPT}

${buildVisualStylePrompt()}
`.trim();
}
