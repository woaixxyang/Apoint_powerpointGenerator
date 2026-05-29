
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// 註冊 Service Worker：PDF 匯出字型（~13MB TTF）跨 session 持久快取，
// 使用者只會在首次造訪下載一次，後續永久 cache hit。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) =>
      console.warn('[SW] 註冊失敗（不影響功能）:', err),
    );
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
