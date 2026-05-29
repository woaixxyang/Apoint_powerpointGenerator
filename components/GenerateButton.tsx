
import React from 'react';
import { Sparkles, Loader2, X } from 'lucide-react';
import { InputMode } from '../types';

interface GenerateButtonProps {
  onClick: () => void;
  onCancel?: () => void;
  disabled: boolean;
  isGenerating: boolean;
  processingIndices: Set<number>;
  totalSlides: number;
  inputMode: InputMode;
}

export const GenerateButton: React.FC<GenerateButtonProps> = ({
  onClick, onCancel, disabled, isGenerating, processingIndices, totalSlides, inputMode
}) => {
  const idleText = inputMode === 'storyline'
    ? `從大綱生成 ${totalSlides} 頁`
    : `生成精緻簡報 ${totalSlides} 頁`;

  const batchLabel = (() => {
    if (processingIndices.size === 0) return '啟動中...';
    const min = Math.min(...processingIndices) + 1;
    const max = Math.max(...processingIndices) + 1;
    return min === max ? `設計中 ${min}/${totalSlides}` : `設計中 ${min}-${max}/${totalSlides}`;
  })();

  if (isGenerating) {
    return (
      <div className="w-full flex items-stretch gap-2">
        <div className="flex-1 bg-indigo-500 text-white font-medium py-3 px-5 rounded-xl flex items-center justify-center gap-2.5">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-200" />
          <span className="text-[13px]">{batchLabel}</span>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-3 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors flex items-center justify-center gap-1"
            title="取消生成（保留已完成頁面）"
          >
            <X className="w-3.5 h-3.5" />
            <span className="text-[12px] font-medium">取消</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-100 disabled:text-slate-400 text-white font-medium py-3 px-5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2.5 group"
    >
      <Sparkles className="w-4 h-4 text-indigo-200 group-hover:text-white transition-colors" />
      <span className="text-[13px]">{idleText}</span>
    </button>
  );
};
