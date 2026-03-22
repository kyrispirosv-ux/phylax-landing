import React from 'react';

export default function NewTabPage() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', background: '#fafafa', gap: 24,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: 'linear-gradient(135deg, var(--accent-gold), #B8962E)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color: 'white', fontSize: 26, fontWeight: 'bold' }}>P</span>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Search or type a URL above</p>
    </div>
  );
}
