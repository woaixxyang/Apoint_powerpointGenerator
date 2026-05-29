# Apoint

**智慧簡報生成工具** — 輸入文字大綱或上傳模板圖片，由 Gemini AI 生成 960×540 的 SVG 投影片，並可匯出為原生可編輯的 PPTX 或向量 PDF。

這是 Apoint 的開源公眾版：開放任何 Google 帳號登入，品牌色彩 / 字型可由使用者透過品牌風格面板自由設定。

## 功能

- **兩種輸入模式**
  - 大綱生成：以 `pN` 標記分頁的文字大綱，分段批次生成
  - 美化簡報：上傳 PPTX / 圖片模板，AI 以其為視覺參考生成
- **即時預覽**：SVG 投影片即時渲染、可逐元素編輯文字
- **動態品牌**：自訂主題色 / 點綴色 / 中英文字型，即時反映於生成結果
- **原生匯出**：PPTX（PptxGenJS 原生形狀 + 內嵌 TTF 字型）、向量 PDF（svg2pdf.js）
- **離線字型**：Service Worker 預先快取字型，跨 session 保留

## 技術架構

前端 React SPA + 輕量 Node.js Express 後端（同一 process 既 serve 靜態檔、也代理 Gemini API，API key 只留在後端）。

```
使用者輸入（大綱 or 模板）
  → 前端 fetch /api/generate → server.js → Gemini API（後端持有 API key）
  → SVG（960×540）回前端即時預覽
  → 匯出 PPTX：清理 SVG → PptxGenJS 原生形狀 → JSZip 注入 TTF
  → 匯出 PDF ：svg2pdf.js 寫向量指令 + jsPDF 註冊 TTF
```

## 本地開發

**需求**：Node.js 20+

```bash
npm install

# 設定環境變數
cp .env.example .env.local
# 編輯 .env.local，填入 GEMINI_API_KEY 與 VITE_GOOGLE_CLIENT_ID

# 同時開兩個 terminal：
npm run dev:server   # 後端 Express（port 8080）
npm run dev          # 前端 Vite dev server（port 3001），/api/* 自動 proxy 到 :8080
```

## 建置與部署

```bash
npm run build        # tsc 型別檢查 + vite build → dist/
npm start            # 生產模式（在 dist/ 之上跑 server.js，預設 port 8080）
npm test             # vitest 全套（happy-dom）
```

部署為單一 Node 服務即可：build 產生 `dist/`，`server.js` 同時 serve 靜態檔與代理 Gemini。環境變數 `GEMINI_API_KEY`（後端 runtime）、`VITE_GOOGLE_CLIENT_ID`（build-time）。

## 授權

內附字型：Noto Sans TC、Montserrat（皆採 SIL Open Font License）。
