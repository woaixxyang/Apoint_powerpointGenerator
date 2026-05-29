
import React from 'react';
import { Download, FileDown, HelpCircle, Type } from 'lucide-react';
import { downloadFontInstaller } from '../services/fontDownloadService';

interface HeaderProps {
  slidesCount: number;
  totalCount: number;
  isGenerating: boolean;
  onExport: () => void;
  onExportPDF: () => void;
  onOpenHelp: () => void;
}

export const Header: React.FC<HeaderProps> = ({ slidesCount, totalCount, isGenerating, onExport, onExportPDF, onOpenHelp }) => {
  const [downloadingFonts, setDownloadingFonts] = React.useState(false);
  const handleDownloadFonts = async () => {
    if (downloadingFonts) return;
    setDownloadingFonts(true);
    try {
      await downloadFontInstaller();
    } catch (err) {
      console.error('字型包下載失敗:', err);
    } finally {
      setDownloadingFonts(false);
    }
  };

  return (
    <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
      <div>
        <h2 className="text-2xl font-semibold text-indigo-950 tracking-tight">方案預覽</h2>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] font-medium text-slate-400">配色方案</span>
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B00]"></span> 橘
          </span>
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00AEEF]"></span> 藍
          </span>
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00C853]"></span> 綠
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onOpenHelp}
          title="使用指南"
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all"
        >
          <HelpCircle className="w-4.5 h-4.5" />
        </button>
        {(slidesCount > 0 || isGenerating) && (
          <>
            <p className="text-[11px] text-slate-400 font-medium tabular-nums">
              {slidesCount}/{totalCount}
            </p>
            <button
              onClick={handleDownloadFonts}
              disabled={downloadingFonts}
              title="若 PPTX 在 Keynote / Google Slides / 部分 Mac PowerPoint 開啟後出現中文亂碼、缺字方塊或字型異常，請下載並安裝字型包"
              className="flex items-center gap-1.5 px-3 py-2.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg font-medium text-[12px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Type className="w-3.5 h-3.5" />
              {downloadingFonts ? '打包中…' : '字型包'}
            </button>
            <button
              onClick={onExportPDF}
              disabled={slidesCount === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg font-medium text-[13px] hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileDown className="w-3.5 h-3.5" />
              PDF
            </button>
            <button
              onClick={onExport}
              disabled={slidesCount === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500 text-white rounded-lg font-medium text-[13px] hover:bg-indigo-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              PPTX
            </button>
          </>
        )}
      </div>
    </header>
  );
};
