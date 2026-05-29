import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateWithFallback } from '../services/geminiService';

/**
 * 守護 timeout / abort / 模型降級三條核心路徑：
 *   - 逾時 → 拋 GenerationTimeoutError（前次 image 模式 bug 就死在這條）
 *   - 外部 signal abort → 拋 AbortError（不被改寫成 timeout）
 *   - 主模型失敗 → 自動降級備用模型
 *   - 已被 abort → 不浪費呼叫去打備用模型
 */

// 模擬一個永遠不 resolve 的 fetch，僅在 signal abort 時 reject
function makeHangingFetch(): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  });
}

// 把 promise 的 rejection 轉成 value，避免 vitest fake-timer 場景下出現
// "unhandled rejection" 警告（rejection 在 advanceTimers 期間發生，但 .rejects
// 還沒 attach）
function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: any }> {
  return p.then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error }),
  );
}

describe('generateWithFallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns primary response on success without calling fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'primary OK' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateWithFallback({ contents: [] } as never);

    expect(result.text).toBe('primary OK');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to fallback model after primary fails twice (initial + retry)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'p1' }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'p2 retry' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'fallback OK' }) });
    vi.stubGlobal('fetch', fetchMock);

    const settled = settle(generateWithFallback({ contents: [] } as never));
    await vi.advanceTimersByTimeAsync(2_000); // 等 primary retry 退避完成
    const result = await settled;

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.text).toBe('fallback OK');
    // primary 2 次 + fallback 1 次 = 3 次
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws GenerationTimeoutError after timeoutMs (此即 image 模式 bug 的回歸測試)', async () => {
    vi.stubGlobal('fetch', makeHangingFetch());

    const settled = settle(generateWithFallback({ contents: [] } as never, undefined, 5_000));
    await vi.advanceTimersByTimeAsync(5_001);
    const result = await settled;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.name).toBe('GenerationTimeoutError');
      expect(result.error.message).toContain('5 秒');
    }
  });

  it('throws AbortError (NOT GenerationTimeoutError) when external signal aborts', async () => {
    vi.stubGlobal('fetch', makeHangingFetch());

    const externalController = new AbortController();
    const settled = settle(generateWithFallback({ contents: [] } as never, externalController.signal, 60_000));
    externalController.abort();
    const result = await settled;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.name).toBe('AbortError');
      expect(result.error.name).not.toBe('GenerationTimeoutError');
    }
  });

  it('does not retry fallback when aborted by external signal', async () => {
    const fetchMock = makeHangingFetch();
    vi.stubGlobal('fetch', fetchMock);

    const externalController = new AbortController();
    const settled = settle(generateWithFallback({ contents: [] } as never, externalController.signal));
    externalController.abort();
    const result = await settled;

    expect(result.ok).toBe(false);
    // 若降級邏輯沒檢查 abort 狀態，會錯誤地呼叫第二次 fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry fallback when aborted by timeout', async () => {
    const fetchMock = makeHangingFetch();
    vi.stubGlobal('fetch', fetchMock);

    const settled = settle(generateWithFallback({ contents: [] } as never, undefined, 3_000));
    await vi.advanceTimersByTimeAsync(3_001);
    const result = await settled;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.name).toBe('GenerationTimeoutError');
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // ── Retry 機制（503 / 網路偶發錯誤）─────────────────────
  // primary 失敗 → wait 1.5s → retry primary → 仍失敗 → fallback → wait 1.5s → retry fallback → throw
  //
  // 退避時間用 fake timer 加速。

  it('retries primary once before falling back when primary returns non-OK', async () => {
    const fetchMock = vi
      .fn()
      // 第 1 次：primary 503
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'UNAVAILABLE' }) })
      // 第 2 次：primary retry 成功
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'primary retry OK' }) });
    vi.stubGlobal('fetch', fetchMock);

    const settled = settle(generateWithFallback({ contents: [] } as never));
    await vi.advanceTimersByTimeAsync(2_000); // 走完 1.5s 退避
    const result = await settled;

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.text).toBe('primary retry OK');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('switches to fallback after primary retry also fails, and retries fallback once', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'p1' }) }) // primary 1
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'p2' }) }) // primary retry
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'f1' }) }) // fallback 1
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'fallback retry OK' }) }); // fallback retry
    vi.stubGlobal('fetch', fetchMock);

    const settled = settle(generateWithFallback({ contents: [] } as never));
    await vi.advanceTimersByTimeAsync(4_000); // 兩次 1.5s 退避
    const result = await settled;

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.text).toBe('fallback retry OK');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('throws after all 4 attempts exhausted (primary x2 + fallback x2)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'down' }) });
    vi.stubGlobal('fetch', fetchMock);

    const settled = settle(generateWithFallback({ contents: [] } as never));
    await vi.advanceTimersByTimeAsync(4_000);
    const result = await settled;

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  // ── 429 quota 走較長退避（8s），不能與一般 503 retry 共用 1.5s ────────
  it('uses RATE_LIMIT_RETRY_DELAY_MS (8s) for 429, not the default 1.5s', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: 'quota', code: 'RATE_LIMIT' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'after long wait' }) });
    vi.stubGlobal('fetch', fetchMock);

    const settled = settle(generateWithFallback({ contents: [] } as never));

    // 1.5s 推進後不應該 retry（429 要 8s）
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 補滿剩下到 8s 後 retry 才會發生
    await vi.advanceTimersByTimeAsync(7_000);
    const result = await settled;

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.text).toBe('after long wait');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to next model after 429 retry also fails', async () => {
    const fetchMock = vi
      .fn()
      // primary 兩次都 429
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: 'p429-1' }) })
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: 'p429-2' }) })
      // fallback 第一次就成功（不同 model 有獨立 RPM）
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'fallback OK after primary 429' }) });
    vi.stubGlobal('fetch', fetchMock);

    const settled = settle(generateWithFallback({ contents: [] } as never));
    await vi.advanceTimersByTimeAsync(10_000); // 8s 退避 + 緩衝
    const result = await settled;

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.text).toBe('fallback OK after primary 429');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry when external signal aborts during retry wait', async () => {
    const externalController = new AbortController();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'p1' }) });
    vi.stubGlobal('fetch', fetchMock);

    const settled = settle(generateWithFallback({ contents: [] } as never, externalController.signal));
    // 第一次 fetch 已完成（503），進入 1.5s 退避；在退避中 abort
    await vi.advanceTimersByTimeAsync(100);
    externalController.abort();
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await settled;

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.name).toBe('AbortError');
    // 只有第一次呼叫，retry 在 wait 階段就被取消，不該再打 fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
