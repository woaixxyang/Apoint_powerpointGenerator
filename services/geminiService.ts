/**
 * Barrel re-export — 維持 caller 端 import path 不變，內部已拆分到
 * services/gemini/* 子模組。詳見 docs/geminiService-split-plan.md。
 *
 * 子模組依賴 DAG（單向，無循環）：
 *   core  ←  outline / slideGen / slideEdit
 *   svgSanitize  ←  pptPrepare / brandBar
 *   brandBar  ←  slideGen / slideEdit
 */

export { generateWithFallback } from "./gemini/core";
export { sanitizeSvg, convertArcsInPath, flattenTransforms } from "./gemini/svgSanitize";
export { prepareSvgForPpt } from "./gemini/pptPrepare";
export { generateSingleSlide, generateFromStoryline } from "./gemini/slideGen";
export { patchSlide } from "./gemini/slideEdit";
export { optimizeOutline, translateOutline } from "./gemini/outline";
