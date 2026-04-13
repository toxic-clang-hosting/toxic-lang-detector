const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openCsvDialog: () => ipcRenderer.invoke('open-csv-dialog'),
  saveCsvDialog: (csv) => ipcRenderer.invoke('save-csv-dialog', csv),
  analyzeMessages: (payload) => ipcRenderer.invoke('analyze-messages', payload),
});
