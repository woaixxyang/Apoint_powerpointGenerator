
import { StorylineSegment, StorylineParsed } from '../types';

/**
 * Parse raw storyline text into page segments.
 *
 * Primary: Match lines starting with pN or p.N (case-insensitive) followed by space, dot, colon.
 * Fallback: If no pN markers found, split by blank lines.
 */
export function parseStoryline(rawText: string): StorylineParsed {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { segments: [], totalPageCount: 0 };
  }

  const lines = trimmed.split('\n');
  // 頁碼從 1 起算：用 [1-9]\d* 排除 p0 / 前導零，避免產生 pageNumber=0 與 prompt 的 "P0" 不一致
  const markerRegex = /^p\.?([1-9]\d*)(?:[\s.:：]|$)/i;

  // Check if any pN markers exist
  const hasMarkers = lines.some(line => markerRegex.test(line.trim()));

  let segments: StorylineSegment[];

  if (hasMarkers) {
    segments = parseWithMarkers(lines, markerRegex);
  } else {
    segments = parseByBlankLines(trimmed);
  }

  return {
    segments,
    totalPageCount: segments.length,
  };
}

function parseWithMarkers(lines: string[], markerRegex: RegExp): StorylineSegment[] {
  const segments: StorylineSegment[] = [];
  let currentSegment: StorylineSegment | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(markerRegex);
    if (match) {
      if (currentSegment) {
        segments.push(currentSegment);
      }
      const pageNum = parseInt(match[1], 10);
      const content = line.replace(markerRegex, '').trim();
      currentSegment = { pageNumber: pageNum, content };
    } else if (currentSegment) {
      // Continuation line — append to current segment
      currentSegment.content += '\n' + line;
    }
  }

  if (currentSegment) {
    segments.push(currentSegment);
  }

  return segments;
}

function parseByBlankLines(text: string): StorylineSegment[] {
  const blocks = text.split(/\n\s*\n/).filter(b => b.trim());
  return blocks.map((block, i) => ({
    pageNumber: i + 1,
    content: block.trim(),
  }));
}
