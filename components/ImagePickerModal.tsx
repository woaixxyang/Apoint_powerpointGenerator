
import React, { useRef } from 'react';
import { X, ImagePlus, Upload } from 'lucide-react';
import { DraftImage } from '../types';

interface ImagePickerModalProps {
  isOpen: boolean;
  draftImages: DraftImage[];
  onSelect: (imageData: string) => void;
  onUploadNew?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
}

export const ImagePickerModal: React.FC<ImagePickerModalProps> = ({
  isOpen, draftImages, onSelect, onUploadNew, onClose
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleNewUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result) onSelect(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-indigo-950 flex items-center gap-2">
              <ImagePlus className="w-4 h-4 text-indigo-500" />
              選擇圖片
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">選擇要插入投影片的圖片，AI 會自動調整版面</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-50 rounded-lg transition-colors text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1">
          {draftImages.length > 0 && (
            <>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                已上傳的圖片
              </label>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {draftImages.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => onSelect(img.data)}
                    className="group relative aspect-video rounded-lg border border-slate-200 overflow-hidden hover:border-indigo-400 hover:shadow-md transition-all"
                  >
                    <img
                      src={img.data}
                      alt={img.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-indigo-500/0 group-hover:bg-indigo-500/10 transition-colors flex items-center justify-center">
                      <span className="text-[10px] font-medium text-white bg-indigo-500/80 px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        選擇
                      </span>
                    </div>
                    <span className="absolute bottom-0.5 left-1 text-[8px] text-white bg-black/40 px-1 rounded">
                      {img.name.length > 15 ? img.name.slice(0, 12) + '...' : img.name}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Upload new */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full border border-dashed border-slate-200 rounded-lg p-5 flex flex-col items-center text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group"
          >
            <Upload className="w-5 h-5 text-slate-300 group-hover:text-indigo-400 mb-1.5 transition-colors" />
            <p className="text-[12px] text-slate-500 font-medium">上傳新圖片</p>
            <p className="text-[10px] text-slate-300">支援 PNG、JPG、WebP</p>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleNewUpload}
            className="hidden"
          />
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg font-medium text-slate-500 hover:bg-slate-50 transition-colors text-[13px]"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};
