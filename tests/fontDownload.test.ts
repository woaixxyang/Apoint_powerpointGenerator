/**
 * 守護 downloadFontInstaller 的三個保證：
 *   (1) 4 個字型 fetch 成功 → zip 內 4 個 TTF + README.md
 *   (2) 部分 fetch 失敗 → zip 仍含成功的 + README 標註缺失
 *   (3) 全部 fetch 失敗 → 仍下載「只含 README」的 zip 給使用者下一步指引
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import JSZip from 'jszip';

let capturedBlob: Blob | null = null;
let capturedFileName: string | null = null;

vi.mock('../utils/download', () => ({
  triggerBlobDownload: async (blob: Blob, fileName: string) => {
    capturedBlob = blob;
    capturedFileName = fileName;
  },
}));

const dummyTtfBuffer = (size: number = 256): ArrayBuffer => new ArrayBuffer(size);

describe('downloadFontInstaller', () => {
  let origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    capturedBlob = null;
    capturedFileName = null;
    origFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('4 個 TTF 全成功 → zip 含 4 TTF + README.md，且無「缺失」警告', async () => {
    globalThis.fetch = (async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.startsWith('/fonts/')) {
        return new Response(dummyTtfBuffer(), { status: 200 });
      }
      return new Response('', { status: 404 });
    }) as typeof fetch;

    const { downloadFontInstaller } = await import('../services/fontDownloadService');
    await downloadFontInstaller();

    expect(capturedFileName).toBe('Apoint_Fonts.zip');
    expect(capturedBlob).not.toBeNull();

    const zip = await JSZip.loadAsync(await capturedBlob!.arrayBuffer());
    expect(zip.file('NotoSansTC-Regular.ttf')).not.toBeNull();
    expect(zip.file('NotoSansTC-Bold.ttf')).not.toBeNull();
    expect(zip.file('Montserrat-Regular.ttf')).not.toBeNull();
    expect(zip.file('Montserrat-Bold.ttf')).not.toBeNull();
    expect(zip.file('README.md')).not.toBeNull();

    const readme = await zip.file('README.md')!.async('string');
    expect(readme).not.toMatch(/失敗|⚠️ 注意/);
    expect(readme).toMatch(/Noto Sans TC/);
    expect(readme).toMatch(/Montserrat/);
    expect(readme).toMatch(/macOS/);
    expect(readme).toMatch(/Windows/);
  });

  it('部分 TTF fetch 失敗 → zip 含成功者 + README 標註缺失檔', async () => {
    globalThis.fetch = (async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('NotoSansTC-Regular')) return new Response('', { status: 404 });
      if (url.startsWith('/fonts/')) return new Response(dummyTtfBuffer(), { status: 200 });
      return new Response('', { status: 404 });
    }) as typeof fetch;

    const { downloadFontInstaller } = await import('../services/fontDownloadService');
    await downloadFontInstaller();

    const zip = await JSZip.loadAsync(await capturedBlob!.arrayBuffer());
    expect(zip.file('NotoSansTC-Regular.ttf')).toBeNull(); // 缺失
    expect(zip.file('NotoSansTC-Bold.ttf')).not.toBeNull();
    expect(zip.file('Montserrat-Regular.ttf')).not.toBeNull();
    expect(zip.file('Montserrat-Bold.ttf')).not.toBeNull();

    const readme = await zip.file('README.md')!.async('string');
    expect(readme).toMatch(/NotoSansTC-Regular\.ttf/);
    expect(readme).toMatch(/⚠️/);
  });

  it('全部 TTF fetch 失敗 → 仍下載 zip（只含 README），給使用者下一步指引', async () => {
    globalThis.fetch = (async () => new Response('', { status: 503 })) as typeof fetch;

    const { downloadFontInstaller } = await import('../services/fontDownloadService');
    await downloadFontInstaller();

    expect(capturedFileName).toBe('Apoint_Fonts.zip');
    const zip = await JSZip.loadAsync(await capturedBlob!.arrayBuffer());
    expect(zip.file('README.md')).not.toBeNull();
    // 不應有任何 TTF
    expect(Object.keys(zip.files).filter(n => n.endsWith('.ttf'))).toEqual([]);
    const readme = await zip.file('README.md')!.async('string');
    // 四個檔名都應該被列在缺失區
    expect(readme).toMatch(/NotoSansTC-Regular\.ttf/);
    expect(readme).toMatch(/NotoSansTC-Bold\.ttf/);
    expect(readme).toMatch(/Montserrat-Regular\.ttf/);
    expect(readme).toMatch(/Montserrat-Bold\.ttf/);
  });

  it('fetch 拋例外（網路斷線）也不該炸 → 視同失敗，README 標註', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as typeof fetch;

    const { downloadFontInstaller } = await import('../services/fontDownloadService');
    await expect(downloadFontInstaller()).resolves.toBeUndefined();
    expect(capturedBlob).not.toBeNull();
  });
});
