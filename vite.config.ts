import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 在 production build 時把 dist/sw.js 內的 `__APOINT_SW_VERSION__` 佔位符
 * 替換為「public/fonts/*.ttf + public/sw.js 原始檔」內容的 SHA-256 hash 前 8 碼。
 *
 * 為什麼這樣設計：
 * - SW 的 CACHE_NAME 必須在「被快取的資源變動」時改變，否則使用者拿到舊
 *   TTF（曾經發生過 Thin 偽裝 Regular 的版本）。
 * - 手動 bump v1→v2 容易忘記。改用內容 hash → 字型改動或 SW 邏輯改動
 *   都會自動換 CACHE_NAME，activate hook 內的舊 cache 清除邏輯就會生效。
 * - 不靠 git hash：Cloud Build 在 Docker 內跑，.dockerignore 排除了 .git，
 *   `git rev-parse` 拿不到 hash；內容 hash 不依賴外部資訊。
 *
 * dev 模式不執行（apply: 'build'），sw.js 原樣 serve，CACHE_NAME 維持
 * 字面 placeholder — 是合法字串，dev 不需 cache 失效機制。
 */
function injectSwVersion(): Plugin {
  return {
    name: 'sw-version-inject',
    apply: 'build',
    closeBundle() {
      const outSw = path.resolve(__dirname, 'dist', 'sw.js');
      if (!fs.existsSync(outSw)) {
        console.warn('[sw-version-inject] dist/sw.js 不存在，跳過');
        return;
      }

      const hash = createHash('sha256');
      // 1) public/fonts/ 內所有 ttf（檔名排序，內容雜湊）
      const fontDir = path.resolve(__dirname, 'public', 'fonts');
      if (fs.existsSync(fontDir)) {
        const ttfs = fs.readdirSync(fontDir).filter(f => f.endsWith('.ttf')).sort();
        for (const f of ttfs) {
          hash.update(f);
          hash.update(fs.readFileSync(path.join(fontDir, f)));
        }
      }
      // 2) public/sw.js 原始內容（SW 邏輯改動也應該觸發 cache 失效）
      const swSrc = path.resolve(__dirname, 'public', 'sw.js');
      if (fs.existsSync(swSrc)) {
        hash.update(fs.readFileSync(swSrc));
      }
      const version = hash.digest('hex').slice(0, 8);

      let content = fs.readFileSync(outSw, 'utf-8');
      if (!content.includes('__APOINT_SW_VERSION__')) {
        console.warn('[sw-version-inject] dist/sw.js 內找不到 __APOINT_SW_VERSION__ 佔位符');
        return;
      }
      content = content.replace(/__APOINT_SW_VERSION__/g, version);
      fs.writeFileSync(outSw, content);
      console.log(`[sw-version-inject] sw.js cache version → apoint-fonts-${version}`);
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, __dirname, '');
    // build / dev 時透過 VITE_EDITION 環境變數選擇 edition profile。
    // 未設定時預設為 h2u（向後相容 — 既有 deploy script 不需修改）。
    const edition = 'public';
    return {
      server: {
        port: 3001,
        host: '0.0.0.0',
        proxy: {
          '/api': 'http://localhost:8080',
        },
      },
      plugins: [react(), injectSwVersion()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          '@edition': path.resolve(__dirname, `editions/${edition}/profile.ts`),
        }
      },
      define: {
        // 暴露 edition 名稱給少數需要 runtime 判斷的場景（debug log 等）。
        // 一般業務邏輯應該透過 PROFILE.* 而非檢查這個字串。
        '__APOINT_EDITION__': JSON.stringify(edition),
      },
    };
});
