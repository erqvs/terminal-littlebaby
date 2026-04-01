const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('terminlaClawDesktop', {
  channel: 'desktop'
});
