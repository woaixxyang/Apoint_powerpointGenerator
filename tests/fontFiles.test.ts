import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 守護 public/fonts/ 下的 TTF 不會再被換成「字重 / 字型名 / 字型格式不對的檔」。
 *
 * 背景（2026-05-15）：原 NotoSansTC-Regular.ttf 內部其實是 Adobe Source Han Sans
 * THIN（usWeightClass=100，family="Noto Sans TC Thin"），匯出 PPTX 後 PowerPoint Mac
 * 因為 family name 與 weight 不符，整批字直接落空 → 大量 □。
 *
 * 此測試直接讀 TTF 二進位的 OS/2 + name table，assert：
 *   1. 是 TTF（有 glyf 表）而非 OTF / WOFF / 變數字型（jsPDF 不吃 CFF）
 *   2. usWeightClass 等於檔名宣告的字重（400 / 700）
 *   3. nameID 1（family）等於對外字型名（"Noto Sans TC" / "Montserrat"）
 *   4. nameID 2（style）符合 Regular / Bold
 *   5. fsType 允許嵌入（installable / preview&print，不能 restricted）
 */

interface NameRecord {
  platformID: number;
  encodingID: number;
  languageID: number;
  nameID: number;
  length: number;
  offset: number;
}

interface FontMeta {
  hasGlyf: boolean;
  hasCFF: boolean;
  usWeightClass: number;
  fsType: number;
  family: string;
  style: string;
}

function readUint16BE(buf: Buffer, off: number): number {
  return buf.readUInt16BE(off);
}
function readUint32BE(buf: Buffer, off: number): number {
  return buf.readUInt32BE(off);
}

function parseTTF(filePath: string): FontMeta {
  const buf = fs.readFileSync(filePath);
  const numTables = readUint16BE(buf, 4);

  const tables: Record<string, { offset: number; length: number }> = {};
  for (let i = 0; i < numTables; i++) {
    const e = 12 + i * 16;
    const tag = buf.slice(e, e + 4).toString('ascii');
    const offset = readUint32BE(buf, e + 8);
    const length = readUint32BE(buf, e + 12);
    tables[tag] = { offset, length };
  }

  const hasGlyf = 'glyf' in tables;
  const hasCFF = 'CFF ' in tables || 'CFF2' in tables;

  if (!tables['OS/2']) throw new Error(`${filePath}: 缺少 OS/2 table`);
  const os2Off = tables['OS/2'].offset;
  const usWeightClass = readUint16BE(buf, os2Off + 4);
  const fsType = readUint16BE(buf, os2Off + 8);

  if (!tables['name']) throw new Error(`${filePath}: 缺少 name table`);
  const nameOff = tables['name'].offset;
  const nameCount = readUint16BE(buf, nameOff + 2);
  const storageOff = nameOff + readUint16BE(buf, nameOff + 4);

  // 收集 nameID → string，優先 Windows English (platformID=3, langID=0x409)
  const records: NameRecord[] = [];
  for (let i = 0; i < nameCount; i++) {
    const r = nameOff + 6 + i * 12;
    records.push({
      platformID: readUint16BE(buf, r),
      encodingID: readUint16BE(buf, r + 2),
      languageID: readUint16BE(buf, r + 4),
      nameID: readUint16BE(buf, r + 6),
      length: readUint16BE(buf, r + 8),
      offset: readUint16BE(buf, r + 10),
    });
  }

  const readName = (nameID: number): string => {
    // 優先 Windows English Unicode (3, 1, 0x409) — UTF-16BE
    const win = records.find(
      r => r.platformID === 3 && r.encodingID === 1 && r.languageID === 0x0409 && r.nameID === nameID,
    );
    if (win) {
      let s = '';
      for (let i = 0; i < win.length; i += 2) {
        s += String.fromCharCode(readUint16BE(buf, storageOff + win.offset + i));
      }
      return s;
    }
    // 退而求其次：Mac Roman ASCII
    const mac = records.find(r => r.platformID === 1 && r.nameID === nameID);
    if (mac) return buf.slice(storageOff + mac.offset, storageOff + mac.offset + mac.length).toString('latin1');
    return '';
  };

  return {
    hasGlyf,
    hasCFF,
    usWeightClass,
    fsType,
    family: readName(1),
    style: readName(2),
  };
}

interface Expectation {
  file: string;
  family: string;
  style: string;
  weight: number;
}

const EXPECTATIONS: Expectation[] = [
  { file: 'NotoSansTC-Regular.ttf', family: 'Noto Sans TC', style: 'Regular', weight: 400 },
  { file: 'NotoSansTC-Bold.ttf',    family: 'Noto Sans TC', style: 'Bold',    weight: 700 },
  { file: 'Montserrat-Regular.ttf', family: 'Montserrat',   style: 'Regular', weight: 400 },
  { file: 'Montserrat-Bold.ttf',    family: 'Montserrat',   style: 'Bold',    weight: 700 },
];

describe('public/fonts/ TTF 字型檔元資料守護', () => {
  for (const exp of EXPECTATIONS) {
    const fp = path.join('public', 'fonts', exp.file);

    it(`${exp.file}：family / style / weight 與檔名一致`, () => {
      expect(fs.existsSync(fp), `${exp.file} 不存在`).toBe(true);
      const meta = parseTTF(fp);

      expect(meta.hasGlyf, `${exp.file} 必須是 TTF（含 glyf table）`).toBe(true);
      expect(meta.hasCFF,  `${exp.file} 不應是 OTF（CFF table）— jsPDF 解不開`).toBe(false);

      expect(meta.usWeightClass, `${exp.file} OS/2 usWeightClass`).toBe(exp.weight);
      expect(meta.family,        `${exp.file} name ID 1 (family)`).toBe(exp.family);
      expect(meta.style,         `${exp.file} name ID 2 (style)`).toBe(exp.style);

      // fsType: 0 = Installable, 4 = Preview&Print。Restricted (2) 會被 PowerPoint 拒收
      expect([0, 4, 8], `${exp.file} fsType 必須允許嵌入`).toContain(meta.fsType);
    });
  }
});
