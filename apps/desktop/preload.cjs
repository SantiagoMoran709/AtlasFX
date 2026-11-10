const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('atlasfxFFmpeg',{
  available:()=>ipcRenderer.invoke('atlasfx:ffmpeg-available'),
  start:(bitrate,fps)=>ipcRenderer.invoke('atlasfx:ffmpeg-start',bitrate,fps),
  write:bytes=>ipcRenderer.invoke('atlasfx:ffmpeg-write',bytes),
  finish:()=>ipcRenderer.invoke('atlasfx:ffmpeg-finish'),
  read:offset=>ipcRenderer.invoke('atlasfx:ffmpeg-read',offset),
  discard:()=>ipcRenderer.invoke('atlasfx:ffmpeg-discard'),
});

contextBridge.exposeInMainWorld('atlasfxWindow',{
  onCloseRequested:save=>{
    const listener=async(_event,id)=>{
      let saved=false;
      try { saved=await save(); } catch { /* Leave the window open. */ }
      ipcRenderer.send('atlasfx:close-result',id,saved===true);
    };
    ipcRenderer.on('atlasfx:close-requested',listener);
    return ()=>ipcRenderer.removeListener('atlasfx:close-requested',listener);
  },
});

contextBridge.exposeInMainWorld('atlasfxSpeech',{
  languages:()=>ipcRenderer.invoke('atlasfx:speech-languages'),
  transcribe:(wav,language)=>ipcRenderer.invoke('atlasfx:speech-transcribe',wav,language),
  cancel:()=>ipcRenderer.invoke('atlasfx:speech-cancel'),
});
