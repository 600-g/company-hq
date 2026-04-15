import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  relaunchApp: () => ipcRenderer.invoke("app-relaunch"),
});
