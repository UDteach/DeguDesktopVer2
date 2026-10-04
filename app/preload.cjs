const { contextBridge, ipcRenderer } = require('electron');
const subscribe = channel => callback => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
const role = new URL(location.href).pathname.endsWith('/settings.html') ? 'settings' : 'overlay';
contextBridge.exposeInMainWorld('degu', role === 'settings' ? {
  getState: () => ipcRenderer.invoke('degu:get-state'),
  update: patch => ipcRenderer.invoke('degu:update', patch),
  reset: () => ipcRenderer.invoke('degu:reset'),
  onState: subscribe('degu:state'),
  onError: subscribe('degu:error')
} : {
  ready: () => ipcRenderer.send('degu:ready'),
  loaded: revision => ipcRenderer.send('degu:loaded', revision),
  failed: message => ipcRenderer.send('degu:failed', String(message).slice(0, 250)),
  onState: subscribe('degu:overlay-state'),
  onCursor: subscribe('degu:cursor')
});
