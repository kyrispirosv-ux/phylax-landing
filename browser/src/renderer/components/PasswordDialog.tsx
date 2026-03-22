import React, { useState, useCallback } from 'react';

interface Props {
  action: string;
  onVerified: () => void;
  onCancel: () => void;
}

export default function PasswordDialog({ action, onVerified, onCancel }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await window.electronAPI?.submitParentPassword(password);
    if (ok) onVerified();
    else { setError('Incorrect password'); setPassword(''); }
  }, [password, onVerified]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 32, maxWidth: 380, width: '100%' }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Parent Password Required</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Enter the parent password to {action}.
        </p>
        <form onSubmit={handleSubmit}>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" autoFocus
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)', fontSize: 14, marginBottom: 8 }} />
          {error && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onCancel} style={{
              padding: '8px 16px', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)', background: 'white', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" style={{
              padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-gold)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>Confirm</button>
          </div>
        </form>
      </div>
    </div>
  );
}
