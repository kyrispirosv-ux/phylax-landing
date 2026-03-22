import React, { useState, useEffect, useCallback } from 'react';
import TabBar from './components/TabBar';
import Toolbar from './components/Toolbar';
import ShieldMenu from './components/ShieldMenu';
import PairingScreen from './components/PairingScreen';
import PasswordDialog from './components/PasswordDialog';
import { useTabs } from './hooks/useTabs';

interface LockdownConfig {
  showAddressBar: boolean;
  allowDownloads: boolean;
  allowClose: boolean;
  requirePasswordToClose: boolean;
}

export default function App() {
  const { tabs, activeTabId, addTab, closeTab, setActiveTab } = useTabs();
  const activeTab = tabs.find(t => t.id === activeTabId);

  const [paired, setPaired] = useState<boolean | null>(null);
  const [shieldOpen, setShieldOpen] = useState(false);
  const [shieldStatus, setShieldStatus] = useState<'safe' | 'blocked' | 'monitoring'>('safe');
  const [lockdownConfig, setLockdownConfig] = useState<LockdownConfig | null>(null);
  const [passwordAction, setPasswordAction] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI?.sendToSafety('check-paired', {}).then((result: any) => {
      setPaired(result?.paired ?? false);
    });
  }, []);

  useEffect(() => {
    const handler = () => setPaired(false);
    window.electronAPI?.onShowPairing?.(handler);
  }, []);

  useEffect(() => {
    const handler = (config: LockdownConfig) => setLockdownConfig(config);
    window.electronAPI?.onLockdownConfig?.(handler);
  }, []);

  useEffect(() => {
    const handler = (action: string) => setPasswordAction(action);
    window.electronAPI?.onRequestPassword?.(handler);
  }, []);

  useEffect(() => {
    const handler = (status: 'safe' | 'blocked' | 'monitoring') => setShieldStatus(status);
    window.electronAPI?.onShieldStatus?.(handler);
  }, []);

  const handlePaired = useCallback(() => setPaired(true), []);

  if (paired === null) return <div style={{ height: '100vh', background: 'var(--bg-toolbar)' }} />;
  if (paired === false) return <PairingScreen onPaired={handlePaired} />;

  const showAddressBar = lockdownConfig?.showAddressBar !== false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', position: 'relative' }}>
      <TabBar tabs={tabs} activeTabId={activeTabId} onSelect={setActiveTab} onClose={closeTab} onNewTab={addTab} />
      <Toolbar
        url={activeTab?.url || ''} title={activeTab?.title || ''}
        canGoBack={activeTab?.canGoBack || false} canGoForward={activeTab?.canGoForward || false}
        showAddressBar={showAddressBar}
        onNavigate={(url) => window.electronAPI?.navigate(activeTabId, url)}
        onBack={() => window.electronAPI?.goBack(activeTabId)}
        onForward={() => window.electronAPI?.goForward(activeTabId)}
        onReload={() => window.electronAPI?.reload(activeTabId)}
        onShieldClick={() => setShieldOpen(!shieldOpen)}
      />
      <ShieldMenu visible={shieldOpen} status={shieldStatus} onClose={() => setShieldOpen(false)} onRequestAccess={() => {}} />
      {passwordAction && (
        <PasswordDialog action={passwordAction}
          onVerified={() => { setPasswordAction(null); if (passwordAction === 'close') window.electronAPI?.sendToSafety('confirmed-close', {}); }}
          onCancel={() => setPasswordAction(null)} />
      )}
      <div style={{ flex: 1, background: 'var(--bg-content)' }} />
    </div>
  );
}
