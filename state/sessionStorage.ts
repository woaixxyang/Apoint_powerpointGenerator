import { AppState } from '../types';

/**
 * Apoint AppState 的 localStorage 持久層。
 * - 讀：localStorage → AppState 初始值（含 schema 升級與 fallback）
 * - 寫：AppState → localStorage（剔除 draftImages，避免大量 base64 撞 5MB quota）
 *
 * 變數名是 SESSION_STORAGE_KEY 但實際走 localStorage（跨 session 持久），
 * 早期命名沒改回來，保留以維持與既有資料相容。
 */
export const SESSION_STORAGE_KEY = 'apoint_session';

/** 從 localStorage 載入舊 session，找不到 / 無效 / 結構過舊則回 defaults。 */
export const loadInitialAppState = (): AppState => {
  try {
    const saved = localStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // 偵測舊版單一 slides[] 結構 → 直接清掉 localStorage（不做 migration）
      // 使用者下次重新整理會是 fresh state，比保留可能不一致的 zombie 資料安全。
      if ('slides' in parsed && !('imageSlides' in parsed)) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      } else {
        return {
          ...parsed,
          draftImages: [],    // base64 圖片不持久化，重開後需重新上傳
          imageSlides: Array.isArray(parsed.imageSlides) ? parsed.imageSlides : [],
          storylineSlides: Array.isArray(parsed.storylineSlides) ? parsed.storylineSlides : [],
          isGenerating: false,
        };
      }
    }
  } catch { /* ignore */ }
  return {
    draftImages: [],
    content: '',
    isGenerating: false,
    imageSlides: [],
    storylineSlides: [],
    inputMode: 'storyline',
    aiExpand: true,
  };
};

/** 寫入 AppState 到 localStorage；剔除 draftImages（base64 太大）與 isGenerating（不該跨 session 殘留 true）。 */
export const persistAppState = (state: AppState): void => {
  try {
    const { draftImages: _omit, ...toSave } = state;
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...toSave, isGenerating: false }));
  } catch (err) {
    console.warn('[App] localStorage save failed:', err);
  }
};

/** 清掉整個 session（用於 clearAll / clearStoryline 後）。 */
export const clearPersistedAppState = (): void => {
  try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* ignore */ }
};
