import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 守護 isEnterpriseUser 在不同設定下的行為：
 *   - 有白名單 (whitelist=['example.com'])  → 僅放行 @example.com
 *   - 無白名單 (whitelist=undefined)        → 放行任何非空 email
 *
 * 用 vi.hoisted 把 mock 狀態提前；vi.mock 對 '../core/edition' 注入一個
 * 帶 getter 的 PROFILE，每次讀 .auth 都回傳當下 mockState — 因此可在
 * beforeEach 切換設定而不需要 reset module。
 */

const mockState = vi.hoisted(() => ({
  whitelist: undefined as readonly string[] | undefined,
}));

vi.mock('../core/edition', () => ({
  PROFILE: {
    get auth() {
      return { enterpriseWhitelist: mockState.whitelist };
    },
  },
}));

import { isEnterpriseUser } from '../services/authService';

describe('isEnterpriseUser', () => {
  describe('有白名單 (enterpriseWhitelist = ["example.com"])', () => {
    beforeEach(() => {
      mockState.whitelist = ['example.com'];
    });

    it('放行 @example.com email', () => {
      expect(isEnterpriseUser('ava@example.com')).toBe(true);
    });

    it('擋下非白名單域名 email', () => {
      expect(isEnterpriseUser('someone@gmail.com')).toBe(false);
    });

    it('擋下空字串 email', () => {
      expect(isEnterpriseUser('')).toBe(false);
    });

    it('域名比對忽略大小寫', () => {
      expect(isEnterpriseUser('ava@EXAMPLE.COM')).toBe(true);
    });

    it('多個白名單域名各別生效', () => {
      mockState.whitelist = ['example.com', 'partner.com'];
      expect(isEnterpriseUser('user@partner.com')).toBe(true);
      expect(isEnterpriseUser('user@other.com')).toBe(false);
    });
  });

  describe('無白名單 (enterpriseWhitelist = undefined)', () => {
    beforeEach(() => {
      mockState.whitelist = undefined;
    });

    it('放行任何 Google 帳號', () => {
      expect(isEnterpriseUser('someone@gmail.com')).toBe(true);
    });

    it('白名單 undefined 表示完全開放', () => {
      expect(isEnterpriseUser('ava@example.com')).toBe(true);
    });

    it('空字串 email 仍擋下', () => {
      expect(isEnterpriseUser('')).toBe(false);
    });
  });
});
