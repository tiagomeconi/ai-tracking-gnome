// Ponte mínima e segura (contextIsolation) entre o renderer e o processo
// principal. CommonJS porque preloads em sandbox não suportam ESM.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aiUsage', {
    getState: () => ipcRenderer.invoke('state:get'),
    onState: (callback) => ipcRenderer.on('state', (_event, viewModel) => callback(viewModel)),
    refresh: () => ipcRenderer.invoke('refresh'),
    openPreferences: () => ipcRenderer.send('open-prefs'),
    hidePopup: () => ipcRenderer.send('hide-popup'),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    reportHeight: (height) => ipcRenderer.send('popup-height', height),
    getSettings: () => ipcRenderer.invoke('settings:get'),
    updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
    getHistory: () => ipcRenderer.invoke('history:get'),
});
