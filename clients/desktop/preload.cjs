const{contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('kingdomsDesktop',Object.freeze({platform:'windows-electron',toggleFullscreen:()=>ipcRenderer.invoke('kingdoms:display','toggle'),exitFullscreen:()=>ipcRenderer.invoke('kingdoms:display','exit'),getDisplay:()=>ipcRenderer.invoke('kingdoms:display','read')}));
