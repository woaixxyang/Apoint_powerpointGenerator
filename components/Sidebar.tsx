
import React, { useRef, useState } from 'react';
import { ListOrdered, Plus, FileUp, ClipboardPaste, Image, FileText, Sparkles, Undo2, Languages, Loader2 } from 'lucide-react';
import { AppState, InputMode, BoundImage, DraftImage, BrandStyle } from '../types';
import { fileListToArray } from '../utils/files';
import { SAUser } from '../services/authService';
import { PROFILE } from '../core/edition';
import { DraftItem } from './DraftItem';
import { GenerateButton } from './GenerateButton';
import { LoginButton } from './LoginButton';
import { UserBadge } from './UserBadge';
import { BrandStylePanel } from './BrandStylePanel';

interface SidebarProps {
  state: AppState;
  processingIndices: Set<number>;
  error: string | null;
  pendingPptxFile: File | null;
  // PPTX 解析中的階段文字（null = 沒在解析）。Sidebar 用來在上傳區顯示進度。
  pptxLoadingStage: string | null;
  onManualAuth: () => void;
  user: SAUser | null;
  onLogout: () => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPptxUpload: (file: File) => void;
  onPdfUpload: (file: File) => void;
  onClear: () => void;
  onRemoveDraft: (index: number) => void;
  onGenerate: () => void;
  onCancelGeneration: () => void;
  onModeChange: (mode: InputMode) => void;
  onStorylineChange: (text: string) => void;
  onAiExpandToggle: () => void;
  onClearStoryline: () => void;
  onOptimizeOutline: (mode: 'refine' | 'regenerate') => void;
  isOptimizingOutline: boolean;
  outlineHistoryCount: number;
  onUndoOutline: () => void;
  onTranslateOutline: () => void;
  isTranslatingOutline: boolean;
  outlineEditedAfterOptimize: boolean;
  // Beta props
  isBeta?: boolean;
  segmentImageBindings?: Map<number, BoundImage>;
  onBindImageToSegment?: (segmentIndex: number, imageIndex: number) => void;
  onUnbindImageFromSegment?: (segmentIndex: number) => void;
  betaInsertImages?: DraftImage[];
  onBetaInsertImagesUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveBetaInsertImage?: (index: number) => void;
  // 品牌風格（public edition，PROFILE.features.brandStylePanel gate）
  brandStyle?: BrandStyle;
  onBrandStyleChange?: (style: BrandStyle) => void;
}

const MODE_CARDS: { mode: InputMode; label: string; icon: typeof Image }[] = [
  { mode: 'storyline', label: '大綱生成', icon: FileText },
  { mode: 'image', label: '美化簡報', icon: Image },
];

export const Sidebar: React.FC<SidebarProps> = ({
  state, processingIndices, error, pendingPptxFile, pptxLoadingStage, onManualAuth, user,
  onLogout,
  onUpload, onPptxUpload, onPdfUpload, onClear, onRemoveDraft, onGenerate, onCancelGeneration,
  onModeChange, onStorylineChange, onAiExpandToggle, onClearStoryline,
  onOptimizeOutline, isOptimizingOutline, outlineHistoryCount, onUndoOutline,
  onTranslateOutline, isTranslatingOutline, outlineEditedAfterOptimize,
  isBeta, segmentImageBindings, onBindImageToSegment, onUnbindImageFromSegment,
  betaInsertImages, onBetaInsertImagesUpload, onRemoveBetaInsertImage,
  brandStyle, onBrandStyleChange
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showOptimizeConfirm, setShowOptimizeConfirm] = useState(false);
  const [showTranslateHint, setShowTranslateHint] = useState(false);
  const [dragOverSegment, setDragOverSegment] = useState<number | null>(null);

  const TRANSLATE_HINT_KEY = 'apoint_translate_hint_shown';

  const handleOptimizeClick = () => {
    if (outlineEditedAfterOptimize) {
      setShowOptimizeConfirm(true);
    } else {
      onOptimizeOutline('regenerate');
    }
  };

  const handleTranslateClick = () => {
    if (!localStorage.getItem(TRANSLATE_HINT_KEY)) {
      setShowTranslateHint(true);
    } else {
      onTranslateOutline();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = fileListToArray(e.target.files);
    if (files.length === 0) return;

    const pptxFiles = files.filter(f => /\.pptx?$/i.test(f.name));
    const pdfFiles = files.filter(f => /\.pdf$/i.test(f.name));
    const imageFiles = files.filter(f => !(/\.(pptx?|pdf)$/i.test(f.name)));

    // Process PPTX files
    if (pptxFiles.length > 0) {
      onPptxUpload(pptxFiles[0]); // Process first PPTX file
    }

    // Process PDF files（PDF→圖片，各 edition 共用）
    if (pdfFiles.length > 0) {
      onPdfUpload(pdfFiles[0]); // Process first PDF file
    }

    // Process image files normally
    if (imageFiles.length > 0) {
      const dt = new DataTransfer();
      imageFiles.forEach(f => dt.items.add(f));
      const syntheticEvent = {
        ...e,
        target: { ...e.target, files: dt.files }
      } as React.ChangeEvent<HTMLInputElement>;
      onUpload(syntheticEvent);
    }

    // Reset input value so same file can be re-selected
    e.target.value = '';
  };

  return (
    <aside className="w-full lg:w-[400px] bg-white/80 backdrop-blur-xl border-r border-slate-100 flex flex-col px-6 py-7 overflow-y-auto max-h-screen lg:max-h-full shrink-0 z-10">
      {/* Brand */}
      <div className="flex items-center gap-3 mb-7">
        <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-sm">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 3L4 21h3.5l1.5-4h6l1.5 4H20L12 3zm-1.5 11L12 8.5 13.5 14h-3z" fill="white" opacity="0.95"/>
            <circle cx="18" cy="7" r="3" fill="white" opacity="0.6"/>
          </svg>
        </div>
        <div>
          <h1 className="text-[15px] font-semibold text-indigo-950 tracking-tight">Apoint</h1>
          {PROFILE.ui.tagline && (
            <p className="text-[9px] text-slate-400 font-medium uppercase tracking-[0.2em]">{PROFILE.ui.tagline}</p>
          )}
        </div>
      </div>

      {/* Auth */}
      <div className="mb-6">
        {user ? (
          <UserBadge user={user} onLogout={onLogout} />
        ) : (
          <LoginButton />
        )}
      </div>

      {/* Not logged in — show prompt */}
      {!user && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-10 opacity-60">
          <p className="text-[12px] text-slate-400">{PROFILE.ui.loginPrompt}</p>
        </div>
      )}

      {/* Mode Selection + Main content (only when logged in) */}
      {user && (
      <>
      <div className="grid grid-cols-2 gap-1 mb-6 p-1 bg-slate-50/80 rounded-xl">
        {MODE_CARDS.map(({ mode, label, icon: Icon }) => {
          const isActive = state.inputMode === mode;
          // 只在生成中鎖定切換 — 避免 in-flight 的 slide 寫到錯誤模式的清單造成資料錯亂。
          // 已完成的內容即使不清除也允許切換瀏覽（既有 slides / content 留在 state 裡，
          // 切回原模式即可繼續）。
          const isDisabled = !isActive && state.isGenerating;
          return (
            <button
              key={mode}
              onClick={() => !isDisabled && onModeChange(mode)}
              disabled={isDisabled}
              title={isDisabled ? '生成中，請等待完成或取消後再切換模式' : undefined}
              className={`relative flex flex-col items-center gap-1 py-2.5 px-2 rounded-lg transition-all text-center ${
                isActive
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : isDisabled
                  ? 'text-slate-200 cursor-not-allowed'
                  : 'text-slate-400 hover:text-slate-600 cursor-pointer'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={isActive ? 2.5 : 1.5} />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Main content */}
      <div className="space-y-5 flex-1">
        <section>
          {error && (
            <div className="mb-3 px-3 py-2.5 bg-red-50/60 rounded-lg">
              <p className="text-[11px] text-red-500 font-medium">{error}</p>
              {pendingPptxFile && (
                <button
                  onClick={onManualAuth}
                  className="mt-2 w-full px-3 py-2 bg-violet-500 text-white text-xs font-medium rounded-lg hover:bg-violet-600 transition-colors"
                >
                  🔑 點擊授權 Google Drive
                </button>
              )}
            </div>
          )}

          {/* Input area */}
          {state.inputMode === 'image' ? (
            <>
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.12em] flex items-center gap-1.5">
                  <ListOrdered className="w-3.5 h-3.5" /> 簡報初稿
                </label>
              </div>

              {pptxLoadingStage ? (
                <div className="border border-dashed border-indigo-300 bg-indigo-50/40 rounded-xl p-7 flex flex-col items-center justify-center text-center">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center mx-auto mb-2.5 shadow-sm">
                    <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                  </div>
                  <p className="text-xs text-indigo-600 font-medium mb-0.5">讀取 PPTX 中...</p>
                  <p className="text-[10px] text-indigo-400">{pptxLoadingStage}</p>
                </div>
              ) : state.draftImages.length > 0 ? (
                <div>
                  <div className="grid grid-cols-3 gap-1.5 max-h-56 overflow-y-auto">
                    {state.draftImages.map((img, i) => (
                      <DraftItem
                        key={i}
                        index={i}
                        draft={img}
                        isProcessing={processingIndices.has(i)}
                        isCompleted={!!state.imageSlides[i]}
                        onRemove={onRemoveDraft}
                      />
                    ))}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-video rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-slate-300 hover:border-slate-300 hover:text-slate-400 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex justify-end mt-1.5">
                    <button onClick={onClear} className="text-[10px] text-slate-300 hover:text-red-400 transition-colors">
                      全部清除
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border border-dashed border-slate-200 rounded-xl p-7 flex flex-col items-center justify-center text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group"
                >
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-2.5 group-hover:bg-slate-100 transition-colors">
                    <FileUp className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors" />
                  </div>
                  <p className="text-xs text-slate-500 font-medium mb-0.5">上傳簡報初稿</p>
                  <p className="text-[10px] text-slate-300 flex items-center gap-1">
                    可上傳 PPT · 上傳圖片 · <ClipboardPaste className="w-2.5 h-2.5 inline" /> 粘貼截圖
                  </p>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*,.pptx,.ppt,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" multiple onChange={handleFileSelect} className="hidden" />

              {/* 品牌風格（public edition only） */}
              {PROFILE.features.brandStylePanel && brandStyle && onBrandStyleChange && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <BrandStylePanel brandStyle={brandStyle} onChange={onBrandStyleChange} />
                </div>
              )}

              {/* Generate button — below clear all */}
              <div className="mt-4">
                <GenerateButton
                  onClick={onGenerate}
                  onCancel={onCancelGeneration}
                  disabled={state.isGenerating || state.draftImages.length === 0}
                  isGenerating={state.isGenerating}
                  processingIndices={processingIndices}
                  totalSlides={state.draftImages.length}
                  inputMode={state.inputMode}
                />
              </div>

              {/* Beta: 美化模式 — 獨立插入圖片上傳區 + 自動偵測提示 */}
              {isBeta && (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <label className="text-[10px] font-semibold text-amber-500 uppercase tracking-[0.12em] flex items-center gap-1.5 mb-2">
                    <Image className="w-3.5 h-3.5" /> 插入圖片庫
                  </label>
                  <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
                    上傳圖片後，可在生成的投影片上手動插入並重新排版。
                  </p>

                  {/* 已上傳的插入圖片 */}
                  {betaInsertImages && betaInsertImages.length > 0 && (
                    <div className="grid grid-cols-4 gap-1.5 mb-2">
                      {betaInsertImages.map((img, i) => (
                        <div key={i} className="relative group/img aspect-video">
                          <img
                            src={img.data}
                            alt={img.name}
                            className="w-full h-full object-cover rounded border border-amber-200 group-hover/img:border-amber-400 transition-colors"
                            title={img.name}
                          />
                          {onRemoveBetaInsertImage && (
                            <button
                              onClick={() => onRemoveBetaInsertImage(i)}
                              className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[9px] opacity-0 group-hover/img:opacity-100 transition-opacity shadow-sm hover:bg-red-600"
                              title="移除圖片"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 上傳按鈕 */}
                  <label className="flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-amber-200 rounded-lg cursor-pointer hover:border-amber-400 hover:bg-amber-50/30 transition-all text-[11px] text-amber-500 font-medium">
                    <Plus className="w-3.5 h-3.5" />
                    上傳圖片
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        onBetaInsertImagesUpload?.(e);
                        e.target.value = ''; // 重置，允許重複選同檔案
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </>
          ) : state.inputMode === 'storyline' ? (
            <>
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.12em] flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> 簡報大綱
                </label>
                {state.storylineParsed && state.storylineParsed.totalPageCount > 0 && (
                  <span className="text-[10px] text-slate-400 font-medium tabular-nums">
                    {state.storylineParsed.totalPageCount} 頁
                  </span>
                )}
              </div>
              <div className="relative">
                <textarea
                  ref={(el) => {
                    if (el) {
                      el.style.height = 'auto';
                      el.style.height = Math.max(176, el.scrollHeight) + 'px';
                    }
                  }}
                  value={state.content}
                  onChange={(e) => {
                    onStorylineChange(e.target.value);
                    const el = e.target;
                    el.style.height = 'auto';
                    el.style.height = Math.max(176, el.scrollHeight) + 'px';
                  }}
                  placeholder={`p1 開場：公司願景與使命\np2 市場現況分析\n  - 目前市場規模\n  - 競爭者分析\np3 我們的解決方案\np4 產品特色與優勢\np5 未來展望與行動方案`}
                  className="w-full min-h-[176px] pb-12 p-3.5 text-[13px] leading-relaxed border border-slate-200 rounded-xl resize-none focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-50 transition-all bg-white placeholder:text-slate-300"
                />
                {/* Inline circular icon buttons — bottom-right inside textarea */}
                <div className="absolute right-2.5 bottom-3 flex items-center gap-1.5">
                  <button
                    onClick={handleOptimizeClick}
                    disabled={isOptimizingOutline || isTranslatingOutline || !state.content.trim()}
                    title="優化大綱"
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                      isOptimizingOutline || isTranslatingOutline || !state.content.trim()
                        ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                        : 'bg-indigo-50 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-600 active:scale-90'
                    }`}
                  >
                    {isOptimizingOutline ? (
                      <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={handleTranslateClick}
                    disabled={isTranslatingOutline || isOptimizingOutline || !state.content.trim()}
                    title="中英文切換"
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                      isTranslatingOutline || isOptimizingOutline || !state.content.trim()
                        ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                        : 'bg-sky-50 text-sky-500 hover:bg-sky-100 hover:text-sky-600 active:scale-90'
                    }`}
                  >
                    {isTranslatingOutline ? (
                      <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    ) : (
                      <Languages className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {outlineHistoryCount > 0 && (
                    <button
                      onClick={onUndoOutline}
                      disabled={isOptimizingOutline || isTranslatingOutline}
                      title="撤銷上一次操作"
                      className="w-7 h-7 rounded-full flex items-center justify-center bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:scale-90 transition-all"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={state.aiExpand}
                    onChange={onAiExpandToggle}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400"
                  />
                  <span className="text-[11px] text-slate-400 font-medium">AI 自動補充內容</span>
                </label>
                {(state.content || state.storylineSlides.length > 0) && (
                  <button onClick={onClearStoryline} className="text-[10px] text-slate-300 hover:text-red-400 transition-colors">
                    全部清除
                  </button>
                )}
              </div>

              {/* 品牌風格（public edition only） */}
              {PROFILE.features.brandStylePanel && brandStyle && onBrandStyleChange && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <BrandStylePanel brandStyle={brandStyle} onChange={onBrandStyleChange} />
                </div>
              )}

              {/* Generate button — below clear all */}
              <div className="mt-4">
                <GenerateButton
                  onClick={onGenerate}
                  onCancel={onCancelGeneration}
                  disabled={state.isGenerating || !state.storylineParsed || state.storylineParsed.totalPageCount === 0}
                  isGenerating={state.isGenerating}
                  processingIndices={processingIndices}
                  totalSlides={state.storylineParsed?.totalPageCount ?? 0}
                  inputMode={state.inputMode}
                />
              </div>

              {/* ── Beta: 段落圖片綁定 ──────────────────── */}
              {isBeta && state.storylineParsed && state.storylineParsed.totalPageCount > 0 && (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <label className="text-[10px] font-semibold text-amber-500 uppercase tracking-[0.12em] flex items-center gap-1.5 mb-2">
                    <Image className="w-3.5 h-3.5" /> 拖曳圖片到頁面以插入圖片
                  </label>

                  {/* Draggable image thumbnails + upload + delete */}
                  {betaInsertImages && betaInsertImages.length > 0 && (
                    <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 items-center">
                      {betaInsertImages.map((img, i) => (
                        <div key={i} className="relative group/drag shrink-0">
                          <img
                            src={img.data}
                            alt={img.name}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', String(i));
                              e.dataTransfer.effectAllowed = 'copy';
                            }}
                            className="w-12 h-8 object-cover rounded border border-amber-200 cursor-grab active:cursor-grabbing hover:border-indigo-300 transition-colors"
                            title={img.name}
                          />
                          {onRemoveBetaInsertImage && (
                            <button
                              onClick={() => onRemoveBetaInsertImage(i)}
                              className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 text-white rounded-full flex items-center justify-center text-[8px] opacity-0 group-hover/drag:opacity-100 transition-opacity shadow-sm hover:bg-red-600"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 上傳按鈕（始終顯示，可持續新增） */}
                  <label className="flex items-center justify-center gap-1.5 px-3 py-2 mb-3 border border-dashed border-amber-200 rounded-lg cursor-pointer hover:border-amber-400 hover:bg-amber-50/30 transition-all text-[11px] text-amber-500 font-medium">
                    <Plus className="w-3.5 h-3.5" />
                    {betaInsertImages && betaInsertImages.length > 0 ? '新增圖片' : '上傳圖片以綁定到頁面'}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        onBetaInsertImagesUpload?.(e);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>

                  {/* Segment list with drop zones */}
                  {betaInsertImages && betaInsertImages.length > 0 && (
                    <>
                      <p className="text-[9px] text-slate-300 mb-2">拖曳上方圖片到對應頁面</p>
                      <div className="space-y-1.5">
                        {state.storylineParsed.segments.map((seg, idx) => {
                          const bound = segmentImageBindings?.get(idx);
                          return (
                            <div
                              key={idx}
                              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all ${
                                dragOverSegment === idx
                                  ? 'border-indigo-400 bg-indigo-50/50'
                                  : bound
                                  ? 'border-indigo-200 bg-indigo-50/30'
                                  : 'border-slate-100 bg-slate-50/50'
                              }`}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'copy';
                                setDragOverSegment(idx);
                              }}
                              onDragLeave={() => setDragOverSegment(null)}
                              onDrop={(e) => {
                                e.preventDefault();
                                setDragOverSegment(null);
                                const imageIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                                if (!isNaN(imageIndex)) {
                                  onBindImageToSegment?.(idx, imageIndex);
                                }
                              }}
                            >
                              <span className="text-[10px] font-bold text-indigo-400 shrink-0 w-6">
                                P{seg.pageNumber}
                              </span>
                              <span className="text-[11px] text-slate-500 truncate flex-1 min-w-0">
                                {seg.content.split('\n')[0].slice(0, 30)}
                              </span>
                              {bound ? (
                                <div className="flex items-center gap-1 shrink-0">
                                  <img
                                    src={bound.draftImage.data}
                                    alt=""
                                    className="w-8 h-5 object-cover rounded border border-indigo-200"
                                  />
                                  <button
                                    onClick={() => onUnbindImageFromSegment?.(idx)}
                                    className="text-slate-300 hover:text-red-400 text-xs transition-colors"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[9px] text-slate-300 shrink-0">
                                  {dragOverSegment === idx ? '放開' : '拖入'}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          ) : null}
        </section>
      </div>
      </>
      )}

      {/* Optimize Outline Confirmation Modal */}
      {showOptimizeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100">
              <h3 className="text-base font-semibold text-indigo-950">優化大綱</h3>
              <p className="text-[13px] text-slate-500 mt-1.5">是否根據修改後大綱進行優化？</p>
            </div>
            {/* Footer */}
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowOptimizeConfirm(false);
                  onOptimizeOutline('regenerate');
                }}
                className="px-4 py-2 rounded-lg font-medium text-slate-500 hover:bg-slate-50 transition-colors text-[13px]"
              >
                否，重新生成
              </button>
              <button
                onClick={() => {
                  setShowOptimizeConfirm(false);
                  onOptimizeOutline('refine');
                }}
                className="px-5 py-2 rounded-lg font-medium text-white bg-indigo-500 hover:bg-indigo-600 transition-colors text-[13px] flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" /> 是，微調優化
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Translate Hint Modal — one-time */}
      {showTranslateHint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
              <h3 className="text-base font-semibold text-indigo-950">翻譯提示</h3>
              <p className="text-[13px] text-slate-500 mt-1.5">英文版大綱將生成英文簡報，中文版大綱將生成中文簡報。</p>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setShowTranslateHint(false)}
                className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors text-[13px]"
              >
                取消
              </button>
              <button
                onClick={() => {
                  localStorage.setItem(TRANSLATE_HINT_KEY, '1');
                  setShowTranslateHint(false);
                  onTranslateOutline();
                }}
                className="px-5 py-2 rounded-lg font-medium text-white bg-indigo-500 hover:bg-indigo-600 transition-colors text-[13px] flex items-center gap-1.5"
              >
                <Languages className="w-3.5 h-3.5" /> 我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
