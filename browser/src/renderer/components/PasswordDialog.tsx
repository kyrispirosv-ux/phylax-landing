import React from 'react';
export default function PasswordDialog({ action, onVerified, onCancel }: { action: string; onVerified: () => void; onCancel: () => void }) {
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
    <div style={{ background: 'white', borderRadius: 12, padding: 32 }}>
      <p>Password dialog (stub) for: {action}</p>
      <button onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}
