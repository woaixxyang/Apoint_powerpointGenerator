import JSZip from 'jszip';
import { triggerBlobDownload } from '../utils/download';

export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

// 字型名稱常數：供 nativePptxService 引用，保持單一來源
export const CJK_FONT_NAME = 'Noto Sans TC';
export const LATIN_FONT_NAME = 'Montserrat';

/**
 * FontVariant 欄位說明：
 *
 * weight   - 對應 PPTX <p:embeddedFont> 內子元素 <p:regular> / <p:bold> / <p:italic> /
 *            <p:boldItalic>，告訴 PowerPoint 此檔是哪一個字重 / 樣式。
 *
 * guidStr  - 標準 GUID 格式（{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}），
 *            寫入 <p:regular|bold ... fontKey="..."/>，讓 PowerPoint 知道用哪個 GUID 解混淆。
 *
 * keyHex   - XOR 金鑰（16 bytes hex）。Windows GUID struct 混合 endian：
 *              Data1 (4B) little-endian、Data2 (2B) little-endian、
 *              Data3 (2B) little-endian、Data4 (8B) big-endian。
 *            因此 keyHex ≠ guidStr 去掉符號的直接 hex。
 *
 * 推導範例 {A2B4C6D8-E0F2-4A6C-8E0A-2C4E6880A2C4}：
 *   Data1: A2B4C6D8 → LE → D8 C6 B4 A2
 *   Data2: E0F2     → LE → F2 E0
 *   Data3: 4A6C     → LE → 6C 4A
 *   Data4: 8E0A2C4E6880A2C4 → BE → 8E 0A 2C 4E 68 80 A2 C4
 *   keyHex = D8C6B4A2F2E06C4A8E0A2C4E6880A2C4
 */
type FontWeight = 'regular' | 'bold';

interface FontVariant {
  weight: FontWeight;
  file: string;
  entry: string;
  guidStr: string;
  keyHex: string;
}

interface FontFamily {
  name: string;
  charset: number;
  pitchFamily: number;
  variants: readonly FontVariant[];
}

const FONT_FAMILIES: readonly FontFamily[] = [
  {
    name: CJK_FONT_NAME,
    charset: 136,   // CHINESEBIG5_CHARSET (Traditional Chinese)
    pitchFamily: 34,
    variants: [
      {
        weight: 'regular',
        file: '/fonts/NotoSansTC-Regular.ttf',
        entry: 'ppt/fonts/notoSansTC-r.fntdata',
        guidStr: '{A2B4C6D8-E0F2-4A6C-8E0A-2C4E6880A2C4}',
        keyHex:  'D8C6B4A2F2E06C4A8E0A2C4E6880A2C4',
      },
      {
        weight: 'bold',
        file: '/fonts/NotoSansTC-Bold.ttf',
        entry: 'ppt/fonts/notoSansTC-b.fntdata',
        guidStr: '{C4D6E8FA-1306-4B7D-9F1C-4D6F899AC4D6}',
        keyHex:  'FAE8D6C406137D4B9F1C4D6F899AC4D6',
      },
    ],
  },
  {
    name: LATIN_FONT_NAME,
    charset: 0,
    pitchFamily: 34,
    variants: [
      {
        weight: 'regular',
        file: '/fonts/Montserrat-Regular.ttf',
        entry: 'ppt/fonts/montserrat-r.fntdata',
        guidStr: '{B3C5D7E9-F1A3-5B7D-9F1B-3D5F7991B3D5}',
        keyHex:  'E9D7C5B3A3F17D5B9F1B3D5F7991B3D5',
      },
      {
        weight: 'bold',
        file: '/fonts/Montserrat-Bold.ttf',
        entry: 'ppt/fonts/montserrat-b.fntdata',
        guidStr: '{D5E7F9AB-2417-4C8E-AF2D-5E70AAABD5E7}',
        keyHex:  'ABF9E7D517248E4CAF2D5E70AAABD5E7',
      },
    ],
  },
];

const FONT_REL_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font';

/**
 * ECMA-376 §22.4.2.4 混淆演算法：
 * 複製字型前 32 bytes，以反向排列的 keyHex bytes 做 XOR，其餘位元組原樣保留。
 *
 * Exported for testing — production 呼叫透過 embedFontsAndSave。
 */
export function obfuscate(fontBuffer: ArrayBuffer, keyHex: string): Uint8Array {
  const key = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    key[i] = parseInt(keyHex.slice(i * 2, i * 2 + 2), 16);
  }
  const head = new Uint8Array(fontBuffer.slice(0, 32));
  for (let i = 0; i < 16; i++) {
    head[i]      ^= key[15 - i];
    head[i + 16] ^= key[15 - i];
  }
  const tail = new Uint8Array(fontBuffer, 32);
  const result = new Uint8Array(fontBuffer.byteLength);
  result.set(head, 0);
  result.set(tail, 32);
  return result;
}

function requireZipFile(zip: JSZip, path: string): JSZip.JSZipObject {
  const f = zip.file(path);
  if (!f) throw new Error(`PPTX ZIP 缺少必要檔案: ${path}`);
  return f;
}

/**
 * 修復 PptxGenJS 4.0.1 的 bug：它為每張 slide 都寫一個 slideMaster Override
 * 到 [Content_Types].xml（slideMaster1.xml ~ slideMasterN.xml），但實際只
 * 產生 slideMaster1.xml 一個檔案。這造成 N-1 個 dangling reference，
 * PowerPoint 開啟時提示「文件已損毀，需修復」，修復後排版會跑掉。
 *
 * 解法：保留 slideMaster1.xml 的 Override，移除 slideMaster2.xml ~ N。
 * 參考：node_modules/pptxgenjs/dist/pptxgen.cjs.js:6353 的迴圈 bug。
 */
export async function fixPptxGenJsContentTypesBug(zip: JSZip): Promise<void> {
  const ctPath = '[Content_Types].xml';
  const ctFile = zip.file(ctPath);
  if (!ctFile) return;
  let ctXml = await ctFile.async('string');
  // 移除 slideMaster2.xml ~ slideMasterN.xml 的 Override（保留 slideMaster1）
  const before = ctXml.length;
  ctXml = ctXml.replace(
    /<Override\s+PartName="\/ppt\/slideMasters\/slideMaster(?:[2-9]|[1-9]\d+)\.xml"[^>]*?\/>/g,
    '',
  );
  if (ctXml.length !== before) {
    zip.file(ctPath, ctXml);
  }
}

/**
 * 把所有 FONT_FAMILIES 攤平成 (family, variant) pair 清單，方便平行 fetch。
 */
type VariantSpec = { family: FontFamily; variant: FontVariant };
type LoadedVariant = { spec: VariantSpec; buffer: ArrayBuffer };

function flattenVariants(): VariantSpec[] {
  return FONT_FAMILIES.flatMap(family =>
    family.variants.map(variant => ({ family, variant })),
  );
}

export async function embedFontsAndSave(
  pptxBuffer: ArrayBuffer,
  fileName: string,
): Promise<void> {
  const zip = await JSZip.loadAsync(pptxBuffer);

  // 修 PptxGenJS 4.0.1 重複 slideMaster Override 的 bug（必跑，不依賴字型嵌入）
  await fixPptxGenJsContentTypesBug(zip);

  // 平行 fetch 所有 variant；allSettled 確保單一字型失敗不中斷整個匯出
  const allVariants = flattenVariants();
  const fontResults = await Promise.allSettled(
    allVariants.map(({ variant }) => fetch(variant.file).then(r => {
      if (!r.ok) throw new Error(`字型載入失敗: ${variant.file} (${r.status})`);
      return r.arrayBuffer();
    })),
  );

  const loaded: LoadedVariant[] = allVariants
    .map((spec, i) => {
      const result = fontResults[i];
      if (result.status === 'rejected') {
        console.warn(`[FontEmbed] 跳過字型 ${spec.family.name} ${spec.variant.weight}:`, result.reason);
        return null;
      }
      return { spec, buffer: result.value };
    })
    .filter((f): f is LoadedVariant => f !== null);

  if (loaded.length === 0) {
    console.warn('[FontEmbed] 所有字型載入失敗，匯出 PPTX 但不嵌入字型');
    const blob = await zip.generateAsync({ type: 'blob', mimeType: PPTX_MIME });
    triggerBlobDownload(blob, fileName);
    return;
  }

  // 偵測「整個 family 一個 variant 都沒載入」的情況：例如 CJK Regular/Bold 兩個都失敗
  // 但 Latin 成功 → 嵌進 PPTX 的字型清單缺 CJK，本機沒裝 Noto Sans TC 的使用者
  // 打開後中文會被替代字型取代或顯示為缺字方塊。比全部失敗更危險（因為靜默通過）。
  // 直接 throw，讓 caller 走「沒嵌字型」的降級路徑，並提示使用者要安裝字型。
  const familyLoadCount = new Map<string, number>();
  FONT_FAMILIES.forEach(f => familyLoadCount.set(f.name, 0));
  loaded.forEach(({ spec }) => {
    familyLoadCount.set(spec.family.name, (familyLoadCount.get(spec.family.name) || 0) + 1);
  });
  const missingFamilies = [...familyLoadCount.entries()]
    .filter(([, n]) => n === 0)
    .map(([name]) => name);
  if (missingFamilies.length > 0) {
    throw new Error(`字型 family 完全載入失敗: ${missingFamilies.join(', ')}（可能是 /fonts/ 路徑或 Service Worker cache 異常）`);
  }

  // 計算現有 rId 最大值，避免衝突
  const relsPath = 'ppt/_rels/presentation.xml.rels';
  let relsXml = await requireZipFile(zip, relsPath).async('string');
  const existingIds = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map(m => parseInt(m[1]));
  let nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 10;

  // 為每個 loaded variant 分配獨立 rId
  const variantRids: string[] = loaded.map(() => `rId${nextId++}`);

  // 寫入混淆字型
  loaded.forEach(({ spec, buffer }) => {
    zip.file(spec.variant.entry, obfuscate(buffer, spec.variant.keyHex));
  });

  // presentation.xml.rels：每個 variant 一個 Relationship
  const newRels = loaded.map(({ spec }, i) =>
    `<Relationship Id="${variantRids[i]}" Type="${FONT_REL_TYPE}" Target="${spec.variant.entry.replace('ppt/', '')}"/>`,
  ).join('\n');
  relsXml = relsXml.replace('</Relationships>', newRels + '\n</Relationships>');
  zip.file(relsPath, relsXml);

  // [Content_Types].xml：加入 .fntdata 的 MIME 類型（若尚未存在）
  let ctXml = await requireZipFile(zip, '[Content_Types].xml').async('string');
  if (!ctXml.includes('fntdata')) {
    ctXml = ctXml.replace(
      '</Types>',
      '<Default Extension="fntdata" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/>\n</Types>',
    );
    zip.file('[Content_Types].xml', ctXml);
  }

  // 依 family 分組產 <p:embeddedFont>：同一個 family 的 regular / bold 子元素聚在一塊
  const grouped = new Map<string, { family: FontFamily; entries: { variant: FontVariant; rid: string }[] }>();
  loaded.forEach(({ spec }, i) => {
    const key = spec.family.name;
    if (!grouped.has(key)) grouped.set(key, { family: spec.family, entries: [] });
    grouped.get(key)!.entries.push({ variant: spec.variant, rid: variantRids[i] });
  });

  const fontEntries = Array.from(grouped.values()).map(({ family, entries }) => {
    const variantEls = entries
      .map(({ variant, rid }) =>
        `<p:${variant.weight} r:id="${rid}" fontKey="${variant.guidStr}"/>`,
      )
      .join('');
    return `<p:embeddedFont>` +
      `<p:font typeface="${family.name}" charset="${family.charset}" pitchFamily="${family.pitchFamily}"/>` +
      variantEls +
      `</p:embeddedFont>`;
  }).join('');

  const embeddedFontLst = `<p:embeddedFontLst>${fontEntries}</p:embeddedFontLst>`;

  let presXml = await requireZipFile(zip, 'ppt/presentation.xml').async('string');
  presXml = presXml.includes('<p:embeddedFontLst>')
    ? presXml.replace(/<p:embeddedFontLst>[\s\S]*?<\/p:embeddedFontLst>/, embeddedFontLst)
    : presXml.replace('</p:presentation>', embeddedFontLst + '</p:presentation>');
  zip.file('ppt/presentation.xml', presXml);

  const blob = await zip.generateAsync({ type: 'blob', mimeType: PPTX_MIME });
  triggerBlobDownload(blob, fileName);
}
