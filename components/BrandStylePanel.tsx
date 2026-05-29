
import React, { useState, useRef, useEffect } from 'react';
import { Palette, Type, Award, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { BrandStyle, CustomColors } from '../types';

interface BrandStylePanelProps {
  brandStyle: BrandStyle;
  onChange: (style: BrandStyle) => void;
}

const COLOR_FIELDS: { key: keyof CustomColors; label: string }[] = [
  { key: 'primary', label: '主題色' },
  { key: 'accent', label: '點綴色 1' },
  { key: 'background', label: '點綴色 2' },
];

const ZH_FONTS = [
  { value: 'Noto Sans TC', label: 'Noto Sans TC' },
  { value: '微軟正黑體', label: '微軟正黑體' },
  { value: '思源黑體', label: '思源黑體' },
  { value: '思源宋體', label: '思源宋體' },
];

const EN_FONTS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Poppins', label: 'Poppins' },
  { value: 'Roboto', label: 'Roboto' },
];

const FIXED_PRESETS: { name: string; colors: CustomColors }[] = [
  { name: '經典', colors: { primary: '#FF6B00', accent: '#00AEEF', background: '#00C853' } },
  { name: '典雅', colors: { primary: '#1E27A9', accent: '#CB15AA', background: '#A8ABA0' } },
];

const CUSTOM_SLOTS_KEY = 'apoint_custom_color_presets';
const COLLAPSE_KEY = 'apoint_brand_panel_collapsed';

export const DEFAULT_BRAND_STYLE: BrandStyle = {
  colors: { primary: '#FF6B00', accent: '#00AEEF', background: '#00C853' },
  fontFamily: 'Noto Sans TC',
  fontLang: 'zh',
  zhFont: 'Noto Sans TC',
  enFont: 'Montserrat',
};

function loadCustomSlots(): (CustomColors | null)[] {
  try {
    const raw = localStorage.getItem(CUSTOM_SLOTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [null, null];
}

function saveCustomSlots(slots: (CustomColors | null)[]) {
  localStorage.setItem(CUSTOM_SLOTS_KEY, JSON.stringify(slots));
}

const ACCENT = '#d97706'; // amber-600

export const BrandStylePanel: React.FC<BrandStylePanelProps> = ({ brandStyle, onChange }) => {
  const [expanded, setExpanded] = useState<'colors' | 'font' | 'logo' | null>(null);
  const [customSlots, setCustomSlots] = useState<(CustomColors | null)[]>(loadCustomSlots);
  const [collapsed, setCollapsed] = useState(() => {
    const explicit = localStorage.getItem(COLLAPSE_KEY);
    if (explicit !== null) return explicit === '1';
    return !!localStorage.getItem('apoint_brand_style');
  });
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [expanded]);

  const toggle = (section: typeof expanded) => setExpanded(prev => prev === section ? null : section);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
  };

  const handleCopyEmail = async () => {
    await navigator.clipboard.writeText('hello@apoint.app');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const updateColor = (key: keyof CustomColors, value: string) => {
    onChange({ ...brandStyle, colors: { ...brandStyle.colors, [key]: value } });
  };

  const colorsMatch = (a: CustomColors, b: CustomColors) =>
    a.primary === b.primary && a.accent === b.accent && a.background === b.background;

  const sectionBtnStyle = (active: boolean): React.CSSProperties => ({
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '7px 12px', borderRadius: 20, border: `1px solid ${active ? ACCENT : '#e2e8f0'}`,
    background: active ? '#fffbeb' : 'transparent', color: active ? ACCENT : '#64748b',
    cursor: 'pointer', fontSize: 10, fontWeight: 500, transition: 'all 0.15s',
  });

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
    background: '#fff', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    border: '1px solid #e2e8f0', padding: 12, zIndex: 50, minWidth: 256,
  };

  return (
    <div ref={panelRef}>
      {/* 標頭：點擊收合 */}
      <button
        onClick={toggleCollapse}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
          fontSize: 10, fontWeight: 600, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.12em',
          border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
        }}
      >
        <Palette size={14} />
        品牌風格
        {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        {collapsed && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4, textTransform: 'none', letterSpacing: 'normal', fontSize: 9, color: '#94a3b8', fontWeight: 400 }}>
            {COLOR_FIELDS.map(({ key }) => (
              <span key={key} style={{ width: 8, height: 8, borderRadius: '50%', background: brandStyle.colors[key], boxShadow: '0 0 0 1px rgba(255,255,255,0.8), 0 1px 2px rgba(0,0,0,0.1)' }} />
            ))}
            <span style={{ marginLeft: 2 }}>{brandStyle.zhFont} · {brandStyle.enFont}</span>
          </span>
        )}
      </button>

      {!collapsed && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 10 }}>
          {/* 色彩 */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => toggle('colors')} style={sectionBtnStyle(expanded === 'colors')}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                {COLOR_FIELDS.map(({ key }) => (
                  <span key={key} style={{ width: 10, height: 10, borderRadius: '50%', background: brandStyle.colors[key], boxShadow: '0 0 0 1px rgba(255,255,255,0.8)' }} />
                ))}
              </span>
              色彩
            </button>
            {expanded === 'colors' && (
              <div style={dropdownStyle}>
                <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 600, color: '#64748b' }}>簡報色彩風格</p>

                {/* 預設 + 自訂配色 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
                  {FIXED_PRESETS.map(preset => {
                    const active = colorsMatch(preset.colors, brandStyle.colors);
                    return (
                      <button
                        key={preset.name}
                        onClick={() => onChange({ ...brandStyle, colors: { ...preset.colors } })}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 8, border: `1px solid ${active ? ACCENT : 'transparent'}`, background: active ? '#fffbeb' : 'transparent', cursor: 'pointer' }}
                      >
                        <span style={{ display: 'flex', gap: 2 }}>
                          {COLOR_FIELDS.map(({ key }) => (
                            <span key={key} style={{ width: 12, height: 12, borderRadius: '50%', background: preset.colors[key], boxShadow: '0 0 0 1px rgba(255,255,255,0.8)' }} />
                          ))}
                        </span>
                        <span style={{ fontSize: 8, color: '#94a3b8' }}>{preset.name}</span>
                      </button>
                    );
                  })}
                  {customSlots.map((slot, i) => {
                    if (slot) {
                      const active = colorsMatch(slot, brandStyle.colors);
                      return (
                        <button
                          key={`custom-${i}`}
                          onClick={() => onChange({ ...brandStyle, colors: { ...slot } })}
                          onContextMenu={e => {
                            e.preventDefault();
                            const next = [...customSlots]; next[i] = null;
                            setCustomSlots(next); saveCustomSlots(next);
                          }}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 8, border: `1px solid ${active ? ACCENT : 'transparent'}`, background: active ? '#fffbeb' : 'transparent', cursor: 'pointer' }}
                          title={`自訂 ${i + 1}（右鍵刪除）`}
                        >
                          <span style={{ display: 'flex', gap: 2 }}>
                            {COLOR_FIELDS.map(({ key }) => (
                              <span key={key} style={{ width: 12, height: 12, borderRadius: '50%', background: slot[key], boxShadow: '0 0 0 1px rgba(255,255,255,0.8)' }} />
                            ))}
                          </span>
                          <span style={{ fontSize: 8, color: '#94a3b8' }}>自訂{i + 1}</span>
                        </button>
                      );
                    }
                    return (
                      <button
                        key={`custom-${i}`}
                        onClick={() => {
                          const next = [...customSlots]; next[i] = { ...brandStyle.colors };
                          setCustomSlots(next); saveCustomSlots(next);
                        }}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 8, border: '1px dashed #e2e8f0', cursor: 'pointer', background: 'transparent' }}
                        title="儲存目前色彩為自訂方案"
                      >
                        <span style={{ width: 38, height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 10 }}>+</span>
                        <span style={{ fontSize: 8, color: '#cbd5e1' }}>儲存</span>
                      </button>
                    );
                  })}
                </div>

                {/* 自訂色彩 */}
                {COLOR_FIELDS.map(({ key, label }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', cursor: 'pointer' }}>
                    <span style={{ fontSize: 11, color: '#475569' }}>{label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 9, color: '#cbd5e1', fontFamily: 'monospace', textTransform: 'uppercase' }}>{brandStyle.colors[key]}</span>
                      <input
                        type="color"
                        value={brandStyle.colors[key]}
                        onChange={e => updateColor(key, e.target.value)}
                        style={{ width: 20, height: 20, border: 'none', padding: 0, cursor: 'pointer', background: 'transparent', borderRadius: 4 }}
                      />
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 字型 */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => toggle('font')} style={sectionBtnStyle(expanded === 'font')}>
              <Type size={12} /> 字型
            </button>
            {expanded === 'font' && (
              <div style={{ ...dropdownStyle, minWidth: 288 }}>
                <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 600, color: '#64748b' }}>文字風格</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { title: '中文', fonts: ZH_FONTS, currentKey: 'zhFont' as const },
                    { title: 'English', fonts: EN_FONTS, currentKey: 'enFont' as const },
                  ].map(({ title, fonts, currentKey }) => (
                    <div key={title}>
                      <p style={{ margin: '0 0 6px', fontSize: 9, color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {fonts.map(({ value, label }) => {
                          const active = (brandStyle[currentKey] || (currentKey === 'enFont' ? 'Montserrat' : 'Noto Sans TC')) === value;
                          return (
                            <button
                              key={value}
                              onClick={() => onChange({ ...brandStyle, [currentKey]: value, ...(currentKey === 'zhFont' ? { fontFamily: value, fontLang: 'zh' as const } : {}) })}
                              style={{ textAlign: 'left', padding: '6px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: value, background: active ? '#fffbeb' : 'transparent', color: active ? ACCENT : '#475569', fontWeight: active ? 600 : 400 }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 企業標識 */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => toggle('logo')} style={sectionBtnStyle(expanded === 'logo')}>
              <Award size={12} /> 標識
            </button>
            {expanded === 'logo' && (
              <div style={{ ...dropdownStyle, left: 'auto', right: 0, minWidth: 256 }}>
                <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#334155' }}>企業品牌客製化</p>
                <p style={{ margin: '0 0 12px', fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
                  自訂企業 Logo、品牌色彩、專屬字型與簡報模板，歡迎來信洽詢。
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', borderRadius: 8, padding: '8px 12px' }}>
                  <span style={{ fontSize: 11, color: '#475569', fontWeight: 500, flex: 1, userSelect: 'all' }}>hello@apoint.app</span>
                  <button
                    onClick={handleCopyEmail}
                    style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', color: copied ? '#10b981' : '#94a3b8' }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
