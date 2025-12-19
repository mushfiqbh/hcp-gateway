const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("configAPI", {
  get: () => ipcRenderer.invoke("config:get"),
  save: (data) => ipcRenderer.invoke("config:save", data)
});


contextBridge.exposeInMainWorld('updateAPI', {
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  onEvent: (cb) => {
    const listener = (_, data) => cb(data);
    ipcRenderer.on('update:event', listener);
    return () => ipcRenderer.removeListener('update:event', listener);
  }
});
 
 contextBridge.exposeInMainWorld("dialogAPI", {
   selectDirectory: (defaultPath = "") =>
     ipcRenderer.invoke("dialog:select-directory", defaultPath),
 });
 contextBridge.exposeInMainWorld("statuscheckAPI", {
   check: () => ipcRenderer.invoke("status:check"),
 });
