/**
 * 開源邊界守門測試（見計畫 §2.5）。
 *
 * 規則：可公開（OSS 公眾版）的程式碼 — `core/`、`editions/public/`、`components/`、
 * 通用 `services/`（不含 `services/commercial/`）、根層 entry — **永不** import 私有目錄：
 *   - `services/commercial/`（商業加值服務）
 *   - `editions/h2u/`（h2u 專屬 profile；core 只能透過 build-time `@edition` alias 取得）
 *   - `functions/`（Firebase Cloud Functions）
 *
 * 違反即代表未來「抽出公眾版開源」會洩漏私有碼，測試 fail 擋下。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');

/** 可公開程式碼的掃描根（目錄 + 個別檔） */
const PUBLIC_SAFE_DIRS = ['core', 'editions/public', 'components', 'services'];
const PUBLIC_SAFE_FILES = ['App.tsx', 'index.tsx'];

/** 掃描時要跳過的子路徑（私有目錄本身可自由 import 私有碼） */
const SKIP_SUBPATHS = ['services/commercial'];

/**
 * 私有目錄 — 可公開碼不得 import。
 * `allowDynamic`：允許以 dynamic import() 載入（受 FEATURES gate、可被 dead-code 消除，
 * 不會進 OSS bundle）。static import / from / require 一律禁止（必然打包）。
 */
const FORBIDDEN: Array<{ test: (spec: string) => boolean; label: string; allowDynamic: boolean }> = [
  // 商業服務：Phase 5 消費端以 `if (PROFILE.features.x) await import('...')` gated 載入 → 允許 dynamic
  { label: 'services/commercial', allowDynamic: true, test: (s) => /(^|\/)services\/commercial(\/|$)/.test(s) },
  // h2u profile 只能經 build-time `@edition` alias 取得，前端絕不直接 import
  { label: 'editions/h2u', allowDynamic: false, test: (s) => /(^|\/)editions\/h2u(\/|$)/.test(s) },
  { label: 'functions', allowDynamic: false, test: (s) => /(^|\/)functions(\/|$)/.test(s) },
];

function collectFiles(dir: string, acc: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc; // 目錄不存在（如尚未建立的 editions/public 子結構）→ 略過
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = relative(ROOT, full).replace(/\\/g, '/');
    if (SKIP_SUBPATHS.some((p) => rel === p || rel.startsWith(p + '/'))) continue;
    if (entry.isDirectory()) {
      collectFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/** 抽出檔案中所有 import 的 module specifier，標記是否為 dynamic import() */
function extractImportSpecifiers(src: string): Array<{ spec: string; dynamic: boolean }> {
  const out: Array<{ spec: string; dynamic: boolean }> = [];
  const staticPatterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g, // import ... from '...'
    /\bimport\s+['"]([^'"]+)['"]/g, // import '...'（side-effect）
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of staticPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) out.push({ spec: m[1], dynamic: false });
  }
  const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g; // dynamic import('...')
  let d: RegExpExecArray | null;
  while ((d = dynRe.exec(src)) !== null) out.push({ spec: d[1], dynamic: true });
  return out;
}

describe('開源邊界（§2.5）：可公開碼不得 import 私有目錄', () => {
  const files = [
    ...PUBLIC_SAFE_DIRS.flatMap((d) => collectFiles(join(ROOT, d))),
    ...PUBLIC_SAFE_FILES.map((f) => join(ROOT, f)),
  ];

  it('掃描到的可公開檔數量 > 0（確保測試真的有在掃）', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('沒有任何可公開檔 import services/commercial、editions/h2u 或 functions', () => {
    const violations: string[] = [];
    for (const file of files) {
      let src: string;
      try {
        src = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      for (const { spec, dynamic } of extractImportSpecifiers(src)) {
        const hit = FORBIDDEN.find((f) => f.test(spec));
        if (!hit) continue;
        if (dynamic && hit.allowDynamic) continue; // gated dynamic import → 允許
        const kind = dynamic ? 'dynamic import' : 'static import';
        violations.push(`${rel}  →  ${kind} "${spec}"  （違反：${hit.label}）`);
      }
    }
    expect(violations, `\n發現開源邊界違規：\n${violations.join('\n')}\n`).toEqual([]);
  });
});
