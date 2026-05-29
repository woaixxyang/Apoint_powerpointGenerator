import path from 'path';
import { defineConfig } from 'vitest/config';

// 預設將 @edition 指向 h2u profile；個別測試若需驗證 public edition 行為，
// 應透過 vi.mock('../core/edition', ...) 注入對應 PROFILE。
const edition = 'public';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@edition': path.resolve(__dirname, `editions/${edition}/profile.ts`),
    },
  },
  test: {
    // happy-dom 提供 DOMParser / XMLSerializer 給 SVG sanitize 測試使用
    environment: 'happy-dom',
    // 測試檔案位置：與 source code 同目錄的 *.test.ts，或 tests/ 下
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', '.git'],
    // 預設逾時 5s 對 fake timer 測試足夠
    testTimeout: 5_000,
  },
});
