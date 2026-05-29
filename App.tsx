
import React, { useState, useEffect, useRef } from 'react';
import { triggerBlobDownload } from './utils/download';
import { fileListToArray } from './utils/files';
import { generateSingleSlide, generateFromStoryline, patchSlide, optimizeOutline, translateOutline } from './services/geminiService';
import { exportToNativePPTX } from './services/nativePptxService';
import { pptxToImages } from './services/pptxReaderService';
import { AppState, DraftImage, SlideData, InputMode, BoundImage, SlideImageOverlay, BrandStyle } from './types';
import { parseStoryline } from './services/storylineParser';
import { isEnterpriseUser } from './services/authService';
import { loadInitialAppState, persistAppState, clearPersistedAppState } from './state/sessionStorage';
import { usePerModeMap } from './hooks/usePerModeMap';
import { useAuthSession } from './hooks/useAuthSession';
import { useClipboardPasteImages } from './hooks/useClipboardPasteImages';
import { PROFILE } from './core/edition';
import { Sidebar } from './components/Sidebar';
import { SlideCard } from './components/SlideCard';
import { RedesignModal } from './components/RedesignModal';
import { Header } from './components/Header';
import { EmptyState } from './components/EmptyState';
import { UnauthorizedModal } from './components/UnauthorizedModal';
import { OnboardingTour, hasSeenOnboarding } from './components/OnboardingTour';
import { ImagePickerModal } from './components/ImagePickerModal';
import { CTAModal } from './components/CTAModal';
import { DEFAULT_BRAND_STYLE } from './components/BrandStylePanel';

const escapeXml = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(loadInitialAppState);
  // 永遠指向最新 committed state。非同步 handler（await 後）要判斷 recovery
  // 等狀態時讀這個，避免讀到 render 當下被閉包凍結的舊 state。
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });

  const [processingIndices, setProcessingIndices] = useState<Set<number>>(new Set());
  // CONCURRENCY=3：preview 模型容量有限，過高並發容易自己對自己 DDoS 觸發 503。
  // 5 並發實測會撞到「This model is currently experiencing high demand」。
  const CONCURRENCY = 3;
  const generationAbortRef = useRef<AbortController | null>(null);
  // 大綱優化/翻譯共用一個 abort controller — 兩個操作一次只會跑一個（互斥），
  // 下一次操作開始前 abort 上一次（避免使用者連按時舊請求還在跑）
  const outlineOpAbortRef = useRef<AbortController | null>(null);
  // 局部修改（patch）的 abort controller — 一次只會 patch 一張
  const patchAbortRef = useRef<AbortController | null>(null);
  // 快速重繪 / 重試此頁：每張 slide 各自一個 controller，不同張可同時跑、
  // 同一張連點則後者 abort 前者（A 方案）。
  const redesignAbortRefs = useRef<Map<number, AbortController>>(new Map());
  // 正在被「重繪」（含快速重繪、指令修改、Beta 插入圖片、重試失敗頁）的 slide indices。
  // 用 Set 而非 number | null 才能同時顯示多張的 loading overlay。
  const [redesigningIndices, setRedesigningIndices] = useState<Set<number>>(new Set());

  /** 將 index 加入「重繪中」Set。 */
  const markRedesigning = (index: number) => {
    setRedesigningIndices(prev => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  };

  /** 從「重繪中」Set 移除 index。 */
  const unmarkRedesigning = (index: number) => {
    setRedesigningIndices(prev => {
      if (!prev.has(index)) return prev;
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };
  const [error, setError] = useState<string | null>(null);
  const [pendingPptxFile, setPendingPptxFile] = useState<File | null>(null);
  // PPTX 解析進度提示（null = 沒在解析）；用於 Sidebar 顯示「上傳中 / 下載縮圖 N/M」
  const [pptxLoadingStage, setPptxLoadingStage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTargetIndex, setModalTargetIndex] = useState<number | null>(null);

  // Auth — useAuthSession 內含 dev bypass、GIS 初始化、企業域名檢查；
  // GIS 初始化錯誤透過 onError 合併到 App 本地 error state（setError 從 useState 來，是穩定 reference）
  const { user, showUnauthorized, logout: handleLogout, retryLogin: handleRetryLogin, markUnauthorized } = useAuthSession(setError);
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding());

  // 品牌風格（public edition only）
  const [brandStyle, setBrandStyle] = useState<BrandStyle>(() => {
    if (!PROFILE.features.brandStylePanel) return DEFAULT_BRAND_STYLE;
    try {
      const saved = localStorage.getItem('apoint_brand_style');
      if (saved) return JSON.parse(saved) as BrandStyle;
    } catch { /* ignore */ }
    return DEFAULT_BRAND_STYLE;
  });
  // CTA（免費額度用完提示，public edition only）
  const [showCTA, setShowCTA] = useState(false);

  // Slide history — 每張 slide 的歷史版本（多步 undo），per-mode 隔離。
  const { current: slideHistory, set: setSlideHistory } = usePerModeMap<number, SlideData[]>(state.inputMode);

  // ── Per-mode slides 隔離輔助 ───────────────────────────────────
  // 依當前模式取得對應的 slides 陣列（read），跨模式不會看到對方的 slides。
  const currentSlides = state.inputMode === 'image' ? state.imageSlides : state.storylineSlides;

  // 寫入當前模式的 slides — updater 接舊陣列回新陣列，或直接給新陣列。
  // 用於模式無關的操作（編輯、刪除、redesign 單張等）；模式特定的寫入請直接 setState。
  const updateCurrentSlides = (
    updater: SlideData[] | ((slides: SlideData[]) => SlideData[]),
  ) => {
    setState(prev => {
      const field = prev.inputMode === 'image' ? 'imageSlides' : 'storylineSlides';
      const next = typeof updater === 'function' ? updater(prev[field]) : updater;
      return { ...prev, [field]: next };
    });
  };

  // Outline history — 大綱優化歷史（支援撤銷）
  const [outlineHistory, setOutlineHistory] = useState<string[]>([]);
  const [isOptimizingOutline, setIsOptimizingOutline] = useState(false);
  const [isTranslatingOutline, setIsTranslatingOutline] = useState(false);

  // Track whether the outline has been manually edited after an optimization/translation
  const [outlineEditedAfterOptimize, setOutlineEditedAfterOptimize] = useState(false);

  // 所有 Beta 功能已合併為正式版
  const isBeta = true;

  // ── Beta 專用 state ────────────────────────────────
  // 方案 1: 段落綁定圖片 (segmentIndex → BoundImage)。Per-mode 隔離。
  const { current: segmentImageBindings, set: setSegmentImageBindings } = usePerModeMap<number, BoundImage>(state.inputMode);
  // 方案 2: 投影片圖片覆蓋層 (slideIndex → SlideImageOverlay)。Per-mode 隔離。
  const { current: slideImageOverlays, set: setSlideImageOverlays } = usePerModeMap<number, SlideImageOverlay>(state.inputMode);
  // 哪張投影片正在開啟圖片選擇器
  const [insertingImageIndex, setInsertingImageIndex] = useState<number | null>(null);
  // Beta: 獨立的插入圖片庫（與簡報初稿分開）
  const [betaInsertImages, setBetaInsertImages] = useState<DraftImage[]>([]);

  /** 將當前 slide 推入歷史，供 undo 時回溯 */
  const pushHistory = (index: number, currentSlide: SlideData) => {
    setSlideHistory(prev => {
      const next = new Map<number, SlideData[]>(prev);
      const stack = next.get(index) || [];
      next.set(index, [...stack, currentSlide]);
      return next;
    });
  };

  /** Undo：從歷史中取回上一版 */
  const handleUndo = (index: number) => {
    // 直接讀當前模式的 history（不靠 setState updater 的側效應取值，避免 StrictMode
    // 雙呼叫與非同步 commit 造成的不可靠讀取）
    const stack = slideHistory.get(index);
    if (!stack || stack.length === 0) return;
    const previousSlide = stack[stack.length - 1];

    setSlideHistory(prev => {
      const next = new Map<number, SlideData[]>(prev);
      next.set(index, (prev.get(index) ?? []).slice(0, -1));
      return next;
    });
    updateCurrentSlides(slides => {
      const newSlides = [...slides];
      newSlides[index] = previousSlide;
      return newSlides;
    });
    setSlideImageOverlays(p => {
      const nm = new Map(p);
      nm.delete(index);
      return nm;
    });
  };

  /** 文字編輯：更新 SVG 並記錄歷史 */
  const handleEditSlideText = (slideIndex: number, newSvg: string) => {
    const currentSlide = currentSlides[slideIndex];
    if (currentSlide) pushHistory(slideIndex, currentSlide);
    updateCurrentSlides(slides => {
      const updated = [...slides];
      updated[slideIndex] = { ...updated[slideIndex], svg: newSvg };
      return updated;
    });
  };

  // 持久化到 localStorage（跨 session）；draftImages / isGenerating 由 persistAppState 內部過濾
  useEffect(() => { persistAppState(state); }, [state]);

  // 頁面關閉 / 重整 / HMR 卸載時，abort 所有進行中的請求：
  //   - 批次 generation：abort 後 for 迴圈在下一批之前 break，省下未送出批次的 token
  //   - 快速重繪 / 重試此頁 / 局部修改 / 大綱優化：純粹釋放資源
  // 注意：Gemini 已收到的請求一定會被計費（SDK 文件明示），這裡只能省「還沒送出」的部分。
  useEffect(() => {
    const abortAll = () => {
      generationAbortRef.current?.abort();
      patchAbortRef.current?.abort();
      outlineOpAbortRef.current?.abort();
      redesignAbortRefs.current.forEach(c => c.abort());
      redesignAbortRefs.current.clear();
    };
    window.addEventListener('beforeunload', abortAll);
    return () => {
      window.removeEventListener('beforeunload', abortAll);
      abortAll(); // 含 HMR 卸載（dev）與正常 unmount
    };
  }, []);

  // 全域粘貼截圖支援：Ctrl+V / Cmd+V 粘貼圖片自動加入 draftImages（已抽到 hook）
  useClipboardPasteImages((newDrafts) => {
    setState(prev => {
      const combined = [...prev.draftImages, ...newDrafts];
      const sorted = combined.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      );
      return { ...prev, draftImages: sorted };
    });
  });

  const handleImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = fileListToArray(e.target.files);
    if (files.length === 0) return;

    const readers = files.map((file) => {
      return new Promise<DraftImage>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({ name: file.name, data: reader.result as string });
        };
        reader.readAsDataURL(file);
      });
    });

    const newDrafts = await Promise.all(readers);
    // 從 recovery 狀態（image 模式 + 0 draftImages + 有 imageSlides）上傳 = 視為新工作，
    // 清舊 imageSlides 與 history，避免新圖片索引對應到舊投影片造成混亂。
    // 用 stateRef.current（await 後最新值），不用被閉包凍結的 state。
    const cur = stateRef.current;
    const wasInRecovery = cur.inputMode === 'image'
      && cur.draftImages.length === 0
      && cur.imageSlides.length > 0;
    setState(prev => {
      const combined = [...prev.draftImages, ...newDrafts];
      const sorted = combined.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      );
      return {
        ...prev,
        draftImages: sorted,
        imageSlides: wasInRecovery ? [] : prev.imageSlides,
      };
    });
    if (wasInRecovery) setSlideHistory(new Map());
  };

  const handlePptxUpload = async (file: File) => {
    setError(null);
    setPendingPptxFile(null);
    setPptxLoadingStage('準備上傳...');
    setState(prev => ({ ...prev, isGenerating: false }));
    try {
      const draftImages = await pptxToImages(file, (stage) => setPptxLoadingStage(stage));
      // 同 handleImagesUpload：從 recovery 上傳 = 清舊 imageSlides。
      // 用 stateRef.current（await 後最新值），不用被閉包凍結的 state。
      const cur = stateRef.current;
      const wasInRecovery = cur.inputMode === 'image'
        && cur.draftImages.length === 0
        && cur.imageSlides.length > 0;
      setState(prev => {
        const combined = [...prev.draftImages, ...draftImages];
        return {
          ...prev,
          draftImages: combined,
          imageSlides: wasInRecovery ? [] : prev.imageSlides,
        };
      });
      if (wasInRecovery) setSlideHistory(new Map());
    } catch (err) {
      console.error('PPTX 解析失敗:', err);
      const errorMessage = err instanceof Error ? err.message : '未知錯誤';
      if (errorMessage.includes('popup_blocked') || errorMessage.includes('popup')) {
        // Popup 被瀏覽器擋住 — 儲存檔案，顯示手動授權按鈕
        setPendingPptxFile(file);
        setError('瀏覽器阻擋了授權彈窗，請點擊下方按鈕手動授權');
      } else {
        setError(`PPTX 解析失敗: ${errorMessage}`);
      }
    } finally {
      setPptxLoadingStage(null);
    }
  };

  const handlePdfUpload = async (file: File) => {
    setError(null);
    setPptxLoadingStage('解析 PDF...');
    setState(prev => ({ ...prev, isGenerating: false }));
    try {
      // dynamic import：pdfjs-dist 不進主 bundle，僅上傳 PDF 時載入
      const { pdfToImages } = await import('./services/pdfReaderService');
      const draftImages = await pdfToImages(file);
      // 同 handlePptxUpload：從 recovery 上傳 = 清舊 imageSlides。
      const cur = stateRef.current;
      const wasInRecovery = cur.inputMode === 'image'
        && cur.draftImages.length === 0
        && cur.imageSlides.length > 0;
      setState(prev => {
        const combined = [...prev.draftImages, ...draftImages];
        return {
          ...prev,
          draftImages: combined,
          imageSlides: wasInRecovery ? [] : prev.imageSlides,
        };
      });
      if (wasInRecovery) setSlideHistory(new Map());
    } catch (err) {
      console.error('PDF 解析失敗:', err);
      setError(`PDF 解析失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
    } finally {
      setPptxLoadingStage(null);
    }
  };

  const handleManualAuth = async () => {
    if (!pendingPptxFile) return;
    setError(null);
    try {
      const { requestAccessTokenManual } = await import('./services/authService');
      await requestAccessTokenManual();
      // 授權成功，重新處理 PPTX
      await handlePptxUpload(pendingPptxFile);
    } catch (err) {
      console.error('手動授權失敗:', err);
      setError('授權失敗，請重試');
    }
  };

  const removeDraft = (index: number) => {
    // image 模式專用：刪 draft 同時刪對應 imageSlide
    setState(prev => ({
      ...prev,
      draftImages: prev.draftImages.filter((_, i) => i !== index),
      imageSlides: prev.imageSlides.filter((_, i) => i !== index),
    }));
  };

  const clearAll = () => {
    // 清除當前模式的工作區（image 模式同時清 draftImages）
    setState(prev => {
      if (prev.inputMode === 'image') {
        return { ...prev, draftImages: [], imageSlides: [] };
      }
      return { ...prev, storylineSlides: [] };
    });
    setSlideHistory(new Map());
    setSlideImageOverlays(new Map());
    clearPersistedAppState();
  };

  const clearStoryline = () => {
    setState(prev => ({
      ...prev,
      content: '',
      storylineSlides: [],
      storylineParsed: undefined,
    }));
    setSlideHistory(new Map());
    setOutlineHistory([]);
    setOutlineEditedAfterOptimize(false);
    // 清除 beta 狀態
    setSegmentImageBindings(new Map());
    setSlideImageOverlays(new Map());
    clearPersistedAppState();
  };

  const handleModeChange = (mode: InputMode) => {
    if (mode === state.inputMode) return;
    setState(prev => ({ ...prev, inputMode: mode }));
    // 不需要清 Map：slideHistory / slideImageOverlays / segmentImageBindings
    // 都是 per-mode 隔離，自動切到新模式的 bucket，舊模式的資料保留在自己 bucket
  };

  const handleStorylineChange = (text: string) => {
    const parsed = parseStoryline(text);
    setState(prev => ({ ...prev, content: text, storylineParsed: parsed }));
    // Mark outline as manually edited if an optimization has happened before
    if (outlineHistory.length > 0 && !outlineEditedAfterOptimize) {
      setOutlineEditedAfterOptimize(true);
    }
  };

  const handleAiExpandToggle = () => {
    setState(prev => ({ ...prev, aiExpand: !prev.aiExpand }));
  };

  const handleOptimizeOutline = async (mode: 'refine' | 'regenerate' = 'regenerate') => {
    if (!state.content.trim() || isOptimizingOutline) return;

    // Push current content to history for undo
    setOutlineHistory(prev => [...prev, state.content]);
    setIsOptimizingOutline(true);
    setError(null);

    // 取消任何前一次未完成的 outline 操作（保險，理論上 isOptimizingOutline 已擋）
    outlineOpAbortRef.current?.abort();
    const controller = new AbortController();
    outlineOpAbortRef.current = controller;

    try {
      const optimized = await optimizeOutline(state.content, mode, controller.signal);
      const parsed = parseStoryline(optimized);
      setState(prev => ({ ...prev, content: optimized, storylineParsed: parsed }));
      // Reset the manual-edit flag after optimization completes
      setOutlineEditedAfterOptimize(false);
    } catch (err) {
      // 使用者主動取消 → 不顯示錯誤、不 pop history（會由 handleUndoOutline 處理）
      if ((err as { name?: string })?.name === 'AbortError') return;
      console.error('大綱優化失敗:', err);
      const errorMessage = err instanceof Error ? err.message : '未知錯誤';
      setError(`大綱優化失敗: ${errorMessage}`);
      // Revert: pop the history entry we just pushed
      setOutlineHistory(prev => prev.slice(0, -1));
    } finally {
      setIsOptimizingOutline(false);
      if (outlineOpAbortRef.current === controller) outlineOpAbortRef.current = null;
    }
  };

  const handleUndoOutline = () => {
    if (outlineHistory.length === 0) return;
    const previous = outlineHistory[outlineHistory.length - 1];
    setOutlineHistory(prev => prev.slice(0, -1));
    const parsed = parseStoryline(previous);
    setState(prev => ({ ...prev, content: previous, storylineParsed: parsed }));
  };

  const handleTranslateOutline = async () => {
    if (!state.content.trim() || isTranslatingOutline) return;
    setOutlineHistory(prev => [...prev, state.content]);
    setIsTranslatingOutline(true);
    setError(null);

    outlineOpAbortRef.current?.abort();
    const controller = new AbortController();
    outlineOpAbortRef.current = controller;

    try {
      const translated = await translateOutline(state.content, controller.signal);
      const parsed = parseStoryline(translated);
      setState(prev => ({ ...prev, content: translated, storylineParsed: parsed }));
      // Reset the manual-edit flag after translation completes
      setOutlineEditedAfterOptimize(false);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      console.error('大綱翻譯失敗:', err);
      const errorMessage = err instanceof Error ? err.message : '未知錯誤';
      setError(`大綱翻譯失敗: ${errorMessage}`);
      setOutlineHistory(prev => prev.slice(0, -1));
    } finally {
      setIsTranslatingOutline(false);
      if (outlineOpAbortRef.current === controller) outlineOpAbortRef.current = null;
    }
  };

  const handleGenerate = async () => {
    if (!user || !isEnterpriseUser(user.email)) {
      markUnauthorized();
      return;
    }
    if (state.draftImages.length === 0) {
      setError("請至少上傳一張簡報初稿截圖");
      return;
    }
    setError(null);
    setSlideHistory(new Map());
    setState(prev => ({ ...prev, isGenerating: true, imageSlides: [] }));

    // Beta: 清除舊覆蓋層
    if (isBeta) { setSlideImageOverlays(new Map()); }

    // 生成前 snapshot，避免 await 途中使用者增減 draft 造成 index 錯位
    const draftImages = state.draftImages;

    const controller = new AbortController();
    generationAbortRef.current = controller;

    try {
      for (let batchStart = 0; batchStart < draftImages.length; batchStart += CONCURRENCY) {
        if (controller.signal.aborted) break;
        const batchIndices = Array.from(
          { length: Math.min(CONCURRENCY, draftImages.length - batchStart) },
          (_, k) => batchStart + k
        );
        setProcessingIndices(new Set(batchIndices));

        const results = await Promise.allSettled(
          batchIndices.map(i => generateSingleSlide(
            draftImages[i], '', i,
            undefined, false, controller.signal
          ))
        );

        if (controller.signal.aborted) break;

        const batchSlides: SlideData[] = results.map((r, k) => {
          if (r.status === 'fulfilled') return r.value;
          const i = batchStart + k;
          const msg = r.reason instanceof Error ? r.reason.message : '未知錯誤';
          console.error(`生成第 ${i + 1} 頁失敗:`, r.reason);
          return {
            title: `生成失敗 - 第 ${i + 1} 頁`,
            svg: `<svg viewBox="0 0 960 540"><rect width="960" height="540" fill="#FEE2E2"/><text x="480" y="240" text-anchor="middle" font-size="20" fill="#DC2626">此頁面生成失敗</text><text x="480" y="280" text-anchor="middle" font-size="14" fill="#666666">${escapeXml(msg)}</text></svg>`,
            elements: [],
            failed: true,
          } as SlideData;
        });
        setState(prev => ({ ...prev, imageSlides: [...prev.imageSlides, ...batchSlides] }));
      }
    } finally {
      setProcessingIndices(new Set());
      setState(prev => ({ ...prev, isGenerating: false }));
      generationAbortRef.current = null;
    }
  };

  const handleGenerateFromStoryline = async () => {
    if (!user || !isEnterpriseUser(user.email)) {
      markUnauthorized();
      return;
    }
    if (!state.storylineParsed || state.storylineParsed.totalPageCount === 0) {
      setError("請輸入簡報大綱內容");
      return;
    }
    setError(null);
    // 重新生成前，將現有 storylineSlides 存入歷史（支援逐頁 undo 回上一版）
    if (state.storylineSlides.length > 0) {
      setSlideHistory(prev => {
        const next = new Map<number, SlideData[]>(prev);
        state.storylineSlides.forEach((slide, idx) => {
          const stack = next.get(idx) || [];
          next.set(idx, [...stack, slide]);
        });
        return next;
      });
    } else {
      // 首次生成，清除可能殘留的歷史
      setSlideHistory(new Map());
    }
    setState(prev => ({ ...prev, isGenerating: true, storylineSlides: [] }));

    const segments = state.storylineParsed.segments;

    // Beta: 清除舊的圖片覆蓋層（重新生成時）
    if (isBeta) setSlideImageOverlays(new Map());

    const controller = new AbortController();
    generationAbortRef.current = controller;

    try {
      for (let batchStart = 0; batchStart < segments.length; batchStart += CONCURRENCY) {
        if (controller.signal.aborted) break;
        const batchIndices = Array.from(
          { length: Math.min(CONCURRENCY, segments.length - batchStart) },
          (_, k) => batchStart + k
        );
        setProcessingIndices(new Set(batchIndices));

        const results = await Promise.allSettled(
          batchIndices.map(i => {
            const boundImage = isBeta ? segmentImageBindings.get(i)?.draftImage : undefined;
            return generateFromStoryline(
              segments, i, state.aiExpand,
              undefined, boundImage, controller.signal
            ).then(result => ({ result, boundImage, index: i }));
          })
        );

        if (controller.signal.aborted) break;

        // 批次收集 overlay，一次 setState 寫入，避免每個 item 各自 setState 互蓋
        const newOverlays = new Map<number, { imageData: string; x: number; y: number; w: number; h: number }>();
        const batchSlides: SlideData[] = results.map((r, k) => {
          const i = batchStart + k;
          if (r.status === 'fulfilled') {
            const { result, boundImage, index } = r.value;
            if (isBeta && boundImage) {
              const imageElement = result.elements.find(e => e.type === 'image');
              if (imageElement) {
                newOverlays.set(index, { imageData: boundImage.data, x: imageElement.x, y: imageElement.y, w: imageElement.w, h: imageElement.h });
              }
            }
            return result;
          }
          const msg = r.reason instanceof Error ? r.reason.message : '未知錯誤';
          console.error(`Storyline 第 ${i + 1} 頁生成失敗:`, r.reason);
          return {
            title: `生成失敗 - P${segments[i].pageNumber}`,
            svg: `<svg viewBox="0 0 960 540"><rect width="960" height="540" fill="#FEE2E2"/><text x="480" y="240" text-anchor="middle" font-size="20" fill="#DC2626">此頁面生成失敗</text><text x="480" y="280" text-anchor="middle" font-size="14" fill="#666666">${escapeXml(msg)}</text></svg>`,
            elements: [],
            failed: true,
          } as SlideData;
        });
        if (newOverlays.size > 0) {
          setSlideImageOverlays(prev => {
            const next = new Map(prev);
            newOverlays.forEach((v, k) => next.set(k, v));
            return next;
          });
        }
        setState(prev => ({ ...prev, storylineSlides: [...prev.storylineSlides, ...batchSlides] }));
      }
    } finally {
      setProcessingIndices(new Set());
      setState(prev => ({ ...prev, isGenerating: false }));
      generationAbortRef.current = null;
    }
  };

  const handleCancelGeneration = () => {
    generationAbortRef.current?.abort();
  };

  const handleGenerateDispatch = () => {
    if (state.inputMode === 'storyline') {
      handleGenerateFromStoryline();
    } else {
      handleGenerate();
    }
  };

  const handleQuickRedesign = async (index: number) => {
    // 同一張連點 → abort 舊的 controller（後者取消前者）。
    // 不同張則完全獨立執行，互不干擾（A 方案）。
    redesignAbortRefs.current.get(index)?.abort();
    const controller = new AbortController();
    redesignAbortRefs.current.set(index, controller);
    markRedesigning(index);

    try {
      const slide = currentSlides[index];
      if (slide) pushHistory(index, slide);

      let result: SlideData;
      // 快速重繪：強制用 pro（品質模型），使用者點這個按鈕就是要更好版本
      if (state.inputMode === 'storyline' && state.storylineParsed) {
        result = await generateFromStoryline(
          state.storylineParsed.segments, index, state.aiExpand,
          undefined, undefined, controller.signal, true
        );
      } else {
        result = await generateSingleSlide(
          state.draftImages[index],
          `使用者對整頁設計不滿意，請根據相同內容重新設計完全不同的版面佈局。原始標題: ${slide.title}`,
          index, slide?.svg, false, controller.signal, true
        );
      }

      updateCurrentSlides(slides => {
        const newSlides = [...slides];
        newSlides[index] = result;
        return newSlides;
      });
    } catch (err) {
      // 使用者點下一次快速重繪/重試此頁時 abort 舊的 controller，落到這裡是正常流程，靜默退出。
      if ((err as { name?: string })?.name === 'AbortError') return;
      console.error(`快速重繪第 ${index + 1} 頁失敗:`, err);
      const errorMessage = err instanceof Error ? err.message : '未知錯誤';
      setError(`快速重繪失敗: ${errorMessage}`);
    } finally {
      // 只在自己仍是當前 controller 時清理 — 避免清掉 race 後新建立的 controller，
      // 同時也避免把新 instance 的 loading UI 提前抹掉（同張連點時尤其重要）。
      if (redesignAbortRefs.current.get(index) === controller) {
        redesignAbortRefs.current.delete(index);
        unmarkRedesigning(index);
      }
    }
  };

  /**
   * 重試失敗的頁面（slide.failed === true）。
   * 邏輯與快速重繪幾乎一致，但：
   *   1. 不傳 previousSvg —— 當前 svg 是紅底錯誤畫面，沒有「重新設計」的意義。
   *   2. 不 pushHistory —— 失敗版不值得保留供 undo。
   */
  const handleRetryFailedSlide = async (index: number) => {
    redesignAbortRefs.current.get(index)?.abort();
    const controller = new AbortController();
    redesignAbortRefs.current.set(index, controller);
    markRedesigning(index);

    try {
      let result: SlideData;
      // 重試此頁：強制用 pro（品質模型），使用者選擇手動重試，值得用更好的模型
      if (state.inputMode === 'storyline' && state.storylineParsed) {
        result = await generateFromStoryline(
          state.storylineParsed.segments, index, state.aiExpand,
          undefined, undefined, controller.signal, true
        );
      } else {
        result = await generateSingleSlide(
          state.draftImages[index], '', index,
          undefined, false, controller.signal, true
        );
      }

      updateCurrentSlides(slides => {
        const newSlides = [...slides];
        newSlides[index] = result;
        return newSlides;
      });
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      console.error(`重試第 ${index + 1} 頁失敗:`, err);
      const errorMessage = err instanceof Error ? err.message : '未知錯誤';
      setError(`重試失敗: ${errorMessage}`);
    } finally {
      if (redesignAbortRefs.current.get(index) === controller) {
        redesignAbortRefs.current.delete(index);
        unmarkRedesigning(index);
      }
    }
  };

  /** 品牌風格更新 — 同時更新 React state 和 localStorage（供下次 AI 生成讀取） */
  const handleBrandStyleChange = (style: BrandStyle) => {
    setBrandStyle(style);
    localStorage.setItem('apoint_brand_style', JSON.stringify(style));
  };

  /** 偏好回饋（public edition，designMemory 預留位） */
  const handleLike = (_index: number, _selectedRegions: string[]) => {
    // designMemory 功能預留：Phase 5 先存 UI，邏輯待 designMemory 實作
  };

  const handleDislike = (_index: number, _selectedRegions: string[]) => {
    // designMemory 功能預留：Phase 5 先存 UI，邏輯待 designMemory 實作
  };

  const openCustomRedesignModal = (index: number) => {
    setModalTargetIndex(index);
    setIsModalOpen(true);
  };

  const handleConfirmCustomRedesign = async (customPrompt: string) => {
    if (modalTargetIndex === null) return;
    const index = modalTargetIndex;
    setIsModalOpen(false);
    markRedesigning(index);

    patchAbortRef.current?.abort();
    const controller = new AbortController();
    patchAbortRef.current = controller;

    try {
      const slide = currentSlides[index];
      if (slide) pushHistory(index, slide);
      // 使用 patchSlide 局部修改（保留現有設計，僅修改用戶指定部分）
      const result = await patchSlide(
        slide.svg,
        slide.title,
        customPrompt,
        index,
        controller.signal,
      );
      // 保留原 slide 的 contentType
      if (slide?.contentType && !result.contentType) {
        result.contentType = slide.contentType;
      }
      updateCurrentSlides(slides => {
        const newSlides = [...slides];
        newSlides[index] = result;
        return newSlides;
      });
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      console.error(`指令修改第 ${index + 1} 頁失敗:`, err);
      const errorMessage = err instanceof Error ? err.message : '未知錯誤';
      setError(`指令修改失敗: ${errorMessage}`);
    } finally {
      unmarkRedesigning(index);
      if (patchAbortRef.current === controller) patchAbortRef.current = null;
    }
  };

  // ── Beta: 插入圖片上傳 ──────────────────────────────
  const handleBetaInsertImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = fileListToArray(e.target.files);
    if (files.length === 0) return;
    const readers = files.map((file) => new Promise<DraftImage>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve({ name: file.name, data: reader.result as string });
      reader.readAsDataURL(file);
    }));
    const newImages = await Promise.all(readers);
    setBetaInsertImages(prev => [...prev, ...newImages]);
  };

  const handleRemoveBetaInsertImage = (index: number) => {
    setBetaInsertImages(prev => prev.filter((_, i) => i !== index));
  };

  // ── Beta: 方案 1 — 段落圖片綁定 ─────────────────────
  const handleBindImageToSegment = (segmentIndex: number, imageIndex: number) => {
    const img = betaInsertImages[imageIndex];
    if (!img) return;
    setSegmentImageBindings(prev => {
      const next = new Map(prev);
      next.set(segmentIndex, { imageIndex, draftImage: img });
      return next;
    });
  };

  const handleUnbindImageFromSegment = (segmentIndex: number) => {
    setSegmentImageBindings(prev => {
      const next = new Map(prev);
      next.delete(segmentIndex);
      return next;
    });
  };

  // ── Beta: 方案 2 — 插入圖片 (patchSlide 重繪) ──────
  const handleInsertImage = (slideIndex: number) => {
    setInsertingImageIndex(slideIndex);
  };

  const handleImageSelected = async (imageData: string) => {
    const idx = insertingImageIndex;
    setInsertingImageIndex(null);
    if (idx === null) return;

    const slide = currentSlides[idx];
    if (!slide) return;

    // 推入歷史，支援 undo
    pushHistory(idx, slide);
    markRedesigning(idx);

    patchAbortRef.current?.abort();
    const controller = new AbortController();
    patchAbortRef.current = controller;

    try {
      const result = await patchSlide(
        slide.svg,
        slide.title,
        '請為這張投影片重新排版，在適當位置預留一個矩形區域（至少 300×200px）來放置一張圖片。將現有文字和圖形移開，不要與圖片區域重疊。在 elements 陣列中回傳一個 type:"image" 的元素，指定圖片的 x, y, w, h 座標。',
        idx,
        controller.signal,
      );

      // 保留原 contentType
      if (slide?.contentType && !result.contentType) {
        result.contentType = slide.contentType;
      }

      // 從回傳的 elements 找到 image placeholder
      const imageElement = result.elements.find(e => e.type === 'image');
      if (imageElement) {
        setSlideImageOverlays(prev => {
          const next = new Map(prev);
          next.set(idx, {
            imageData,
            x: imageElement.x,
            y: imageElement.y,
            w: imageElement.w,
            h: imageElement.h,
          });
          return next;
        });
      }

      updateCurrentSlides(slides => {
        const newSlides = [...slides];
        newSlides[idx] = result;
        return newSlides;
      });
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      console.error(`插入圖片第 ${idx + 1} 頁失敗:`, err);
      const errorMessage = err instanceof Error ? err.message : '未知錯誤';
      setError(`插入圖片失敗: ${errorMessage}`);
    } finally {
      unmarkRedesigning(idx);
      if (patchAbortRef.current === controller) patchAbortRef.current = null;
    }
  };

  const handleRemoveImageOverlay = (slideIndex: number) => {
    setSlideImageOverlays(prev => {
      const next = new Map(prev);
      next.delete(slideIndex);
      return next;
    });
  };

  const downloadSVG = (svgString: string, index: number) => {
    triggerBlobDownload(new Blob([svgString], { type: 'image/svg+xml' }), `slide_${index + 1}.svg`);
  };

  const handleExportPPTX = async () => {
    if (currentSlides.length === 0) return;
    try {
      await exportToNativePPTX(currentSlides, slideImageOverlays.size > 0 ? slideImageOverlays : undefined);
    } catch (err) {
      console.error("導出 PPTX 失敗:", err);
      const errorMessage = err instanceof Error ? err.message : '未知錯誤';
      setError(`導出 PPTX 失敗: ${errorMessage}`);
    }
  };

  const handleExportPDF = async () => {
    if (currentSlides.length === 0) return;
    try {
      // Lazy import：jsPDF + svg2pdf.js + TTF 字型只在按下「匯出 PDF」時才下載（首次約 +5MB）
      const { exportToPDF } = await import('./services/pdfService');
      await exportToPDF(currentSlides);
    } catch (err) {
      console.error("導出 PDF 失敗:", err);
      const errorMessage = err instanceof Error ? err.message : '未知錯誤';
      setError(`導出 PDF 失敗: ${errorMessage}`);
    }
  };

  // Recovery 狀態：image 模式重啟後 draftImages（base64 圖）不持久化導致遺失，
  // 但 imageSlides 還在 localStorage。此時讓使用者唯讀檢視 / 下載，上傳新圖或點「清除」就退出。
  const isImageRecovery = state.inputMode === 'image'
    && !state.isGenerating
    && state.draftImages.length === 0
    && state.imageSlides.length > 0;

  return (
    <div className="min-h-screen bg-[#FAFAFB] flex flex-col overflow-hidden">
      {/* ── Main Layout ──────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
      <Sidebar
        state={state}
        processingIndices={processingIndices}
        error={error}
        pendingPptxFile={pendingPptxFile}
        pptxLoadingStage={pptxLoadingStage}
        onManualAuth={handleManualAuth}
        user={user}
        onLogout={handleLogout}
        onUpload={handleImagesUpload}
        onPptxUpload={handlePptxUpload}
        onPdfUpload={handlePdfUpload}
        onClear={clearAll}
        onRemoveDraft={removeDraft}
        onGenerate={handleGenerateDispatch}
        onCancelGeneration={handleCancelGeneration}
        onModeChange={handleModeChange}
        onStorylineChange={handleStorylineChange}
        onAiExpandToggle={handleAiExpandToggle}
        onClearStoryline={clearStoryline}
        onOptimizeOutline={handleOptimizeOutline}
        isOptimizingOutline={isOptimizingOutline}
        outlineHistoryCount={outlineHistory.length}
        onUndoOutline={handleUndoOutline}
        onTranslateOutline={handleTranslateOutline}
        isTranslatingOutline={isTranslatingOutline}
        outlineEditedAfterOptimize={outlineEditedAfterOptimize}
        isBeta={isBeta}
        segmentImageBindings={segmentImageBindings}
        onBindImageToSegment={handleBindImageToSegment}
        onUnbindImageFromSegment={handleUnbindImageFromSegment}
        betaInsertImages={betaInsertImages}
        onBetaInsertImagesUpload={handleBetaInsertImagesUpload}
        onRemoveBetaInsertImage={handleRemoveBetaInsertImage}
        brandStyle={PROFILE.features.brandStylePanel ? brandStyle : undefined}
        onBrandStyleChange={PROFILE.features.brandStylePanel ? handleBrandStyleChange : undefined}
      />

      <main className="flex-1 overflow-y-auto p-6 md:p-12 scroll-smooth">
        <Header
          slidesCount={currentSlides.length}
          totalCount={
            state.inputMode === 'image'
              ? state.draftImages.length
              : state.storylineParsed?.totalPageCount ?? 0
          }
          isGenerating={state.isGenerating}
          onExport={handleExportPPTX}
          onExportPDF={handleExportPDF}
          onOpenHelp={() => setShowOnboarding(true)}
        />

        {isImageRecovery && (
          <div className="max-w-5xl mx-auto mb-6 px-5 py-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start justify-between gap-4">
            <div className="text-[13px] text-amber-900 leading-relaxed">
              <span className="font-semibold">已還原 {state.imageSlides.length} 張上次的投影片</span>
              ，但原始圖片未保留 — 可下載 / 匯出，無法繼續編輯。要繼續編輯請重新上傳對應圖片；或
            </div>
            <button
              onClick={clearAll}
              className="shrink-0 px-3 py-1.5 text-[12px] font-medium text-amber-900 bg-white hover:bg-amber-100 border border-amber-300 rounded-md transition-colors"
            >
              清除並重新開始
            </button>
          </div>
        )}

        {(currentSlides.length > 0 || state.isGenerating) ? (
          <div className="grid grid-cols-1 gap-16 max-w-5xl mx-auto pb-20">
            {state.inputMode === 'image' ? (
              isImageRecovery ? (
                // Recovery：上次 image 模式的 slides，無原圖；唯讀僅供下載 / 匯出
                state.imageSlides.map((slide, idx) => (
                  <SlideCard
                    key={idx}
                    index={idx}
                    draft={null}
                    slide={slide}
                    isProcessing={false}
                    isPending={false}
                    isRedesigning={false}
                    onQuickRedesign={handleQuickRedesign}
                    onCustomRedesign={openCustomRedesignModal}
                    onDownload={downloadSVG}
                    isReadOnly
                  />
                ))
              ) : (
                // Image mode: iterate draftImages
                state.draftImages.map((draft, idx) => (
                  <SlideCard
                    key={idx}
                    index={idx}
                    draft={draft}
                    slide={state.imageSlides[idx]}
                    isProcessing={processingIndices.has(idx)}
                    isPending={!state.imageSlides[idx] && !processingIndices.has(idx)}
                    isRedesigning={redesigningIndices.has(idx)}
                    historyCount={slideHistory.get(idx)?.length ?? 0}
                    onQuickRedesign={handleQuickRedesign}
                    onCustomRedesign={openCustomRedesignModal}
                    onDownload={downloadSVG}
                    onUndo={handleUndo}
                    onEditText={handleEditSlideText}
                    onRetry={handleRetryFailedSlide}
                    onLike={PROFILE.features.brandStylePanel ? handleLike : undefined}
                    onDislike={PROFILE.features.brandStylePanel ? handleDislike : undefined}
                    isBeta={isBeta}
                    imageOverlay={slideImageOverlays.get(idx)}
                    onInsertImage={handleInsertImage}
                    onRemoveImageOverlay={handleRemoveImageOverlay}
                  />
                ))
              )
            ) : (
              <>
                {/* Storyline mode: completed slides */}
                {state.storylineSlides.map((slide, idx) => (
                  <SlideCard
                    key={idx}
                    index={idx}
                    draft={null}
                    slide={slide}
                    isProcessing={processingIndices.has(idx)}
                    isPending={false}
                    isRedesigning={redesigningIndices.has(idx)}
                    historyCount={slideHistory.get(idx)?.length ?? 0}
                    onQuickRedesign={handleQuickRedesign}
                    onCustomRedesign={openCustomRedesignModal}
                    onDownload={downloadSVG}
                    onUndo={handleUndo}
                    onEditText={handleEditSlideText}
                    onRetry={handleRetryFailedSlide}
                    onLike={PROFILE.features.brandStylePanel ? handleLike : undefined}
                    onDislike={PROFILE.features.brandStylePanel ? handleDislike : undefined}
                    isBeta={isBeta}
                    imageOverlay={slideImageOverlays.get(idx)}
                    onInsertImage={handleInsertImage}
                    onRemoveImageOverlay={handleRemoveImageOverlay}
                  />
                ))}
                {/* Pending placeholders during generation */}
                {state.isGenerating && state.storylineParsed &&
                  Array.from(
                    { length: state.storylineParsed.totalPageCount - state.storylineSlides.length },
                    (_, i) => {
                      const idx = state.storylineSlides.length + i;
                      return (
                        <SlideCard
                          key={`pending-${idx}`}
                          index={idx}
                          draft={null}
                          slide={undefined}
                          isProcessing={processingIndices.has(idx)}
                          isPending={!processingIndices.has(idx)}
                          isRedesigning={false}
                          historyCount={0}
                          onQuickRedesign={handleQuickRedesign}
                          onCustomRedesign={openCustomRedesignModal}
                          onDownload={downloadSVG}
                          onUndo={handleUndo}
                          onEditText={handleEditSlideText}
                        />
                      );
                    }
                  )
                }
              </>
            )}
          </div>
        ) : (
          <EmptyState inputMode={state.inputMode} />
        )}
      </main>

      </div>

      <ImagePickerModal
        isOpen={insertingImageIndex !== null}
        draftImages={[...betaInsertImages, ...state.draftImages]}
        onSelect={handleImageSelected}
        onUploadNew={handleBetaInsertImagesUpload}
        onClose={() => setInsertingImageIndex(null)}
      />

      <RedesignModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmCustomRedesign}
        slide={modalTargetIndex !== null ? currentSlides[modalTargetIndex] : undefined}
        index={modalTargetIndex}
        isRedesigning={false}
      />

      <UnauthorizedModal
        isOpen={showUnauthorized}
        email={user?.email || ''}
        onRetry={handleRetryLogin}
        onLogout={handleLogout}
      />

      {showOnboarding && (
        <OnboardingTour onClose={() => setShowOnboarding(false)} />
      )}

      {/* CTA（免費額度用完，public edition only） */}
      {PROFILE.features.showCTA && (
        <CTAModal isOpen={showCTA} onClose={() => setShowCTA(false)} />
      )}
    </div>
  );
};

export default App;
