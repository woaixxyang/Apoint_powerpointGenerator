
import React from 'react';
import { X, CheckCircle2, Loader2 } from 'lucide-react';
import { DraftImage } from '../types';

interface DraftItemProps {
  index: number;
  draft: DraftImage;
  isProcessing: boolean;
  isCompleted: boolean;
  onRemove: (index: number) => void;
}

export const DraftItem: React.FC<DraftItemProps> = ({ index, draft, isProcessing, isCompleted, onRemove }) => {
  return (
    <div className={`relative group aspect-video rounded-lg overflow-hidden border transition-all ${
      isProcessing ? 'border-indigo-400 ring-1 ring-indigo-100' : 'border-slate-100'
    } bg-white`}>
      <img src={draft.data} className="w-full h-full object-cover" alt={draft.name} />

      {isCompleted && (
        <div className="absolute top-1 right-1 bg-emerald-500 rounded-full p-0.5">
          <CheckCircle2 className="w-2.5 h-2.5 text-white" />
        </div>
      )}

      {isProcessing && (
        <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
        </div>
      )}

      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(index); }}
          className="bg-white/20 p-1 rounded-full text-white hover:bg-red-500 transition-colors"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent text-[7px] text-white/80 px-1.5 py-1 font-medium truncate">
        {index + 1}
      </div>
    </div>
  );
};
