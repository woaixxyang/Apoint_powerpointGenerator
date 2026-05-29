import { DraftImage } from '../types';
import { requestAccessToken } from './authService';

/**
 * Convert a PPTX file to slide images using Google Drive + Slides API.
 * Flow: Upload to Drive → Get slide thumbnails → Download images → Delete temp file
 *
 * @param onProgress 進度回呼，UI 顯示「上傳中 / 取得清單 / 下載縮圖 N/M」用。
 */
export async function pptxToImages(
  file: File,
  onProgress?: (stage: string) => void,
): Promise<DraftImage[]> {
  onProgress?.('授權 Google Drive...');
  const accessToken = await requestAccessToken();

  // 1. Upload PPTX to Google Drive (auto-converts to Google Slides format)
  console.log('[PPTX] 上傳到 Google Drive...');
  onProgress?.('上傳 PPTX 到 Google Drive...');
  const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';

  const metadata = {
    name: `_temp_${Date.now()}_${file.name}`,
    mimeType: 'application/vnd.google-apps.presentation', // Convert to Google Slides
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    body: form,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`Drive 上傳失敗 (${uploadResponse.status}): ${errorText}`);
  }

  const uploadResult = await uploadResponse.json();
  const fileId = uploadResult.id;
  console.log(`[PPTX] 已上傳，fileId: ${fileId}`);

  try {
    // 2. Get presentation metadata to find all slide IDs
    console.log('[PPTX] 取得投影片資訊...');
    onProgress?.('取得投影片清單...');
    const presResponse = await fetch(
      `https://slides.googleapis.com/v1/presentations/${fileId}?fields=slides.objectId`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (!presResponse.ok) {
      const errorText = await presResponse.text();
      throw new Error(`Slides API 失敗 (${presResponse.status}): ${errorText}`);
    }

    const presData = await presResponse.json();
    const slideIds: string[] = (presData.slides || []).map((s: any) => s.objectId);

    if (slideIds.length === 0) {
      throw new Error('PPTX 中沒有投影片');
    }

    console.log(`[PPTX] 找到 ${slideIds.length} 頁投影片，取得縮圖...`);

    // 3. Get thumbnails — 分批 + per-thumbnail 429 retry：
    //    - 分批（concurrency 4）：避免一次打爆 Google 圖片 CDN 觸發整批 429
    //    - 個別 429 retry：CDN 偶發 throttle 時 wait 後重試，提升成功率
    //    lh*.googleusercontent.com 限速很嚴，並發 > ~6 就容易整批 429。
    const THUMBNAIL_CONCURRENCY = 4;
    const RATE_LIMIT_RETRY_WAITS = [1500, 3000]; // 兩次 retry，第一次等 1.5s，第二次等 3s

    /** 帶 429 retry 的 fetch — 對 lh*.googleusercontent.com 限速很有幫助 */
    const fetchWithRetry = async (url: string, init?: RequestInit, label = 'fetch'): Promise<Response> => {
      let lastResponse: Response | null = null;
      for (let attempt = 0; attempt <= RATE_LIMIT_RETRY_WAITS.length; attempt++) {
        const res = await fetch(url, init);
        if (res.status !== 429) return res;
        lastResponse = res;
        if (attempt < RATE_LIMIT_RETRY_WAITS.length) {
          const wait = RATE_LIMIT_RETRY_WAITS[attempt];
          console.warn(`[PPTX] ${label} 429 throttled，等 ${wait}ms 後重試 (${attempt + 1}/${RATE_LIMIT_RETRY_WAITS.length})`);
          await new Promise(r => setTimeout(r, wait));
        }
      }
      return lastResponse!;
    };

    const fetchOneThumbnail = async (slideId: string, index: number): Promise<DraftImage | null> => {
      const thumbResponse = await fetchWithRetry(
        `https://slides.googleapis.com/v1/presentations/${fileId}/pages/${slideId}/thumbnail?thumbnailProperties.mimeType=PNG&thumbnailProperties.thumbnailSize=LARGE`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } },
        `Slides API 第 ${index + 1} 頁`,
      );

      if (!thumbResponse.ok) {
        console.warn(`[PPTX] 第 ${index + 1} 頁縮圖取得失敗:`, thumbResponse.status);
        return null;
      }

      const thumbData = await thumbResponse.json();
      const contentUrl = thumbData.contentUrl;

      if (!contentUrl) {
        console.warn(`[PPTX] 第 ${index + 1} 頁無 contentUrl`);
        return null;
      }

      // Download the thumbnail image and convert to data URL
      const imageResponse = await fetchWithRetry(contentUrl, undefined, `CDN 第 ${index + 1} 頁`);
      if (!imageResponse.ok) {
        console.warn(`[PPTX] 第 ${index + 1} 頁 contentUrl 下載失敗:`, imageResponse.status, contentUrl);
        return null;
      }

      const blob = await imageResponse.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result) resolve(reader.result as string);
          else reject(new Error('FileReader 回傳 null'));
        };
        reader.onerror = () => reject(reader.error ?? new Error('FileReader 讀取失敗'));
        reader.readAsDataURL(blob);
      });

      const baseName = file.name.replace(/\.pptx?$/i, '');
      return {
        name: `${baseName}_P${index + 1}.png`,
        data: dataUrl,
      } as DraftImage;
    };

    const results: (DraftImage | null)[] = new Array(slideIds.length);
    let completed = 0;
    for (let i = 0; i < slideIds.length; i += THUMBNAIL_CONCURRENCY) {
      const batch = slideIds.slice(i, i + THUMBNAIL_CONCURRENCY);
      onProgress?.(`下載縮圖 ${completed}/${slideIds.length}...`);
      const batchResults = await Promise.all(
        batch.map((slideId, k) => fetchOneThumbnail(slideId, i + k))
      );
      batchResults.forEach((r, k) => { results[i + k] = r; });
      completed += batch.length;
    }
    onProgress?.(`下載縮圖 ${completed}/${slideIds.length}...`);
    const validResults = results.filter((r): r is DraftImage => r !== null);

    if (validResults.length === 0) {
      throw new Error('無法取得任何投影片縮圖');
    }

    console.log(`[PPTX] 成功取得 ${validResults.length} 張縮圖`);
    return validResults;

  } finally {
    // 4. Delete temp file from Drive (fire and forget)
    console.log('[PPTX] 刪除 Drive 暫存檔...');
    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }).catch(err => console.warn('[PPTX] 暫存檔刪除失敗（不影響功能）:', err));
  }
}
