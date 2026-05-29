import { describe, it, expect, vi } from 'vitest';

/**
 * Public edition 對 `buildDesignSystemPrompt()` 的守護。
 *
 * 為什麼獨立檔：vi.mock 是 file-scope hoist，同一檔內無法切換不同 PROFILE。
 * h2u edition 的對應守護在 promptAssembly.test.ts。
 *
 * Mock 值為 editions/public/profile.ts 的 inline 複本 — 若該 profile 改動，
 * 同步更新此處後刷新 public-edition snapshot 即可。
 */

vi.mock('../core/edition', () => {
  const COLORS = {
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
  const TYPOGRAPHY = {
    fontFamily: "Montserrat, 'Noto Sans TC', sans-serif",
    fontFamilyEN: 'Montserrat, sans-serif',
    fontFamilyCN: "'Noto Sans TC', sans-serif",
    titleSize: 22,
    subtitleSize: 16,
    bodySize: 16,
    labelSize: 13,
    dataEmphasisSize: { min: 28, max: 36 },
  };
  return {
    PROFILE: {
      name: 'public',
      brand: {
        productName: 'Apoint',
        colors: () => COLORS,
        typography: () => TYPOGRAPHY,
        titleStyle: {
          x: 40,
          y: 35,
          fontSize: 22,
          fontWeight: 'bold',
          fill: COLORS.titleText,
          fontFamily: TYPOGRAPHY.fontFamily,
        },
        subtitleStyle: {
          fontSize: 16,
          fontWeight: 'bold',
          fill: COLORS.accentPrimary,
          fontFamily: TYPOGRAPHY.fontFamily,
          description: '緊接標題下方, 用於摘要或關鍵洞察',
        },
        brandBar: {
          height: 40,
          copyright: 'Powered by Apoint',
          fontFace: 'Montserrat',
          fontSize: 9,
          textColor: 'FFFFFF',
          fillColor: COLORS.brandBar,
        },
        brandBarMode: 'svg' as const,
      },
      auth: { enterpriseWhitelist: undefined },
      features: {
        brandStylePanel: true,
        showCTA: true,
        usageTracking: true,
        pwa: false,
      },
    },
  };
});

import { buildDesignSystemPrompt } from '../constants/designSystem';

describe('buildDesignSystemPrompt — public edition', () => {
  it('應產出穩定的 prompt（public edition snapshot）', () => {
    expect(buildDesignSystemPrompt()).toMatchSnapshot();
  });

  describe('public edition 關鍵字面值', () => {
    const prompt = buildDesignSystemPrompt();

    it('產品名稱使用 APOINT', () => {
      expect(prompt).toMatch(/APOINT BRAND COLOR PALETTE/);
      expect(prompt).toMatch(/APOINT 固定大標題規範/);
    });

    it('標題 font-size 22（匯出後 17pt）', () => {
      expect(prompt).toMatch(/font-size="22"/);
      expect(prompt).toMatch(/17pt/);
    });

    it('副標題 font-size 16（匯出後 12pt）', () => {
      expect(prompt).toMatch(/font-size="16"/);
      expect(prompt).toMatch(/12pt/);
    });

    it('品牌橫條底色為灰色 #9E9E9E', () => {
      expect(prompt).toMatch(/#9E9E9E/);
    });

    it('Danger 色用 Tailwind red-600 (#DC2626)', () => {
      expect(prompt).toMatch(/#DC2626/);
    });
  });
});
