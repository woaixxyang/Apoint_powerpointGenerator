
import React, { useState, useEffect, useMemo } from 'react';
import { X, Sparkles } from 'lucide-react';
import { REGION_GROUPS } from '../types';

interface DislikePopoverProps {
  isOpen: boolean;
  availableRegions: string[];
  onClose: () => void;
  onSubmit: (selectedRegions: string[]) => void;
}

const getAvailableGroups = (regions: string[]) =>
  Object.entries(REGION_GROUPS)
    .filter(([, g]) => g.regions.some(r => regions.includes(r)))
    .map(([key, g]) => ({
      key,
      label: g.label,
      matchedRegions: g.regions.filter(r => regions.includes(r)),
    }));

export const DislikePopover: React.FC<DislikePopoverProps> = ({ isOpen, availableRegions, onClose, onSubmit }) => {
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [isWholePageSelected, setIsWholePageSelected] = useState(true);

  const groups = useMemo(() => getAvailableGroups(availableRegions), [availableRegions]);

  useEffect(() => {
    if (isOpen) { setSelectedGroups([]); setIsWholePageSelected(true); }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleGroup = (key: string) => {
    setIsWholePageSelected(false);
    setSelectedGroups(prev => prev.includes(key) ? prev.filter(g => g !== key) : [...prev, key]);
  };

  const handleSubmit = () => {
    let regions: string[] = [];
    if (!isWholePageSelected && selectedGroups.length > 0) {
      regions = selectedGroups.flatMap(k => groups.find(g => g.key === k)?.matchedRegions ?? []);
    }
    onSubmit(regions);
  };

  const chipBase: React.CSSProperties = {
    padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 8,
    border: '1px solid', cursor: 'pointer', transition: 'all 0.1s', display: 'inline-flex', alignItems: 'center', gap: 4,
    background: 'transparent',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        style={{ width: 320, background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 20px 40px rgba(0,0,0,0.15)', padding: 20 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#334155' }}>哪個部分不滿意？</p>
          <button onClick={onClose} style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 4, display: 'flex' }}>
            <X size={16} color="#94a3b8" />
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => { setIsWholePageSelected(true); setSelectedGroups([]); }}
            style={{ ...chipBase, borderColor: isWholePageSelected ? '#fca5a5' : '#f1f5f9', background: isWholePageSelected ? '#fef2f2' : '#f8fafc', color: isWholePageSelected ? '#dc2626' : '#64748b' }}
          >
            <Sparkles size={12} /> 整頁
          </button>
          {groups.map(g => (
            <button
              key={g.key}
              onClick={() => toggleGroup(g.key)}
              style={{ ...chipBase, borderColor: selectedGroups.includes(g.key) ? '#fca5a5' : '#f1f5f9', background: selectedGroups.includes(g.key) ? '#fef2f2' : '#f8fafc', color: selectedGroups.includes(g.key) ? '#dc2626' : '#64748b' }}
            >
              {g.label}
            </button>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          style={{
            width: '100%', padding: '10px 0', fontSize: 12, fontWeight: 700, color: '#fff',
            background: '#ef4444', border: 'none', borderRadius: 8, cursor: 'pointer',
          }}
          onMouseOver={e => (e.currentTarget.style.background = '#dc2626')}
          onMouseOut={e => (e.currentTarget.style.background = '#ef4444')}
        >
          重新生成
        </button>
      </div>
    </div>
  );
};
