// Tells the page it is running inside the PC app, and gives it the few things a browser tab cannot do.
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('DYNAMIC_PC', {
  version: '1.0.0',
  toggleFullscreen: () => ipcRenderer.invoke('fullscreen'),
  setAlwaysOnTop: on => ipcRenderer.invoke('top', !!on),
  info: () => ipcRenderer.invoke('info'),
  quit: () => ipcRenderer.invoke('quit')
});
