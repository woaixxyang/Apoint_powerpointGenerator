/**
 * Google OAuth Authentication Service
 * 使用 Google Identity Services (GIS) 純前端 OAuth 登入。
 *
 * 是否限制企業域名由當前 edition 決定：
 *   h2u edition    → PROFILE.auth.enterpriseWhitelist = ['h2u.io']，僅企業郵箱
 *   public edition → PROFILE.auth.enterpriseWhitelist = undefined，全部 Google 帳號開放
 */

import { PROFILE } from '../core/edition';

export interface SAUser {
  id: string;        // Google sub
  email: string;
  name: string;
  picture: string;   // avatar URL
  loginAt: number;
}

const STORAGE_KEY = 'sa_user';
const CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '';

/** 追蹤 initialize() 是否已完成 */
let _initialized = false;

/**
 * 檢查是否為「允許登入使用」的用戶。
 * - 若 edition 設定了 enterpriseWhitelist：email 域名必須在白名單內
 * - 若 enterpriseWhitelist 為 undefined：開放任何 Google 帳號（public edition）
 *
 * 函式名沿用 isEnterpriseUser 不改名，避免 caller (App.tsx、useAuthSession.ts) 連動修改。
 * 在 public edition 下此函式永遠回 true（給定非空 email），UnauthorizedModal 自然不會觸發。
 */
export function isEnterpriseUser(email: string): boolean {
  if (!email) return false;
  const whitelist = PROFILE.auth.enterpriseWhitelist;
  if (!whitelist) return true;
  const domain = email.toLowerCase().split('@')[1];
  return whitelist.some(d => domain === d);
}

/** 從 localStorage 讀取已登入用戶 */
export function getStoredUser(): SAUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SAUser;
  } catch {
    return null;
  }
}

/** 儲存用戶到 localStorage */
function storeUser(user: SAUser): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

/** 清除登入狀態 */
export function logout(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 解碼 Google JWT credential（不驗證簽名，僅解碼 payload）。
 * 前端場景下這是標準做法 — 簽名驗證由 Google GIS SDK 處理。
 */
function decodeJwtPayload(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

const MAX_AUTH_RETRIES = 20; // 20 × 300ms = 6 秒上限

/**
 * 初始化 Google Identity Services 並設定登入回調。
 * @param onSuccess 登入成功回調
 * @param onError 登入失敗回調
 */
export function initGoogleAuth(
  onSuccess: (user: SAUser) => void,
  onError?: (error: string) => void
): void {
  if (!CLIENT_ID) {
    console.warn('[Auth] VITE_GOOGLE_CLIENT_ID 未設定，Google 登入功能停用');
    return;
  }
  _initWithRetry(onSuccess, onError, 0);
}

function _initWithRetry(
  onSuccess: (user: SAUser) => void,
  onError: ((error: string) => void) | undefined,
  attempt: number
): void {
  const google = (window as any).google;
  if (!google?.accounts?.id) {
    if (attempt >= MAX_AUTH_RETRIES) {
      console.error('[Auth] Google GIS SDK 載入逾時，請檢查網路或廣告封鎖器');
      onError?.('Google 登入 SDK 載入失敗，請重新整理頁面');
      return;
    }
    console.warn(`[Auth] Google Identity Services SDK 尚未載入，延遲重試 (${attempt + 1}/${MAX_AUTH_RETRIES})...`);
    setTimeout(() => _initWithRetry(onSuccess, onError, attempt + 1), 300);
    return;
  }

  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: (response: any) => {
      if (!response.credential) {
        onError?.('登入失敗：未收到 credential');
        return;
      }

      const payload = decodeJwtPayload(response.credential);
      if (!payload) {
        onError?.('登入失敗：JWT 解碼錯誤');
        return;
      }

      const user: SAUser = {
        id: payload.sub,
        email: payload.email,
        name: payload.name || payload.email,
        picture: payload.picture || '',
        loginAt: Date.now(),
      };

      storeUser(user);
      onSuccess(user);
      console.log('[Auth] 登入成功:', user.email);
    },
    auto_select: false,
  });

  _initialized = true;
  console.log('[Auth] Google Identity Services 初始化完成');
}

/**
 * 在指定 DOM 元素中渲染 Google Sign-In 按鈕。
 * 使用 GIS renderButton() — 直接顯示標準 Google 登入按鈕，
 * 點擊後彈出帳號選擇器，不依賴第三方 cookie，Safari/Chrome 全相容。
 */
export function renderGoogleButton(container: HTMLElement, attempt = 0): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { if (timer !== undefined) clearTimeout(timer); };

  const google = (window as any).google;
  if (!google?.accounts?.id || !_initialized) {
    if (attempt >= MAX_AUTH_RETRIES) {
      console.error('[Auth] renderGoogleButton 逾時：GIS SDK 未就緒');
      return cancel;
    }
    // 回傳 cancel 讓 caller（如 LoginButton unmount）能中止重試鏈，避免對已卸載節點操作
    let inner: () => void = () => {};
    timer = setTimeout(() => { inner = renderGoogleButton(container, attempt + 1); }, 300);
    return () => { cancel(); inner(); };
  }

  google.accounts.id.renderButton(container, {
    type: 'standard',
    size: 'large',
    theme: 'outline',
    text: 'signin_with',
    shape: 'pill',
    logo_alignment: 'left',
    width: 320,
  });
  return cancel;
}

// ─── OAuth2 Token Client (for API access) ────────────────────
const DRIVE_SLIDES_SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/presentations.readonly';
const TOKEN_STORAGE_KEY   = 'gapi_access_token';
const TOKEN_EXPIRY_KEY    = 'gapi_access_token_expiry';
const CONSENT_EXPIRY_KEY  = 'gapi_consent_expiry';
const CONSENT_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

let _accessToken: string | null = null;
let _tokenExpiry: number = 0;
let _pendingTokenPromise: Promise<string> | null = null;

// 頁面載入時從 localStorage 恢復 token（跨 session 持久，token 本身 1 小時內有效）
try {
  const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
  const expiry  = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (stored && expiry) {
    const expiryMs = parseInt(expiry, 10);
    if (Date.now() < expiryMs - 60_000) {
      _accessToken = stored;
      _tokenExpiry = expiryMs;
    }
  }
} catch { /* localStorage 不可用時忽略 */ }

/**
 * Request an OAuth2 access token for Google Drive & Slides API.
 * Uses incremental authorization — prompts user for consent on first use.
 * Returns the access token string.
 */
export function requestAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (_accessToken && Date.now() < _tokenExpiry - 60000) {
    return Promise.resolve(_accessToken);
  }

  // 若已有進行中的 OAuth 流程，共享同一個 promise，避免並發時覆寫 resolve/reject
  if (_pendingTokenPromise) return _pendingTokenPromise;

  const google = (window as any).google;
  if (!google?.accounts?.oauth2) {
    return Promise.reject(new Error('Google OAuth2 SDK 尚未載入'));
  }
  if (!CLIENT_ID) {
    return Promise.reject(new Error('VITE_GOOGLE_CLIENT_ID 未設定'));
  }

  _pendingTokenPromise = new Promise<string>((resolve, reject) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SLIDES_SCOPES,
      callback: (response: any) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        const token = response.access_token;
        if (typeof token !== 'string' || !token) {
          reject(new Error('授權失敗：未取得 access_token'));
          return;
        }
        _accessToken = token;
        _tokenExpiry = Date.now() + (response.expires_in || 3600) * 1000;
        try {
          localStorage.setItem(TOKEN_STORAGE_KEY, token);
          localStorage.setItem(TOKEN_EXPIRY_KEY, String(_tokenExpiry));
          localStorage.setItem(CONSENT_EXPIRY_KEY, String(Date.now() + CONSENT_DURATION_MS));
        } catch { /* ignore */ }
        resolve(token);
      },
      error_callback: (error: any) => {
        reject(new Error(error?.message || '授權失敗'));
      },
    });

    const consentExpiry = localStorage.getItem(CONSENT_EXPIRY_KEY);
    const hasConsent = !!consentExpiry && Date.now() < parseInt(consentExpiry, 10);
    try {
      tokenClient.requestAccessToken({ prompt: hasConsent ? '' : 'consent' });
    } catch {
      reject(new Error('popup_blocked'));
    }
  }).finally(() => {
    _pendingTokenPromise = null;
  });

  return _pendingTokenPromise;
}

/**
 * 手動觸發授權（用於 popup 被擋後，由用戶點擊按鈕觸發）
 * 用戶手動點擊觸發的 popup 不會被瀏覽器擋住
 */
export function requestAccessTokenManual(): Promise<string> {
  // 清除所有快取，強制顯示完整授權畫面
  _accessToken = null;
  _tokenExpiry = 0;
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    localStorage.removeItem(CONSENT_EXPIRY_KEY);
  } catch { /* ignore */ }
  return requestAccessToken();
}
