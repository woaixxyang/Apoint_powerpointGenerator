
import React, { useState, useMemo, useRef, useCallback, useEffect, useId } from 'react';
import { Loader2, RotateCcw, Download, Sparkles, ImageIcon, Pencil, Undo2, Type, X, Check, ThumbsUp, ThumbsDown } from 'lucide-react';
import { SlideData, DraftImage, SlideImageOverlay } from '../types';
import { PROFILE } from '../core/edition';
import { LikePopover } from './LikePopover';
import { DislikePopover } from './DislikePopover';

/** Extract all data-region values from SVG string */
export const extractRegionsFromSvg = (svg: string): string[] => {
  if (!svg) return [];
  const regions = new Set<string>();
  for (const m of svg.matchAll(/data-region="([^"]+)"/g)) regions.add(m[1]);
  return Array.from(regions);
};

/** 被選中的 text/tspan 元素資訊 */
interface SelectedText {
  textIndex: number;
  tspanIndex: number;  // -1 = 直接編輯 <text>，>= 0 = 編輯特定 <tspan>
  originalText: string;
}

interface SlideCardProps {
  index: number;
  draft: DraftImage | null;
  slide?: SlideData;
  isProcessing: boolean;
  isPending: boolean;
  isRedesigning: boolean;
  historyCount?: number;
  onQuickRedesign: (index: number) => void;
  onCustomRedesign: (index: number) => void;
  onDownload: (svgString: string, index: number) => void;
  onUndo?: (index: number) => void;
  onEditText?: (index: number, newSvg: string) => void;
  // 批次生成失敗時：點擊後重新單獨生成這一頁
  onRetry?: (index: number) => void;
  // 偏好回饋（public edition，FEATURES.brandStylePanel gate）
  onLike?: (index: number, selectedRegions: string[]) => void;
  onDislike?: (index: number, selectedRegions: string[]) => void;
  // Beta props
  isBeta?: boolean;
  imageOverlay?: SlideImageOverlay;
  onInsertImage?: (index: number) => void;
  onRemoveImageOverlay?: (index: number) => void;
  // Recovery 模式（image 模式重啟後 draftImages 已遺失）：僅可下載，不顯示 redesign / 編輯按鈕
  isReadOnly?: boolean;
}

export const SlideCard: React.FC<SlideCardProps> = ({
  index, draft, slide, isProcessing, isPending, isRedesigning,
  historyCount = 0,
  onQuickRedesign, onCustomRedesign, onDownload,
  onUndo, onEditText, onRetry,
  onLike, onDislike,
  isBeta, imageOverlay, onInsertImage, onRemoveImageOverlay,
  isReadOnly = false,
}) => {
  const cardId = useId().replace(/:/g, '');
  const [isEditing, setIsEditing] = useState(false);
  const [selected, setSelected] = useState<SelectedText | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isLikeOpen, setIsLikeOpen] = useState(false);
  const [isDislikeOpen, setIsDislikeOpen] = useState(false);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const availableRegions = useMemo(
    () => slide ? extractRegionsFromSvg(slide.svg) : [],
    [slide]
  );

  const feedbackEnabled = PROFILE.features.brandStylePanel;

  const exitEditMode = useCallback(() => {
    setIsEditing(false);
    setSelected(null);
    setEditValue('');
  }, []);

  // Escape 鍵退出
  useEffect(() => {
    if (!isEditing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selected) {
          setSelected(null);
          setEditValue('');
        } else {
          exitEditMode();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isEditing, selected, exitEditMode]);

  // 彈出框出現時自動 focus
  useEffect(() => {
    if (selected && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [selected]);

  /** 點擊 SVG 中的 text/tspan 元素 → 彈出修改框（逐行編輯） */
  const handleSvgClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditing || !slide || !svgContainerRef.current) return;

    const target = e.target as Element;
    const tag = target.tagName.toLowerCase();

    // 找到所屬 <text> 元素
    const textEl = tag === 'text' ? target
      : tag === 'tspan' ? target.closest('text')
      : target.closest('text');
    if (!textEl) return;

    const svgEl = svgContainerRef.current.querySelector('svg');
    if (!svgEl) return;
    const allTexts = Array.from(svgEl.querySelectorAll('text'));
    const textIndex = allTexts.indexOf(textEl as SVGTextElement);
    if (textIndex === -1) return;

    // 判斷是否點擊了特定 tspan
    const tspans = Array.from(textEl.querySelectorAll('tspan'));
    let tspanIndex = -1;
    let text = '';

    if (tag === 'tspan' && tspans.length > 0) {
      tspanIndex = tspans.indexOf(target as SVGTSpanElement);
      text = target.textContent || '';
    } else if (tspans.length > 0) {
      // 點擊 <text> 但有 tspan → 取第一個 tspan
      tspanIndex = 0;
      text = tspans[0].textContent || '';
    } else {
      // 無 tspan，直接編輯 <text>
      text = textEl.textContent || '';
    }

    setSelected({ textIndex, tspanIndex, originalText: text });
    setEditValue(text);
  }, [isEditing, slide]);

  /** 確認修改 */
  const commitEdit = useCallback(() => {
    if (!selected || !slide || !onEditText) {
      setSelected(null);
      setEditValue('');
      return;
    }

    const newText = editValue.trim();
    if (!newText || newText === selected.originalText) {
      setSelected(null);
      setEditValue('');
      return;
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(slide.svg, 'image/svg+xml');
      if (doc.querySelector('parsererror')) {
        setSelected(null);
        return;
      }

      const allTexts = Array.from(doc.querySelectorAll('text'));
      const targetText = allTexts[selected.textIndex];
      if (!targetText) {
        setSelected(null);
        return;
      }

      // 逐行編輯：只更新目標 tspan 或 text
      if (selected.tspanIndex >= 0) {
        const tspans = targetText.querySelectorAll('tspan');
        const targetTspan = tspans[selected.tspanIndex];
        if (targetTspan) {
          targetTspan.textContent = newText;
        }
      } else {
        targetText.textContent = newText;
      }

      let newSvg = new XMLSerializer().serializeToString(doc);
      newSvg = newSvg.replace(/\s+xmlns:xlink="[^"]*"/g, '');
      newSvg = newSvg.replace(/\s+xml:space="[^"]*"/g, '');

      onEditText(index, newSvg);
    } catch (err) {
      console.error('[SlideCard] Text edit failed:', err);
    }

    setSelected(null);
    setEditValue('');
  }, [selected, editValue, slide, onEditText, index]);

  return (
    <div id={cardId} className={`group flex flex-col gap-4 ${isPending ? 'opacity-40 grayscale' : ''}`}>
      {/* Card Header */}
      <div className="relative z-30 flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <span className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold tabular-nums transition-colors ${
            slide ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-300'
          }`}>
            {index + 1}
          </span>
          <div>
            <h3 className="text-[13px] font-medium text-slate-700 truncate max-w-[300px]">
              {slide ? slide.title : (isProcessing ? "正在構建視覺框架..." : "等待隊列中")}
            </h3>
            {draft && <p className="text-[10px] text-slate-400">{draft.name}</p>}
          </div>
        </div>

        {slide?.failed ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onRetry?.(index)}
              disabled={isRedesigning || !onRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-lg transition-colors"
              title="重試此頁"
            >
              <RotateCcw className="w-3 h-3" />
              重試此頁
            </button>
          </div>
        ) : slide && (
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
            {!isReadOnly && (
              <>
                {historyCount > 0 && (
                  <button
                    onClick={() => onUndo?.(index)}
                    disabled={isRedesigning}
                    className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                    title={`復原 (${historyCount})`}
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center text-[8px] font-semibold text-white bg-indigo-400 rounded-full leading-none px-0.5">
                      {historyCount}
                    </span>
                  </button>
                )}

                {/* 文字編輯 toggle */}
                {onEditText && (
                  <button
                    onClick={() => isEditing ? exitEditMode() : setIsEditing(true)}
                    disabled={isRedesigning}
                    className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-colors ${
                      isEditing
                        ? 'text-indigo-600 bg-indigo-50'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {isEditing ? <X className="w-3 h-3" /> : <Type className="w-3 h-3" />}
                    {isEditing ? '退出編輯' : '編輯文字'}
                  </button>
                )}

                <button
                  onClick={() => onQuickRedesign(index)}
                  disabled={isRedesigning}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                  title="快速重繪"
                >
                  {isRedesigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => onCustomRedesign(index)}
                  disabled={isRedesigning}
                  className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  指令修改
                </button>
                {isBeta && onInsertImage && (
                  <button
                    onClick={() => onInsertImage(index)}
                    disabled={isRedesigning}
                    className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                    title="插入圖片"
                  >
                    <ImageIcon className="w-3 h-3" />
                    插入圖片
                  </button>
                )}
                {/* 偏好回饋（public edition only） */}
                {feedbackEnabled && onLike && (
                  <button
                    onClick={() => setIsLikeOpen(v => !v)}
                    disabled={isRedesigning}
                    className="p-2 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors"
                    title="喜歡這頁"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                )}
                {feedbackEnabled && onDislike && (
                  <button
                    onClick={() => setIsDislikeOpen(v => !v)}
                    disabled={isRedesigning}
                    className="p-2 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                    title="不喜歡這頁"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
            <button
              onClick={() => onDownload(slide.svg, index)}
              className="p-2 text-slate-300 hover:text-slate-500 hover:bg-slate-50 rounded-lg transition-colors"
              title="下載 SVG"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      {/* 偏好回饋 Popover（portal-style，渲染在工具列外） */}
      {feedbackEnabled && onLike && (
        <LikePopover
          isOpen={isLikeOpen}
          availableRegions={availableRegions}
          onClose={() => setIsLikeOpen(false)}
          onSubmit={regions => { setIsLikeOpen(false); onLike(index, regions); }}
        />
      )}
      {feedbackEnabled && onDislike && (
        <DislikePopover
          isOpen={isDislikeOpen}
          availableRegions={availableRegions}
          onClose={() => setIsDislikeOpen(false)}
          onSubmit={regions => { setIsDislikeOpen(false); onDislike(index, regions); }}
        />
      )}

      {/* Slide Canvas */}
      <div className={`relative bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06),0_20px_40px_rgba(0,0,0,0.04)] border border-slate-100 transition-all duration-500 ${isProcessing ? 'ring-2 ring-indigo-300 ring-offset-2' : ''} ${isEditing ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}`}>
        <div className="aspect-[16/9] w-full flex items-center justify-center bg-white">
          {slide ? (
            <>
              <div
                ref={svgContainerRef}
                className={`w-full h-full slide-svg ${isEditing ? 'cursor-text' : 'pointer-events-none'}`}
                dangerouslySetInnerHTML={{ __html: slide.svg }}
                onClick={isEditing ? handleSvgClick : undefined}
              />
              {/* Beta: 單圖覆蓋層（手動插入） */}
              {isBeta && imageOverlay && (
                <div className="absolute group/overlay" style={{
                  left: `${(imageOverlay.x / 960) * 100}%`,
                  top: `${(imageOverlay.y / 540) * 100}%`,
                  width: `${(imageOverlay.w / 960) * 100}%`,
                  height: `${(imageOverlay.h / 540) * 100}%`,
                }}>
                  <img
                    src={imageOverlay.imageData}
                    alt="Inserted image"
                    className="w-full h-full object-cover rounded-sm"
                  />
                  {onRemoveImageOverlay && (
                    <button
                      onClick={() => onRemoveImageOverlay(index)}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover/overlay:opacity-100 transition-opacity shadow-sm hover:bg-red-600 pointer-events-auto"
                      title="移除圖片"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center">
              {isProcessing ? (
                <>
                  <div className="relative mb-5">
                    <Loader2 className="w-10 h-10 text-indigo-300 animate-spin" />
                    <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-indigo-400 animate-pulse" />
                  </div>
                  <p className="text-[11px] font-medium text-indigo-400 animate-pulse tracking-widest uppercase">Generating...</p>
                </>
              ) : (
                <ImageIcon className="w-16 h-16 text-slate-100" />
              )}
            </div>
          )}
        </div>

        {/* 編輯模式提示 */}
        {isEditing && !selected && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-40 px-3 py-1 bg-indigo-500/90 text-white text-[10px] rounded-full backdrop-blur-sm">
            點擊文字即可編輯 · ESC 退出
          </div>
        )}

        {/* 編輯模式 hover 高亮 CSS */}
        {isEditing && (
          <style>{`
            #${cardId} .slide-svg text {
              cursor: text !important;
              transition: opacity 0.15s;
            }
            #${cardId} .slide-svg text:hover {
              opacity: 0.7;
            }
          `}</style>
        )}

        {/* 文字修改彈出框 */}
        {selected && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
            <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-[85%] max-w-[500px] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] font-semibold text-slate-600">修改文字</span>
                <button
                  onClick={() => { setSelected(null); setEditValue(''); }}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <textarea
                ref={textareaRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    commitEdit();
                  }
                }}
                rows={Math.min(Math.max(editValue.split('\n').length, 1), 5)}
                className="w-full px-3 py-2 text-[13px] text-slate-700 border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none"
                placeholder="輸入新文字..."
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-[10px] text-slate-400">Enter 確認 · Shift+Enter 換行 · ESC 取消</span>
                <button
                  onClick={commitEdit}
                  className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors"
                >
                  <Check className="w-3 h-3" />
                  確認
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 失敗頁面：中央重試按鈕。被 isRedesigning 覆蓋優先（重試中時不顯示）。 */}
        {slide?.failed && !isRedesigning && onRetry && (
          <button
            onClick={() => onRetry(index)}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-red-50/60 hover:bg-red-50/80 backdrop-blur-[1px] transition-colors cursor-pointer"
            title="重試此頁"
          >
            <div className="flex items-center gap-2 px-4 py-2.5 bg-white shadow-md rounded-full border border-red-100 hover:border-red-200 transition-colors">
              <RotateCcw className="w-4 h-4 text-red-500" />
              <span className="text-[13px] font-medium text-red-600">重試此頁</span>
            </div>
          </button>
        )}

        {isRedesigning && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-[2px] flex flex-col items-center justify-center z-20">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
            <p className="text-[12px] font-medium text-slate-500">重繪中...</p>
          </div>
        )}
      </div>
    </div>
  );
};
