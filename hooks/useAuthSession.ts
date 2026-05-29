import { useState, useEffect } from 'react';
import { SAUser, getStoredUser, initGoogleAuth, logout as authLogout, isEnterpriseUser } from '../services/authService';
import { PROFILE } from '../core/edition';

// dev 自動登入 email：有企業白名單的 edition 用其首個域名（通過白名單檢查），
// 否則（開放登入）用中性 example.com。
const DEV_EMAIL = `dev@${PROFILE.auth.enterpriseWhitelist?.[0] ?? 'example.com'}`;

/**
 * Google OAuth + 企業域名白名單（PROFILE.auth.enterpriseWhitelist）的 session 管理。
 *
 * dev 模式自動以 DEV_EMAIL 登入跳過 Google 按鈕；prod 模式從 localStorage
 * 載入既有 user 後在 mount 時初始化 GIS。
 *
 * GIS 初始化錯誤透過 onError 回呼丟給 caller，由 caller 統一管理 UI 顯示
 * （通常是 App 的 setError），避免 hook 內部再養一份 errorState 與外部撞名。
 *
 * 回傳：
 * - user: 當前登入者（null = 未登入）
 * - showUnauthorized: 非企業域名時 → 顯示 UnauthorizedModal
 * - logout()
 * - retryLogin(): 登出後讓使用者重點 Google 登入按鈕
 * - markUnauthorized(): 當外部判定使用者該被擋下時手動觸發 Modal（例如
 *   點生成按鈕時補做一次企業域名檢查）
 */
export function useAuthSession(onError?: (err: string) => void): {
  user: SAUser | null;
  showUnauthorized: boolean;
  logout: () => void;
  retryLogin: () => void;
  markUnauthorized: () => void;
} {
  const [user, setUser] = useState<SAUser | null>(() => {
    if (import.meta.env.DEV) {
      return { id: 'dev', email: DEV_EMAIL, name: 'Dev (local)', picture: '', loginAt: Date.now() };
    }
    return getStoredUser();
  });
  const [showUnauthorized, setShowUnauthorized] = useState(false);

  useEffect(() => {
    const handleAuthSuccess = (u: SAUser) => {
      setUser(u);
      setShowUnauthorized(!isEnterpriseUser(u.email));
    };
    initGoogleAuth(handleAuthSuccess, (err) => onError?.(err));
    // onError 故意不放 deps：mount 時抓一次 callback 即可，避免 caller 沒包
    // useCallback 時每次 render 都重新初始化 GIS。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = () => {
    authLogout();
    setUser(null);
    setShowUnauthorized(false);
  };
  // retryLogin 與 logout 語意上一致：清掉 user 讓登入畫面重新出現
  const retryLogin = logout;
  const markUnauthorized = () => setShowUnauthorized(true);

  return { user, showUnauthorized, logout, retryLogin, markUnauthorized };
}
