import React from 'react';
import Tab from './Tab';
import type { TabInfo } from '../hooks/useTabs';

interface Props {
  tabs: TabInfo[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: () => void;
}

export default function TabBar({ tabs, activeTabId, onSelect, onClose, onNewTab }: Props) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 2, padding: '8px 10px 0',
      background: 'var(--bg-toolbar)', WebkitAppRegion: 'drag' as any,
    }}>
      {window.electronAPI?.platform === 'darwin' && <div style={{ width: 70 }} />}
      {tabs.map(tab => (
        <Tab key={tab.id} tab={tab} isActive={tab.id === activeTabId}
          onSelect={() => onSelect(tab.id)} onClose={() => onClose(tab.id)} />
      ))}
      <button onClick={onNewTab} style={{
        background: 'none', border: 'none', padding: '4px 10px', cursor: 'pointer',
        color: 'var(--text-muted)', fontSize: 16, WebkitAppRegion: 'no-drag' as any,
      }}>+</button>
    </div>
  );
}
