import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import JSZip from 'jszip';
import { obfuscate, fixPptxGenJsContentTypesBug, embedFontsAndSave, CJK_FONT_NAME, LATIN_FONT_NAME } from '../services/fontEmbedService';

/**
 * 這個 test 守護 ECMA-376 §22.4.2.4 字型混淆的兩個易碎前提：
 *   1. XOR pattern：前 32 bytes 與 reverse(key) XOR；尾部不動
 *   2. keyHex byte order：必須是 Windows GUID struct mixed-endian
 *      （Data1 LE / Data2 LE / Data3 LE / Data4 BE），不是 guidStr 的直接 hex
 *
 * 任何一個壞掉，產出 PPTX 在 PowerPoint 會跳「檔案毀損」，極難 debug。
 */

describe('fontEmbedService.obfuscate (ECMA-376 §22.4.2.4)', () => {
  it('XORs first 32 bytes with reversed key, leaves remainder untouched', () => {
    const keyHex = '0102030405060708090A0B0C0D0E0F10'; // 16 bytes
    // Font payload: 32 bytes of 0xFF（要被混淆）+ 16 bytes of 0xAA（要保留）
    const buffer = new ArrayBuffer(48);
    const view = new Uint8Array(buffer);
    view.fill(0xff, 0, 32);
    view.fill(0xaa, 32);

    const result = obfuscate(buffer, keyHex);

    // 前 16 bytes：與 key[15..0]（反向）XOR
    for (let i = 0; i < 16; i++) {
      const keyByte = parseInt(keyHex.slice((15 - i) * 2, (15 - i) * 2 + 2), 16);
      expect(result[i]).toBe(0xff ^ keyByte);
    }
    // bytes 16-31：相同模式（key[15..0]）XOR 一次
    for (let i = 0; i < 16; i++) {
      const keyByte = parseInt(keyHex.slice((15 - i) * 2, (15 - i) * 2 + 2), 16);
      expect(result[i + 16]).toBe(0xff ^ keyByte);
    }
    // bytes 32+：完全不動
    for (let i = 32; i < 48; i++) {
      expect(result[i]).toBe(0xaa);
    }
  });

  it('preserves total length', () => {
    const keyHex = 'D8C6B4A2F2E06C4A8E0A2C4E6880A2C4';
    const buffer = new ArrayBuffer(1024);
    const result = obfuscate(buffer, keyHex);
    expect(result.byteLength).toBe(1024);
  });

  it('is its own inverse (XOR property — 第二次混淆還原原檔)', () => {
    const keyHex = 'D8C6B4A2F2E06C4A8E0A2C4E6880A2C4';
    const buffer = new ArrayBuffer(128);
    const original = new Uint8Array(buffer);
    for (let i = 0; i < 128; i++) original[i] = (i * 7 + 13) & 0xff;
    const originalSnapshot = Array.from(original);

    const obf1 = obfuscate(buffer, keyHex);
    const obf2 = obfuscate(obf1.buffer, keyHex);

    expect(Array.from(obf2)).toEqual(originalSnapshot);
  });

  it('does not mutate the input buffer', () => {
    const keyHex = 'D8C6B4A2F2E06C4A8E0A2C4E6880A2C4';
    const buffer = new ArrayBuffer(64);
    new Uint8Array(buffer).fill(0x42);
    const before = Array.from(new Uint8Array(buffer));

    obfuscate(buffer, keyHex);

    expect(Array.from(new Uint8Array(buffer))).toEqual(before);
  });

  it('FONT_META keyHex 對應 GUID 的 Windows struct byte order', () => {
    // 文件範例：{A2B4C6D8-E0F2-4A6C-8E0A-2C4E6880A2C4}
    //   Data1 (4B LE): A2B4C6D8 → D8 C6 B4 A2
    //   Data2 (2B LE): E0F2     → F2 E0
    //   Data3 (2B LE): 4A6C     → 6C 4A
    //   Data4 (8B BE): 8E0A2C4E6880A2C4 → 8E 0A 2C 4E 68 80 A2 C4
    //   expected keyHex: D8C6B4A2 F2E0 6C4A 8E0A2C4E6880A2C4
    const guidNoBraces = 'A2B4C6D8-E0F2-4A6C-8E0A-2C4E6880A2C4';
    const expected = 'D8C6B4A2F2E06C4A8E0A2C4E6880A2C4';

    const reverseBytes = (hex: string): string =>
      hex.match(/.{2}/g)!.reverse().join('');

    const [d1, d2, d3, d4a, d4b] = guidNoBraces.split('-');
    const computed = (reverseBytes(d1) + reverseBytes(d2) + reverseBytes(d3) + d4a + d4b).toUpperCase();

    expect(computed).toBe(expected);
  });
});

/**
 * PptxGenJS 4.0.1 bug：為每張 slide 寫一個 slideMaster Override 到 Content_Types，
 * 但實際只產 slideMaster1.xml。N-1 個 dangling reference → PowerPoint「文件已損毀」。
 * 這個 test 守護修補邏輯：保留 slideMaster1，移除 slideMaster2 ~ N。
 */
describe('fixPptxGenJsContentTypesBug', () => {
  const makeContentTypesXml = (slideMasterCount: number, slideCount: number) => {
    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`;
    xml += '<Default Extension="xml" ContentType="application/xml"/>';
    xml += '<Override PartName="/ppt/presentation.xml" ContentType="..."/>';
    for (let i = 1; i <= slideMasterCount; i++) {
      xml += `<Override PartName="/ppt/slideMasters/slideMaster${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`;
    }
    for (let i = 1; i <= slideCount; i++) {
      xml += `<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
    }
    xml += '</Types>';
    return xml;
  };

  const countOverrides = (xml: string, partPrefix: string): number => {
    const re = new RegExp(`<Override\\s+PartName="${partPrefix}[^"]+"`, 'g');
    return (xml.match(re) || []).length;
  };

  it('keeps slideMaster1, removes slideMaster2 onwards (39-slide case)', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', makeContentTypesXml(39, 39));

    await fixPptxGenJsContentTypesBug(zip);

    const fixed = await zip.file('[Content_Types].xml')!.async('string');
    expect(countOverrides(fixed, '/ppt/slideMasters/')).toBe(1);
    expect(fixed).toContain('slideMaster1.xml');
    expect(fixed).not.toContain('slideMaster2.xml');
    expect(fixed).not.toContain('slideMaster39.xml');
    // 不應影響 slide overrides
    expect(countOverrides(fixed, '/ppt/slides/')).toBe(39);
  });

  it('handles 100+ slide indices (regex 不能漏掉雙位數/三位數)', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', makeContentTypesXml(150, 150));

    await fixPptxGenJsContentTypesBug(zip);

    const fixed = await zip.file('[Content_Types].xml')!.async('string');
    expect(countOverrides(fixed, '/ppt/slideMasters/')).toBe(1);
    expect(fixed).not.toContain('slideMaster100.xml');
    expect(fixed).not.toContain('slideMaster99.xml');
  });

  it('does nothing if already only one slideMaster (idempotent)', async () => {
    const zip = new JSZip();
    const before = makeContentTypesXml(1, 5);
    zip.file('[Content_Types].xml', before);

    await fixPptxGenJsContentTypesBug(zip);

    const after = await zip.file('[Content_Types].xml')!.async('string');
    expect(after).toBe(before);
  });

  it('does nothing if Content_Types.xml missing', async () => {
    const zip = new JSZip();
    await expect(fixPptxGenJsContentTypesBug(zip)).resolves.toBeUndefined();
  });
});

/**
 * 守護 family 級缺失偵測：CJK 整個 family 載不到時必須 throw，
 * 避免「Latin 嵌入成功 / CJK 沒嵌入」這種半成品靜默通過 → 使用者本機無
 * Noto Sans TC 時中文顯示為缺字方塊。
 */
describe('embedFontsAndSave — family-level fallback detection', () => {
  // 建立最小可用的 PPTX zip：要有 ppt/presentation.xml, ppt/_rels/presentation.xml.rels,
  // [Content_Types].xml — embedFontsAndSave 才不會在前置檢查階段失敗
  async function makeMinimalPptxBuffer(): Promise<ArrayBuffer> {
    const zip = new JSZip();
    zip.file('[Content_Types].xml',
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/xml"/></Types>');
    zip.file('ppt/_rels/presentation.xml.rels',
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="x" Target="y"/></Relationships>');
    zip.file('ppt/presentation.xml',
      '<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"></p:presentation>');
    return zip.generateAsync({ type: 'arraybuffer' });
  }

  const dummyTtf = new ArrayBuffer(128); // 任意 32+ bytes 給 obfuscate

  let origFetch: typeof globalThis.fetch;
  let downloadCalls: { fileName: string }[];

  beforeEach(() => {
    origFetch = globalThis.fetch;
    downloadCalls = [];
    vi.doMock('../utils/download', () => ({
      triggerBlobDownload: async (_blob: Blob, fileName: string) => {
        downloadCalls.push({ fileName });
      },
    }));
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.doUnmock('../utils/download');
  });

  it('CJK family 兩個 variant 全失敗、Latin 全成功 → throw（不允許靜默產出缺中文的 PPTX）', async () => {
    globalThis.fetch = (async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('NotoSansTC')) {
        return new Response('', { status: 404 });
      }
      if (url.includes('Montserrat')) {
        return new Response(dummyTtf, { status: 200 });
      }
      return new Response('', { status: 404 });
    }) as typeof fetch;

    const pptxBuffer = await makeMinimalPptxBuffer();
    await expect(embedFontsAndSave(pptxBuffer, 'test.pptx'))
      .rejects.toThrow(new RegExp(CJK_FONT_NAME));
  });

  it('Latin family 全失敗、CJK 全成功 → 一樣 throw（任何 family 0/N 都不可接受）', async () => {
    globalThis.fetch = (async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('Montserrat')) return new Response('', { status: 404 });
      if (url.includes('NotoSansTC')) return new Response(dummyTtf, { status: 200 });
      return new Response('', { status: 404 });
    }) as typeof fetch;

    const pptxBuffer = await makeMinimalPptxBuffer();
    await expect(embedFontsAndSave(pptxBuffer, 'test.pptx'))
      .rejects.toThrow(new RegExp(LATIN_FONT_NAME));
  });

  it('全部 family 都有至少一個 variant 成功 → 正常嵌入（regular 缺失但 bold 有 → 不 throw）', async () => {
    globalThis.fetch = (async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      // 兩個 family 都只有 bold 成功，regular 失敗（兩個都 ≥1 variant）
      if (url.includes('Bold')) return new Response(dummyTtf, { status: 200 });
      return new Response('', { status: 404 });
    }) as typeof fetch;

    const pptxBuffer = await makeMinimalPptxBuffer();
    await expect(embedFontsAndSave(pptxBuffer, 'test.pptx')).resolves.toBeUndefined();
  });
});
