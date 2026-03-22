import React from 'react';

interface Props {
  url: string;
  reason: string;
  onRequestAccess: () => void;
}

export default function BlockedPage({ url, reason, onRequestAccess }: Props) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', background: '#fafafa', gap: 16, padding: 40,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: 'linear-gradient(135deg, var(--accent-gold), #B8962E)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color: 'white', fontSize: 22, fontWeight: 'bold' }}>P</span>
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' }}>This page is blocked</h2>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 400 }}>
        {reason || 'This content has been blocked by your family safety settings.'}
      </p>
      <button onClick={onRequestAccess} style={{
        marginTop: 8, padding: '10px 20px', border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)', background: 'white', cursor: 'pointer',
        fontSize: 13, color: 'var(--text-secondary)',
      }}>Request Access</button>
    </div>
  );
}
