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
    // Arraste manual da janela (popup/widget), ver renderer/drag.js.
    dragStart: () => ipcRenderer.send('drag-start'),
    dragMove: (dx, dy) => ipcRenderer.send('drag-move', dx, dy),
    dragEnd: () => ipcRenderer.send('drag-end'),
    widgetMenu: () => ipcRenderer.send('widget-menu'),
    openPopup: () => ipcRenderer.send('open-popup'),
    reportWidgetHeight: (height) => ipcRenderer.send('widget-height', height),
    getHistory: () => ipcRenderer.invoke('history:get'),
});
