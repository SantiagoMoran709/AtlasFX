const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('atlasfxSpeech',{
  languages:()=>ipcRenderer.invoke('atlasfx:speech-languages'),
  transcribe:(wav,language)=>ipcRenderer.invoke('atlasfx:speech-transcribe',wav,language),
  cancel:()=>ipcRenderer.invoke('atlasfx:speech-cancel'),
});
