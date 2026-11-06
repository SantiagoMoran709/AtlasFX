const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('atlasfxSpeech', {
  transcribe: (audio, language) => ipcRenderer.invoke('atlasfx:transcribe', audio, language),
});
