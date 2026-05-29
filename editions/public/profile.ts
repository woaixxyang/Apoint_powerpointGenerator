/**
 * Public Edition Profile（Apoint 公眾版）
 * 開放任何 Google 帳號登入；品牌色／字型支援使用者透過 BrandStylePanel 動態調整。
 *
 * Phase 5：colors() / typography() 改為從 localStorage 讀取使用者設定，
 * 讓 AI prompt 在每次生成時即時反映使用者選擇的品牌風格。
 * 讀取失敗（JSON 格式錯誤、第一次使用）則回傳預設值。
 */

import type {
  EditionProfile,
  BrandColors,
  BrandTypography,
} from '../../core/types/edition';

const BRAND_STYLE_KEY = 'apoint_brand_style';

const DEFAULT_COLORS: BrandColors = {
  accentPrimary: '#FF6B00',
  accentSecondary: '#00AEEF',
  accentTertiary: '#00C853',
  dangerRed: '#DC2626',
  titleText: '#333333',
  bodyText: '#333333',
  secondaryText: '#666666',
  lightText: '#999999',
  background: '#FFFFFF',
  cardBackground: '#F8F9FA',
  borderDivider: '#E0E0E0',
  brandBar: '#9E9E9E',
};

const DEFAULT_TYPOGRAPHY: BrandTypography = {
  fontFamily: "Montserrat, 'Noto Sans TC', sans-serif",
  fontFamilyEN: 'Montserrat, sans-serif',
  fontFamilyCN: "'Noto Sans TC', sans-serif",
  titleSize: 22,
  subtitleSize: 16,
  bodySize: 16,
  labelSize: 13,
  dataEmphasisSize: { min: 28, max: 36 },
};

interface StoredBrandStyle {
  colors?: { primary?: string; accent?: string; background?: string };
  zhFont?: string;
  enFont?: string;
}

function loadBrandStyle(): StoredBrandStyle {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(BRAND_STYLE_KEY) : null;
    if (raw) return JSON.parse(raw) as StoredBrandStyle;
  } catch { /* ignore */ }
  return {};
}

export const profile: EditionProfile = {
  name: 'public',
  brand: {
    productName: 'Apoint',
    colors: () => {
      const bs = loadBrandStyle();
      return {
        ...DEFAULT_COLORS,
        accentPrimary: bs.colors?.primary ?? DEFAULT_COLORS.accentPrimary,
        accentSecondary: bs.colors?.accent ?? DEFAULT_COLORS.accentSecondary,
        accentTertiary: bs.colors?.background ?? DEFAULT_COLORS.accentTertiary,
      } as BrandColors;
    },
    typography: () => {
      const bs = loadBrandStyle();
      const zhFont = bs.zhFont ?? 'Noto Sans TC';
      const enFont = bs.enFont ?? 'Montserrat';
      return {
        ...DEFAULT_TYPOGRAPHY,
        fontFamily: `${enFont}, '${zhFont}', sans-serif`,
        fontFamilyEN: `${enFont}, sans-serif`,
        fontFamilyCN: `'${zhFont}', sans-serif`,
      };
    },
    titleStyle: {
      x: 40,
      y: 35,
      fontSize: 22,
      fontWeight: 'bold',
      fill: DEFAULT_COLORS.titleText,
      fontFamily: DEFAULT_TYPOGRAPHY.fontFamily,
    },
    subtitleStyle: {
      fontSize: 16,
      fontWeight: 'bold',
      fill: DEFAULT_COLORS.accentPrimary,
      fontFamily: DEFAULT_TYPOGRAPHY.fontFamily,
      description: '緊接標題下方, 用於摘要或關鍵洞察',
    },
    brandBar: {
      height: 40,
      copyright: 'Powered by Apoint',
      fontFace: 'Montserrat',
      fontSize: 9,
      textColor: 'FFFFFF',
      fillColor: DEFAULT_COLORS.brandBar,
    },
    brandBarMode: 'svg',
  },
  auth: {
    enterpriseWhitelist: undefined,
  },
  features: {
    brandStylePanel: true,
    showCTA: true,
    usageTracking: true,
    pwa: false,
  },
  ui: {
    // 公眾版開放任何 Google 帳號，無企業版框架字樣
    tagline: '',
    loginPrompt: '登入 Google 帳號後即可開始使用',
    // 公眾版白名單為 undefined → 不會觸發 UnauthorizedModal，僅為介面完整保留通用文案
    unauthorizedTitle: '此帳號無法使用',
    unauthorizedHint: '請使用其他 Google 帳號重新登入。',
  },
};
