/**
 * Preload script for Desktop Agent App Dashboard UI.
 * Exposes secure IPC methods to the frontend renderer.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { ExtractedLeadData, DesktopAgentStats, DesktopAgentSettings } from '../shared/types';

contextBridge.exposeInMainWorld('desktopAgent', {
  // Listeners
  onNewLead: (callback: (lead: ExtractedLeadData) => void) => {
    const subscription = (_event: any, lead: ExtractedLeadData) => callback(lead);
    ipcRenderer.on('lead:new', subscription);
    return () => ipcRenderer.removeListener('lead:new', subscription);
  },

  onStatsUpdate: (callback: (stats: DesktopAgentStats) => void) => {
    const subscription = (_event: any, stats: DesktopAgentStats) => callback(stats);
    ipcRenderer.on('stats:update', subscription);
    return () => ipcRenderer.removeListener('stats:update', subscription);
  },

  onLogMessage: (callback: (log: { level: string; message: string; timestamp: string }) => void) => {
    const subscription = (_event: any, log: { level: string; message: string; timestamp: string }) =>
      callback(log);
    ipcRenderer.on('log:message', subscription);
    return () => ipcRenderer.removeListener('log:message', subscription);
  },

  // Actions
  switchTab: (tab: 'dashboard' | 'facebook' | 'zalo' | 'settings') => {
    ipcRenderer.send('tab:switch', tab);
  },

  getStats: (): Promise<DesktopAgentStats> => {
    return ipcRenderer.invoke('stats:get');
  },

  getSettings: (): Promise<DesktopAgentSettings> => {
    return ipcRenderer.invoke('settings:get');
  },

  saveSettings: (settings: Partial<DesktopAgentSettings>): Promise<DesktopAgentSettings> => {
    return ipcRenderer.invoke('settings:save', settings);
  },

  syncLeadManual: (leadId: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('lead:sync-manual', leadId);
  },

  triggerFbScroll: () => {
    ipcRenderer.send('fb:trigger-scroll');
  },

  reloadTab: (tab: 'facebook' | 'zalo') => {
    ipcRenderer.send('tab:reload', tab);
  },

  launchChromeProfile: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('chrome:launch-profile');
  },

  triggerChromeScroll: () => {
    ipcRenderer.send('chrome:trigger-scroll');
  },

  // Sources Rotation
  onSourcesUpdate: (callback: (sources: any[]) => void) => {
    const subscription = (_event: any, sources: any[]) => callback(sources);
    ipcRenderer.on('sources:list', subscription);
    return () => ipcRenderer.removeListener('sources:list', subscription);
  },

  getSources: (): Promise<any[]> => {
    return ipcRenderer.invoke('sources:get');
  },

  refreshSources: (): Promise<any[]> => {
    return ipcRenderer.invoke('sources:refresh');
  },

  selectSource: (index: number) => {
    ipcRenderer.send('sources:select', index);
  },

  nextSource: () => {
    ipcRenderer.send('sources:next');
  },

  prevSource: () => {
    ipcRenderer.send('sources:prev');
  },

  toggleAutoRotate: (enabled: boolean) => {
    ipcRenderer.send('sources:toggle-rotate', enabled);
  },
});
