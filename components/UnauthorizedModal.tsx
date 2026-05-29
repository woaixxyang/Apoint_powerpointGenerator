
import React from 'react';
import { ShieldAlert, LogOut, RefreshCw } from 'lucide-react';
import { PROFILE } from '../core/edition';

interface UnauthorizedModalProps {
  isOpen: boolean;
  email: string;
  onRetry: () => void;
  onLogout: () => void;
}

export const UnauthorizedModal: React.FC<UnauthorizedModalProps> = ({
  isOpen, email, onRetry, onLogout
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="bg-red-500 p-8 text-center">
          <div className="w-14 h-14 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-1.5">無法使用此帳號</h2>
          <p className="text-white/60 text-[13px]">{PROFILE.ui.unauthorizedTitle}</p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="text-center">
            <p className="text-[13px] text-slate-600 mb-1">您目前登入的帳號：</p>
            <p className="text-[13px] font-medium text-slate-800 bg-slate-50 px-3 py-2 rounded-lg">{email}</p>
          </div>

          <p className="text-[12px] text-slate-400 text-center leading-relaxed">
            {PROFILE.ui.unauthorizedHint}
          </p>

          <div className="space-y-2 pt-2">
            <button
              onClick={onRetry}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg transition-all text-[13px]"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              切換帳號登入
            </button>
            <button
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-slate-500 hover:bg-slate-50 font-medium rounded-lg transition-all text-[13px]"
            >
              <LogOut className="w-3.5 h-3.5" />
              登出
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
