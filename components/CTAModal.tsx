
import React, { useState } from 'react';
import { Mail, Copy, Check, X, Zap, Crown } from 'lucide-react';

interface CTAModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CONTACT_EMAIL = 'hello@apoint.app';

export const CTAModal: React.FC<CTAModalProps> = ({ isOpen, onClose }) => {
  const [showContact, setShowContact] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(CONTACT_EMAIL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        width: '100%', maxWidth: 360, position: 'relative', overflow: 'hidden',
      }}>
        {/* 關閉按鈕 */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 10,
            padding: 6, borderRadius: '50%', border: 'none', background: 'transparent',
            cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center',
          }}
          onMouseOver={e => (e.currentTarget.style.background = '#f1f5f9')}
          onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
        >
          <X size={16} />
        </button>

        <div style={{ padding: '32px 32px 28px', textAlign: 'center' }}>
          {/* 圖示 */}
          <div style={{
            width: 48, height: 48, borderRadius: '50%', background: '#fffbeb',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <Zap size={24} color="#f59e0b" />
          </div>

          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
            免費額度已用完
          </h2>
          <p style={{ margin: '0 0 24px', fontSize: 13, color: '#94a3b8' }}>
            已使用 30 頁終身免費額度
          </p>

          {/* 升級方案卡片 */}
          <div style={{
            background: 'rgba(255, 251, 235, 0.8)', border: '1px solid #fde68a',
            borderRadius: 12, padding: 20, textAlign: 'left', marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Crown size={16} color="#f59e0b" />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#78350f' }}>升級方案</span>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { title: '不限量生成額度', desc: '無頁數上限，隨時生成專業簡報' },
                { title: '客製品牌標識', desc: '專屬 Logo、配色、字型與簡報模板' },
              ].map(item => (
                <li key={item.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: '50%', background: 'rgba(253,230,138,0.6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', display: 'block' }} />
                  </span>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: '#334155' }}>{item.title}</p>
                    <p style={{ margin: 0, fontSize: 10, color: '#94a3b8' }}>{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* 聯絡按鈕 */}
          <button
            onClick={() => setShowContact(!showContact)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 20px', border: 'none', borderRadius: 12, cursor: 'pointer',
              background: 'linear-gradient(to right, #f59e0b, #ea580c)',
              color: '#fff', fontWeight: 500, fontSize: 13,
              transition: 'opacity 0.15s',
            }}
            onMouseOver={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseOut={e => (e.currentTarget.style.opacity = '1')}
          >
            <Mail size={16} />
            聯絡我們
          </button>

          {showContact && (
            <div style={{
              marginTop: 12, padding: '10px 16px', background: '#f8fafc', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 12, color: '#475569', fontWeight: 500, userSelect: 'all' }}>
                {CONTACT_EMAIL}
              </span>
              <button
                onClick={handleCopy}
                style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', color: copied ? '#10b981' : '#94a3b8' }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          )}

          <p style={{ marginTop: 16, fontSize: 10, color: '#cbd5e1' }}>
            關閉此視窗仍可查看和匯出已生成的簡報
          </p>
        </div>
      </div>
    </div>
  );
};
