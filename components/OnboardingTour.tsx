
import React, { useState } from 'react';
import {
  FileText, Image, Sparkles, FileUp, Wand2,
  RotateCcw, Pencil, Type, Download,
  ChevronLeft, ChevronRight, X,
} from 'lucide-react';

const STORAGE_KEY = 'sa_onboarding_done';

export function hasSeenOnboarding(): boolean {
  return localStorage.getItem(STORAGE_KEY) === '1';
}

interface Step {
  title: string;
  icon: React.ReactNode;
  bullets: { icon: React.ReactNode; text: string; link?: string }[];
}

const STEPS: Step[] = [
  {
    title: '選擇模式',
    icon: <div className="flex gap-3"><FileText className="w-10 h-10 text-indigo-400" /><Image className="w-10 h-10 text-violet-400" /></div>,
    bullets: [
      { icon: <FileText className="w-4 h-4 text-indigo-500" />, text: '大綱生成 — 根據輸入文字生成專業簡報' },
      { icon: <Image className="w-4 h-4 text-violet-500" />, text: '美化簡報 — 美化現有簡報' },
    ],
  },
  {
    title: '大綱生成模式',
    icon: <Sparkles className="w-12 h-12 text-amber-400" />,
    bullets: [
      { icon: <FileText className="w-4 h-4 text-indigo-500" />, text: '用 p1、p2、p3 格式輸入每頁大綱，子項用「 - 」縮排' },
      { icon: <Sparkles className="w-4 h-4 text-amber-500" />, text: '點擊輸入框左下角 ✨ 按鈕，AI 幫你優化大綱結構' },
      { icon: <Wand2 className="w-4 h-4 text-purple-500" />, text: '勾選「AI 自動補充內容」，AI 會自動豐富每頁的細節' },
    ],
  },
  {
    title: '美化簡報模式',
    icon: <FileUp className="w-12 h-12 text-sky-400" />,
    bullets: [
      { icon: <FileUp className="w-4 h-4 text-sky-500" />, text: '支援上傳 PPT 檔案、批次上傳圖片、粘貼截圖' },
    ],
  },
  {
    title: '生成與預覽',
    icon: <Wand2 className="w-12 h-12 text-indigo-400" />,
    bullets: [
      { icon: <Sparkles className="w-4 h-4 text-indigo-500" />, text: '點擊藍色生成按鈕，AI 會逐頁設計向量簡報' },
      { icon: <span className="text-[11px] font-bold text-slate-500 w-4 h-4 flex items-center justify-center">🖱</span>, text: '滑鼠懸停在生成的卡片上，會出現操作工具列' },
    ],
  },
  {
    title: '編輯調整',
    icon: <Pencil className="w-12 h-12 text-emerald-400" />,
    bullets: [
      { icon: <RotateCcw className="w-4 h-4 text-blue-500" />, text: '快速重繪 — 不滿意版面？一鍵換全新設計' },
      { icon: <Pencil className="w-4 h-4 text-emerald-500" />, text: '指令修改 — 輸入指令精準調整，如「把長條圖改為圓餅圖」' },
      { icon: <Type className="w-4 h-4 text-orange-500" />, text: '編輯文字 — 進入編輯模式，直接點擊文字即可修改' },
    ],
  },
  {
    title: '匯出簡報',
    icon: <Download className="w-12 h-12 text-indigo-400" />,
    bullets: [
      { icon: <Download className="w-4 h-4 text-indigo-500" />, text: '點右上角「PPTX」或「PDF」下載完整簡報檔案' },
      { icon: <span className="text-[11px] font-bold text-slate-500 w-4 h-4 flex items-center justify-center">⚙</span>, text: '匯出的 PPTX 為原生可編輯格式，文字可直接修改字型，Mac/Windows 皆可使用' },
      { icon: <Type className="w-4 h-4 text-amber-500" />, text: '若在 Keynote / Google Slides / 部分 Mac PowerPoint 開啟時中文顯示異常，點右上角「字型包」下載並安裝即可' },
    ],
  },
];

interface OnboardingTourProps {
  onClose: () => void;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ onClose }) => {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Skip button */}
        <button
          onClick={handleComplete}
          className="absolute top-4 right-4 text-slate-300 hover:text-slate-500 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Step counter */}
        <div className="px-7 pt-6 pb-0">
          <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-[0.15em]">
            {step + 1} / {STEPS.length}
          </span>
        </div>

        {/* Content */}
        <div className="px-7 pt-4 pb-6">
          {/* Icon area */}
          <div className="flex items-center justify-center h-20 mb-5">
            {current.icon}
          </div>

          {/* Title */}
          <h2 className="text-lg font-bold text-slate-800 mb-4 text-center">
            {current.title}
          </h2>

          {/* Bullets */}
          <div className="space-y-3">
            {current.bullets.map((b, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0">{b.icon}</span>
                {b.link ? (
                  <a href={b.link} target="_blank" rel="noopener noreferrer" className="text-[13px] text-indigo-500 hover:text-indigo-700 underline leading-relaxed">{b.text}</a>
                ) : (
                  <span className="text-[13px] text-slate-600 leading-relaxed">{b.text}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-7 pb-6 flex items-center justify-between">
          {/* Dots */}
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === step ? 'bg-indigo-500 w-5' : 'bg-slate-200 hover:bg-slate-300'
                }`}
              />
            ))}
          </div>

          {/* Nav buttons */}
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-1 px-3 py-2 text-[12px] font-medium text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-all"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                上一步
              </button>
            )}
            <button
              onClick={isLast ? handleComplete : () => setStep(s => s + 1)}
              className="flex items-center gap-1 px-4 py-2 text-[12px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-all active:scale-[0.97]"
            >
              {isLast ? '開始使用' : '下一步'}
              {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
