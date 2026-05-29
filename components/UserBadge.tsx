
import React from 'react';
import { LogOut, Shield } from 'lucide-react';
import { SAUser } from '../services/authService';

interface UserBadgeProps {
  user: SAUser;
  onLogout: () => void;
}

export const UserBadge: React.FC<UserBadgeProps> = ({ user, onLogout }) => {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50/80 rounded-lg">
      {user.picture ? (
        <img
          src={user.picture}
          alt={user.name}
          className="w-8 h-8 rounded-full"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-medium text-xs">
          {user.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-slate-700 truncate">{user.name}</p>
        <p className="text-[10px] text-indigo-500 font-medium flex items-center gap-1">
          <Shield className="w-2.5 h-2.5" />
          Enterprise
        </p>
      </div>
      <button
        onClick={onLogout}
        className="p-1.5 text-slate-300 hover:text-red-400 rounded-md transition-colors"
        title="登出"
      >
        <LogOut className="w-3 h-3" />
      </button>
    </div>
  );
};
