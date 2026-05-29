
import React, { useState } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { SlideData } from '../types';

interface RedesignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (prompt: string) => void;
  slide: SlideData | undefined;
  index: number | null;
  isRedesigning: boolean;
}

export const RedesignModal: React.FC<RedesignModalProps> = ({
  isOpen, onClose, onConfirm, slide, index, isRedesigning
}) => {
  const [prompt, setPrompt] = useState('');

  if (!isOpen || !slide || index === null) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-indigo-950">修改第 {index + 1} 頁</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">保留現有設計，針對指定部分修改</p>
          </div>
          <button
            onClick={onClose}
            disabled={isRedesigning}
            className="p-1.5 hover:bg-slate-50 rounded-lg transition-colors text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1">
          <div className="mb-4 rounded-lg border border-slate-100 overflow-hidden bg-slate-50 max-h-[180px] flex items-center justify-center">
            <div
              className="w-full max-h-[180px] [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-[180px] [&>svg]:object-contain"
              dangerouslySetInnerHTML={{ __html: slide.svg }}
            />
          </div>

          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            修改要求
          </label>
          <textarea
            className="w-full h-28 p-3.5 border border-slate-200 rounded-lg text-[13px] focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-all outline-none resize-none bg-white placeholder:text-slate-300"
            placeholder="例如：&#10;- 將長條圖改為圓餅圖&#10;- 標題改為「2024年銷售分析」&#10;- 放大右邊說明文字"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            autoFocus
          />
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isRedesigning}
            className="px-4 py-2 rounded-lg font-medium text-slate-500 hover:bg-slate-50 transition-colors text-[13px]"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(prompt)}
            disabled={isRedesigning || !prompt.trim()}
            className="px-5 py-2 rounded-lg font-medium text-white bg-indigo-500 hover:bg-indigo-600 transition-colors text-[13px] flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isRedesigning ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 修改中...</>
            ) : (
              <><Sparkles className="w-3.5 h-3.5" /> 確認修改</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
