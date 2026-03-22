import React from 'react';

interface Props {
  visible: boolean;
  status: 'safe' | 'blocked' | 'monitoring';
  onClose: () => void;
  onRequestAccess: () => void;
}

export default function ShieldMenu({ visible, status, onClose, onRequestAccess }: Props) {
  if (!visible) return null;

  const statusColors = {
    safe: { bg: '#E8FAF0', text: '#16a34a', label: 'Safe' },
    blocked: { bg: '#FEE2E2', text: '#dc2626', label: 'Blocked' },
    monitoring: { bg: '#FEF3C7', text: '#d97706', label: 'Monitoring' },
  };

  const s = statusColors[status];

  return (
    <div style={{
      position: 'absolute', top: 48, right: 12, background: 'white', borderRadius: 12,
      boxShadow: '0 4px 24px rgba(0,0,0,0.12)', padding: 16, width: 240, zIndex: 1000,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Phylax Protection</span>
        <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>x</span>
      </div>
      <div style={{
        padding: '8px 12px', background: s.bg, borderRadius: 'var(--radius-sm)',
        color: s.text, fontSize: 13, fontWeight: 600, textAlign: 'center',
      }}>{s.label}</div>
      {status === 'blocked' && (
        <button onClick={onRequestAccess} style={{
          marginTop: 12, width: '100%', padding: '8px',
          border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
          background: 'white', cursor: 'pointer', fontSize: 12,
        }}>Request Access</button>
      )}
    </div>
  );
}
