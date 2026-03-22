import { useState, useCallback, useEffect } from 'react';

export interface TabInfo {
  id: string;
  title: string;
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
}

export function useTabs() {
  const [tabs, setTabs] = useState<TabInfo[]>([
    { id: 'tab-1', title: 'New Tab', url: '', canGoBack: false, canGoForward: false, loading: false },
  ]);
  const [activeTabId, setActiveTab] = useState('tab-1');

  const addTab = useCallback(() => {
    const id = `tab-${Date.now()}`;
    setTabs(prev => [...prev, { id, title: 'New Tab', url: '', canGoBack: false, canGoForward: false, loading: false }]);
    setActiveTab(id);
    window.electronAPI?.createTab(id);
  }, []);

  const closeTab = useCallback((id: string) => {
    window.electronAPI?.closeTab(id);
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) {
        const newId = `tab-${Date.now()}`;
        window.electronAPI?.createTab(newId);
        setActiveTab(newId);
        return [{ id: newId, title: 'New Tab', url: '', canGoBack: false, canGoForward: false, loading: false }];
      }
      if (id === activeTabId) setActiveTab(next[next.length - 1].id);
      return next;
    });
  }, [activeTabId]);

  const updateTab = useCallback((id: string, updates: Partial<TabInfo>) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  useEffect(() => {
    const handler = (tabId: string, updates: Partial<TabInfo>) => {
      updateTab(tabId, updates);
    };
    window.electronAPI?.onTabUpdate(handler);
    return () => window.electronAPI?.offTabUpdate();
  }, [updateTab]);

  useEffect(() => {
    window.electronAPI?.onTabCreated?.((tabId: string, url: string) => {
      setTabs(prev => [...prev, { id: tabId, title: 'Loading...', url, isLoading: true, canGoBack: false, canGoForward: false, loading: true }]);
      setActiveTab(tabId);
    });
  }, []);

  return { tabs, activeTabId, addTab, closeTab, setActiveTab, updateTab };
}
