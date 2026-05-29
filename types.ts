// ── Content Type Classification ─────────────────────
export type SlideContentType =
  | 'data-chart'
  | 'data-table'
  | 'text-summary'
  | 'comparison'
  | 'process-flow'
  | 'mixed'
  | 'unknown';

// ── Core Types ──────────────────────────────────────
export interface SlideElement {
  type: 'text' | 'shape' | 'image';
  content?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  shapeType?: 'rect' | 'circle' | 'line';
  // Beta: 原始圖片中的來源區域（自動偵測用）
  sourceX?: number;
  sourceY?: number;
  sourceW?: number;
  sourceH?: number;
}

export interface SlideData {
  title: string;
  svg: string;
  elements: SlideElement[];
  contentType?: SlideContentType;
  // 批次生成失敗時標記為 true，SlideCard 會渲染「重試此頁」按鈕。
  failed?: boolean;
}

export interface DraftImage {
  name: string;
  data: string;
}

// ── Input Mode ──────────────────────────────────────
export type InputMode = 'image' | 'storyline';

// ── Brand Style（public edition 動態品牌，由 BrandStylePanel 設定） ────────
export interface CustomColors {
  primary: string;
  accent: string;
  background: string; // 點綴色 2（key 名沿用 vP 向後相容）
}

export interface BrandStyle {
  colors: CustomColors;
  fontFamily: string;  // 主字型（向後相容）
  fontLang: 'zh' | 'en';
  zhFont: string;
  enFont: string;
}

// ── Region groups（Like/Dislike feedback 區域映射） ────────────────────────
export const REGION_GROUPS: Record<string, { label: string; regions: string[] }> = {
  'title-area':  { label: '標題設計',       regions: ['title', 'subtitle', 'header-bar'] },
  'chart-area':  { label: '圖表呈現',       regions: ['chart', 'legend', 'kpi'] },
  'table-area':  { label: '表格樣式',       regions: ['table'] },
  'body-area':   { label: '文字內容排版',    regions: ['body', 'annotation'] },
  'decor-area':  { label: '視覺裝飾',       regions: ['decoration', 'icon'] },
};

// ── Brand Bar（image 模式 AI 提取的品牌橫條） ──────────────────────────────
export interface BrandBar {
  svg: string;
  height: number;
  sourceImage: string;
}

// ── Beta: 圖片綁定 & 覆蓋層 ────────────────────────
export interface BoundImage {
  imageIndex: number;       // index into draftImages[]
  draftImage: DraftImage;   // snapshot of the image data
}

export interface SlideImageOverlay {
  imageData: string;        // base64 data URL
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── Storyline Parser ────────────────────────────────
export interface StorylineSegment {
  pageNumber: number;
  content: string;              // 該頁原始文字（已去除 pN 標記）
}

export interface StorylineParsed {
  segments: StorylineSegment[];
  totalPageCount: number;
}

export interface AppState {
  // image 模式工作區
  draftImages: DraftImage[];
  imageSlides: SlideData[];

  // storyline 模式工作區
  content: string;              // storyline 原始文字
  storylineParsed?: StorylineParsed;
  storylineSlides: SlideData[];

  // 共用
  inputMode: InputMode;
  isGenerating: boolean;
  aiExpand: boolean;            // AI 自動補充內容 toggle
}

