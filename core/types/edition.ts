/**
 * EditionProfile — 整個 codebase 的 edition 差異抽象介面。
 *
 * 兩個 edition profile（h2u / public）各自實作此介面，
 * 透過 vite alias + tsconfig paths 在 build time 把 `@edition` 解析到對應檔，
 * 因此另一 edition 的 profile 完全被 tree-shake 掉，不會出現在 bundle 中。
 *
 * 消費端只 import `PROFILE` from `@/core/edition`，不知道也不該知道
 * 自己是哪個 edition — 行為由 PROFILE 的值決定。
 *
 * Brand bar 的「渲染方式」（h2u 用 PNG image + addText overlay；
 * public 用 SVG 整片嵌入）差異留待 Phase 2 引入消費端時再處理。
 */

export type EditionName = 'public';

export interface BrandColors {
  accentPrimary: string;
  accentSecondary: string;
  accentTertiary: string;
  dangerRed: string;
  titleText: string;
  bodyText: string;
  secondaryText: string;
  lightText: string;
  background: string;
  cardBackground: string;
  borderDivider: string;
  brandBar: string;
}

export interface BrandTypography {
  fontFamily: string;
  fontFamilyEN: string;
  fontFamilyCN: string;
  titleSize: number;
  subtitleSize: number;
  bodySize: number;
  labelSize: number;
  dataEmphasisSize: { min: number; max: number };
}

export interface BrandTitleStyle {
  x: number;
  y: number;
  fontSize: number;
  fontWeight: 'bold' | 'normal';
  fill: string;
  fontFamily: string;
}

export interface BrandSubtitleStyle {
  fontSize: number;
  fontWeight: 'bold' | 'normal';
  fill: string;
  fontFamily: string;
  description?: string;
}

export interface BrandBarMeta {
  height: number;
  copyright: string;
  fontFace: string;
  fontSize: number;
  textColor: string;
  fillColor: string;
}

export interface EditionBrand {
  productName: string;
  colors: () => BrandColors;
  typography: () => BrandTypography;
  titleStyle: BrandTitleStyle;
  subtitleStyle: BrandSubtitleStyle;
  brandBar: BrandBarMeta;
  /**
   * 品牌橫條注入方式：
   * - 'png'：h2u edition，使用 PNG <image>（含企業 logo，100% 不失真）
   * - 'svg'：public edition，用 buildBrandBarSvg() 向量組合
   */
  brandBarMode: 'png' | 'svg';
}

export interface EditionAuth {
  enterpriseWhitelist?: string[];
}

/**
 * Edition 專屬 UI 文案。各 edition 提供自己的字串，shared component 讀 PROFILE.ui.*
 * 切換——h2u 保留企業版原文、public 用開放版文案，不在 component 內寫 edition 分支。
 */
export interface EditionUI {
  /** Sidebar 品牌副標（空字串 = 不顯示，例如公眾版） */
  tagline: string;
  /** 未登入時 Sidebar 的提示文字 */
  loginPrompt: string;
  /** UnauthorizedModal 副標（僅有 enterpriseWhitelist 的 edition 會觸發此 modal） */
  unauthorizedTitle: string;
  /** UnauthorizedModal 說明文字 */
  unauthorizedHint: string;
}

export interface EditionFeatures {
  brandStylePanel: boolean;
  showCTA: boolean;
  /** 用量計量 / 配額（商業）。實際 Sheet 持久化走 server-side，前端只看此旗標決定是否顯示/強制配額 */
  usageTracking: boolean;
  pwa: boolean;
  // designMemory：已砍除（vP 為半成品死碼，prompt 注入從未上線）
  // sheetSync：非前端 feature —— 用量持久化改為 server-side 實作細節，不再以旗標暴露
}

export interface EditionProfile {
  name: EditionName;
  brand: EditionBrand;
  auth: EditionAuth;
  features: EditionFeatures;
  ui: EditionUI;
}
