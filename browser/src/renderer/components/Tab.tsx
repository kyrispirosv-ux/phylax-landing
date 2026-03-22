import React from 'react';
import type { TabInfo } from '../hooks/useTabs';

interface Props {
  tab: TabInfo;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}

export default function Tab({ tab, isActive, onSelect, onClose }: Props) {
  return (
    <div onClick={onSelect} style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
      borderRadius: '8px 8px 0 0',
      background: isActive ? 'var(--bg-tab-active)' : 'var(--bg-tab-inactive)',
      border: isActive ? '1px solid var(--border-color)' : '1px solid transparent',
      borderBottom: 'none', cursor: 'pointer', fontSize: 12,
      color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
      fontWeight: isActive ? 500 : 400, maxWidth: 200, minWidth: 100,
      WebkitAppRegion: 'no-drag' as any,
    }}>
      {tab.loading && <span style={{ fontSize: 10, color: 'var(--accent-cyan)' }}>●</span>}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {tab.title || 'New Tab'}
      </span>
      <span onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{ color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}>×</span>
    </div>
  );
}
