
import React from 'react';
import { Image, RotateCcw, Pencil, Download } from 'lucide-react';
import { InputMode } from '../types';

const imageSteps = [
  { icon: Image, text: '將簡報匯出為圖片，批次上傳' },
  { icon: RotateCcw, text: '不滿意？點「快速重繪」換版面' },
  { icon: Pencil, text: '點「指令修改」局部調整' },
  { icon: Download, text: '導出 PPT，右鍵取消群組即可編輯' },
];

const storylineSteps = [
  { icon: RotateCcw, text: '不滿意？點「快速重繪」換版面' },
  { icon: Pencil, text: '點「指令修改」局部調整' },
  { icon: Download, text: '導出 PPT，右鍵取消群組即可編輯' },
];

interface EmptyStateProps {
  inputMode: InputMode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ inputMode }) => {
  const steps = inputMode === 'storyline' ? storylineSteps : imageSteps;
  const subtitle = inputMode === 'storyline'
    ? '在左側輸入大綱，AI 自動生成向量版面'
    : '上傳簡報截圖或輸入大綱，AI 自動生成向量版面';

  return (
    <div className="mt-4 max-w-md">
      <div className="rounded-xl border border-slate-100 bg-white/60 shadow-sm px-6 py-5">
        <p className="text-[13px] text-slate-400 mb-4">{subtitle}</p>

        <div className="space-y-0">
          {steps.map(({ icon: Icon, text }, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5 group">
              <span className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center text-[10px] font-semibold text-indigo-400 shrink-0 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                {i + 1}
              </span>
              <Icon className="w-3.5 h-3.5 text-indigo-200 shrink-0" />
              <span className="text-[13px] text-slate-500">{text}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-4 text-[10px] text-slate-300 text-center">
        開發人：Ava Xu ｜ 如有問題請 chat 聯絡
      </p>
    </div>
  );
};
