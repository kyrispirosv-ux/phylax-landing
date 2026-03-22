import React from 'react';
export default function ShieldMenu({ visible, status, onClose, onRequestAccess }: { visible: boolean; status: string; onClose: () => void; onRequestAccess: () => void }) {
  if (!visible) return null;
  return <div style={{ position: 'absolute', top: 48, right: 12, background: 'white', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.12)', padding: 16, width: 240, zIndex: 1000 }}>
    <p>Shield menu (stub) - {status}</p>
  </div>;
}
