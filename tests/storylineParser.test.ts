import { describe, it, expect } from 'vitest';
import { parseStoryline } from '../services/storylineParser';

/**
 * Table-driven test for parseStoryline.
 * 大綱解析的邊界 case 多，但行為易驗證（純函式、output 是結構化 segment 陣列）。
 */

interface Case {
  name: string;
  input: string;
  expectedTotalPages: number;
  // 若提供，逐段比對；否則只檢查總頁數
  expectedSegments?: { pageNumber: number; content: string }[];
}

const cases: Case[] = [
  {
    name: 'empty string → 0 pages',
    input: '',
    expectedTotalPages: 0,
    expectedSegments: [],
  },
  {
    name: 'whitespace only → 0 pages',
    input: '   \n  \n\t',
    expectedTotalPages: 0,
  },
  {
    name: 'single pN marker',
    input: 'p1 Introduction',
    expectedTotalPages: 1,
    expectedSegments: [{ pageNumber: 1, content: 'Introduction' }],
  },
  {
    name: 'multiple pN markers',
    input: 'p1 First\np2 Second\np3 Third',
    expectedTotalPages: 3,
    expectedSegments: [
      { pageNumber: 1, content: 'First' },
      { pageNumber: 2, content: 'Second' },
      { pageNumber: 3, content: 'Third' },
    ],
  },
  {
    name: 'pN with dot separator (p.1, p.2)',
    input: 'p.1 First\np.2 Second',
    expectedTotalPages: 2,
    expectedSegments: [
      { pageNumber: 1, content: 'First' },
      { pageNumber: 2, content: 'Second' },
    ],
  },
  {
    name: 'pN with colon separator (p1: ...)',
    input: 'p1: First\np2: Second',
    expectedTotalPages: 2,
    expectedSegments: [
      { pageNumber: 1, content: 'First' },
      { pageNumber: 2, content: 'Second' },
    ],
  },
  {
    name: 'continuation lines append to current segment',
    input: 'p1 Title\n- bullet a\n- bullet b\np2 Next title',
    expectedTotalPages: 2,
    expectedSegments: [
      { pageNumber: 1, content: 'Title\n- bullet a\n- bullet b' },
      { pageNumber: 2, content: 'Next title' },
    ],
  },
  {
    name: 'fallback: no pN → split by blank lines',
    input: 'First block paragraph\n\nSecond block paragraph\n\nThird block',
    expectedTotalPages: 3,
    expectedSegments: [
      { pageNumber: 1, content: 'First block paragraph' },
      { pageNumber: 2, content: 'Second block paragraph' },
      { pageNumber: 3, content: 'Third block' },
    ],
  },
  {
    name: 'fallback: single block, no markers, no blank lines → 1 page',
    input: 'just one line of content',
    expectedTotalPages: 1,
    expectedSegments: [{ pageNumber: 1, content: 'just one line of content' }],
  },
  {
    name: 'page numbers do not have to be sequential',
    input: 'p3 Third\np5 Fifth',
    expectedTotalPages: 2,
    expectedSegments: [
      { pageNumber: 3, content: 'Third' },
      { pageNumber: 5, content: 'Fifth' },
    ],
  },
  {
    name: 'case insensitive (P1, P2)',
    input: 'P1 First\nP2 Second',
    expectedTotalPages: 2,
    expectedSegments: [
      { pageNumber: 1, content: 'First' },
      { pageNumber: 2, content: 'Second' },
    ],
  },
  {
    name: 'blank lines between markers ignored',
    input: 'p1 First\n\n\np2 Second',
    expectedTotalPages: 2,
    expectedSegments: [
      { pageNumber: 1, content: 'First' },
      { pageNumber: 2, content: 'Second' },
    ],
  },
  {
    // p0 不是合法頁碼標記（頁碼從 1 起算）；應退化成「無 marker → 整段視為內容」
    name: 'p0 not treated as a page marker (pageNumber starts at 1)',
    input: 'p0 hello',
    expectedTotalPages: 1,
    expectedSegments: [{ pageNumber: 1, content: 'p0 hello' }],
  },
  {
    name: 'leading-zero marker p01 not accepted as marker',
    input: 'p01 hello',
    expectedTotalPages: 1,
    expectedSegments: [{ pageNumber: 1, content: 'p01 hello' }],
  },
];

describe('parseStoryline', () => {
  it.each(cases)('$name', ({ input, expectedTotalPages, expectedSegments }) => {
    const result = parseStoryline(input);

    expect(result.totalPageCount).toBe(expectedTotalPages);
    if (expectedSegments) {
      expect(result.segments).toEqual(expectedSegments);
    }
  });
});
