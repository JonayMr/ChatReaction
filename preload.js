const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFile: (type) => ipcRenderer.invoke('open-file', type),
  saveReaction: (data) => ipcRenderer.invoke('save-reaction', data)
});

contextBridge.exposeInMainWorld('overlay', {
  getPath: () => ipcRenderer.invoke('get-overlay-path'),
  getConfigPath: () => ipcRenderer.invoke('get-overlay-config-path')
});

contextBridge.exposeInMainWorld('store', {
  listReactions: () => ipcRenderer.invoke('list-reactions'),
  clearReactions: () => ipcRenderer.invoke('clear-reactions'),
  deleteReaction: (id) => ipcRenderer.invoke('delete-reaction', id)
});

contextBridge.exposeInMainWorld('twitch', {
  saveSettings: (opts) => ipcRenderer.invoke('save-twitch-settings', opts),
  getSettings: () => ipcRenderer.invoke('get-twitch-settings')
});

contextBridge.exposeInMainWorld('settings', {
  setVolume: (v) => ipcRenderer.invoke('set-volume', v)
});

contextBridge.exposeInMainWorld('links', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
