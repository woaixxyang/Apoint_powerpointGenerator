/**
 * 當前 edition 的 PROFILE export。
 *
 * `@edition` alias 由 vite + tsconfig 解析到 editions/public/profile.ts。
 * 不要直接 import 從 `editions/*`，一律走 PROFILE — 這樣 tree-shaking
 * 才能把未使用的 edition 完整移除。
 */
import { profile } from '@edition';

export const PROFILE = profile;
export type { EditionProfile, EditionName, BrandColors, BrandTypography } from './types/edition';
