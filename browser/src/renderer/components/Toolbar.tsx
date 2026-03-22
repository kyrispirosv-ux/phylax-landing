import React, { useState, useCallback, useRef } from 'react';

interface Props {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  showAddressBar: boolean;
  onNavigate: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onShieldClick: () => void;
}

export default function Toolbar({ url, title, canGoBack, canGoForward, showAddressBar, onNavigate, onBack, onForward, onReload, onShieldClick }: Props) {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout>>();

  const displayUrl = focused ? input : url;

  const handleFocus = useCallback(() => { setInput(url); setFocused(true); }, [url]);

  const handleBlur = useCallback(() => {
    blurTimeout.current = setTimeout(() => setFocused(false), 150);
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    clearTimeout(blurTimeout.current);
    let nav = input.trim();
    if (!nav) return;
    if (!/^https?:\/\//i.test(nav)) {
      if (nav.includes('.') && !nav.includes(' ')) nav = 'https://' + nav;
      else nav = `https://www.google.com/search?q=${encodeURIComponent(nav)}`;
    }
    onNavigate(nav);
    setFocused(false);
  }, [input, onNavigate]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
      background: 'var(--bg-tab-active)', borderBottom: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <NavButton onClick={onBack} disabled={!canGoBack}>←</NavButton>
        <NavButton onClick={onForward} disabled={!canGoForward}>→</NavButton>
        <NavButton onClick={onReload}>↻</NavButton>
      </div>
      {showAddressBar && (
        <form onSubmit={handleSubmit} style={{ flex: 1 }}>
          <input type="text" value={displayUrl} onChange={e => setInput(e.target.value)}
            onFocus={handleFocus} onBlur={handleBlur} placeholder="Search or type a URL..."
            style={{ width: '100%', background: 'var(--bg-toolbar)',
              border: focused ? '2px solid var(--accent-cyan)' : '1px solid transparent',
              borderRadius: 'var(--radius-md)', padding: '7px 12px', fontSize: 13,
              color: 'var(--text-secondary)', outline: 'none' }} />
        </form>
      )}
      {!showAddressBar && (
        <div style={{ flex: 1, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
          {title || 'Phylax Browser'}
        </div>
      )}
      <div onClick={onShieldClick} style={{
        width: 28, height: 28, borderRadius: 'var(--radius-sm)',
        background: 'linear-gradient(135deg, var(--accent-gold), #B8962E)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', flexShrink: 0,
      }}>
        <span style={{ color: 'white', fontSize: 13, fontWeight: 'bold' }}>P</span>
      </div>
    </div>
  );
}

function NavButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer',
      color: disabled ? '#ddd' : 'var(--text-muted)', fontSize: 16, padding: '2px 4px', lineHeight: 1,
    }}>{children}</button>
  );
}
