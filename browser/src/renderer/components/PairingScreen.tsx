import React, { useState, useCallback } from 'react';

interface Props {
  onPaired: () => void;
}

export default function PairingScreen({ onPaired }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) { setError('Please enter a 6-digit code'); return; }
    setLoading(true);
    setError('');
    const result = await window.electronAPI?.submitPairingCode(code);
    setLoading(false);
    if (result?.success) onPaired();
    else setError(result?.error || 'Pairing failed');
  }, [code, onPaired]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--bg-toolbar)', gap: 24,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: 'linear-gradient(135deg, var(--accent-gold), #B8962E)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color: 'white', fontSize: 28, fontWeight: 'bold' }}>P</span>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-primary)' }}>Welcome to Phylax Browser</h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 400, textAlign: 'center' }}>
        Enter the 6-digit pairing code from the Phylax parent dashboard to connect this browser to your family account.
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 300 }}>
        <input type="text" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000" maxLength={6}
          style={{ padding: '14px 16px', fontSize: 24, textAlign: 'center', letterSpacing: 8,
            border: '2px solid var(--border-color)', borderRadius: 'var(--radius-md)',
            outline: 'none', fontFamily: 'monospace' }} />
        {error && <p style={{ color: '#ef4444', fontSize: 13, textAlign: 'center' }}>{error}</p>}
        <button type="submit" disabled={loading || code.length !== 6}
          style={{ padding: '12px 24px',
            background: code.length === 6 ? 'var(--accent-gold)' : '#ddd',
            color: code.length === 6 ? 'white' : '#999',
            border: 'none', borderRadius: 'var(--radius-md)', fontSize: 15, fontWeight: 600,
            cursor: code.length === 6 ? 'pointer' : 'default' }}>
          {loading ? 'Connecting...' : 'Connect Browser'}
        </button>
      </form>
    </div>
  );
}
