/**
 * 字型包下載：給「PPTX 開啟後中文 / 數字顯示異常」的使用者一個 fallback 入口。
 *
 * 背景：PPTX 雖然已用 ECMA-376 §22.4.2.4 內嵌字型（見 fontEmbedService.ts），
 * 但下列軟體開啟時仍會忽略嵌入字型、回退到系統字型：
 *   - Keynote（完全不認嵌入字型）
 *   - Google Slides 上傳
 *   - 部分舊版 Mac PowerPoint
 *   - 某些 LibreOffice 版本
 * 這時使用者本機若沒有 Noto Sans TC / Montserrat，中文 / 西文會被系統字型替代，
 * 視覺上像「亂碼」或「缺字方塊」。
 *
 * 解法：讓使用者一鍵下載 4 個 TTF + 安裝指引 ZIP，雙擊安裝即可。
 */
import JSZip from 'jszip';
import { triggerBlobDownload } from '../utils/download';
import { CJK_FONT_NAME, LATIN_FONT_NAME } from './fontEmbedService';

const ZIP_MIME = 'application/zip';

// 與 fontEmbedService 的 FONT_FAMILIES 對齊；獨立列出避免互相耦合
const FONT_FILES: readonly { url: string; archive: string }[] = [
  { url: '/fonts/NotoSansTC-Regular.ttf', archive: 'NotoSansTC-Regular.ttf' },
  { url: '/fonts/NotoSansTC-Bold.ttf',    archive: 'NotoSansTC-Bold.ttf' },
  { url: '/fonts/Montserrat-Regular.ttf', archive: 'Montserrat-Regular.ttf' },
  { url: '/fonts/Montserrat-Bold.ttf',    archive: 'Montserrat-Bold.ttf' },
];

const buildReadme = (missing: string[]): string => {
  const missingNote = missing.length
    ? `\n## ⚠️ 注意\n\n下列字型本次下載失敗，請稍後重試：\n${missing.map(m => `- ${m}`).join('\n')}\n`
    : '';
  return `# Apoint 簡報字型安裝指引
${missingNote}
## 為什麼需要安裝字型

Apoint 匯出的 PPTX 已內嵌字型，理論上不需要本機安裝。
但下列軟體開啟時會忽略嵌入字型、回退到系統字型：

- **Keynote**：完全不支援嵌入字型
- **Google Slides 上傳**：完全不支援
- 部分 **Mac PowerPoint** 舊版
- 某些 **LibreOffice Impress** 版本

如果你下載的簡報出現以下情況，請安裝本包字型：

- 中文顯示成方塊 / 「？」/ 缺字
- 字型外觀與預覽不同
- 排版位置跑掉、文字重疊

---

## macOS 安裝步驟

1. 解壓縮本 ZIP
2. 雙擊每個 \`.ttf\` 檔案
3. 在彈出的「字體簿」視窗點「**安裝字體**」
4. 全部裝完後，**完全結束並重新開啟**簡報軟體
   （Keynote / PowerPoint / Pages 都需要重啟才會載入新字型）

## Windows 安裝步驟

1. 解壓縮本 ZIP
2. 選取所有 \`.ttf\` 檔案
3. 右鍵 → 「**為所有使用者安裝**」（建議；需系統管理員權限）
   或「安裝」（只裝給目前使用者）
4. 重新開啟簡報

## Google Slides 上傳

Google Slides 完全不認 PPTX 內嵌字型，即便雲端有字型也只在線上呈現有效。建議：

- **改用桌面 PowerPoint 開啟**（最簡單，配合本包字型即可正常顯示）
- 或在 Google Slides 的字型選單手動載入 \`${CJK_FONT_NAME}\` 與 \`${LATIN_FONT_NAME}\`

---

## 字型來源 / 授權

- **${CJK_FONT_NAME}**：Google Noto 計畫，SIL Open Font License 1.1
- **${LATIN_FONT_NAME}**：Julieta Ulanovsky 設計，SIL Open Font License 1.1

兩者皆為開放字型，免費商用、可自由散布。
`;
};

/**
 * 下載「字型 + 安裝指引」ZIP 包。
 * 任一字型 fetch 失敗時不中斷，剩下的照常打包並在 README 標註缺失。
 * 全部失敗時仍會下載一個僅含 README 的 ZIP，給使用者明確的下一步指引。
 */
export async function downloadFontInstaller(): Promise<void> {
  const zip = new JSZip();

  const fetchResults = await Promise.allSettled(
    FONT_FILES.map(f => fetch(f.url).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.arrayBuffer();
    })),
  );

  const missing: string[] = [];
  fetchResults.forEach((result, i) => {
    const { archive } = FONT_FILES[i];
    if (result.status === 'fulfilled') {
      zip.file(archive, result.value);
    } else {
      missing.push(archive);
      console.warn(`[FontDownload] ${archive} 失敗:`, result.reason);
    }
  });

  zip.file('README.md', buildReadme(missing));

  const blob = await zip.generateAsync({ type: 'blob', mimeType: ZIP_MIME });
  triggerBlobDownload(blob, 'Apoint_Fonts.zip');
}
