import { useEffect, useRef } from 'react';
import { DraftImage } from '../types';

/**
 * 全域粘貼截圖支援：Ctrl/Cmd+V 在頁面任何位置（textarea / input 除外）
 * 粘貼圖片時，把圖片轉成 DraftImage 後透過 onPaste 回呼上傳。
 *
 * 行為與舊版 App.tsx 內 useEffect(handlePaste, []) 一致：
 * - 焦點在 textarea / input 中時不攔截（讓 OS 文字粘貼正常運作）
 * - 多張圖片同時粘貼會收成一個批次
 * - 檔名缺失時以 paste-${timestamp}-${idx}.png 命名（避免 'image.png' 大量重複）
 *
 * onPaste 用 ref 寫入，effect 只跑一次：caller 不必包 useCallback。
 */
export function useClipboardPasteImages(
  onPaste: (images: DraftImage[]) => void,
): void {
  const onPasteRef = useRef(onPaste);
  onPasteRef.current = onPaste;

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length === 0) return;

      e.preventDefault();

      const readers = imageFiles.map((file, idx) =>
        new Promise<DraftImage>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const name = file.name && file.name !== 'image.png'
              ? file.name
              : `paste-${Date.now()}-${idx + 1}.png`;
            resolve({ name, data: reader.result as string });
          };
          reader.readAsDataURL(file);
        }),
      );

      Promise.all(readers).then(imgs => onPasteRef.current(imgs));
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);
}
