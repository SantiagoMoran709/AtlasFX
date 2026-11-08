const {spawn}=require('node:child_process');
const {readFileSync}=require('node:fs');
const path=require('node:path');

const sampleRate=16000;
const maxWavBytes=44+sampleRate*2*60;

function installSpeech(ipcMain,isEditor){
  const script=readFileSync(path.join(__dirname,'speech.ps1'),'utf8');
  let active;

  function run(mode,language='',wav){
    if(process.platform!=='win32')throw new Error('El reconocimiento de voz local requiere Windows.');
    if(active)throw new Error('Hay otra operación de reconocimiento en curso.');
    const executable=path.join(process.env.SystemRoot??'C:/Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    return new Promise((resolve,reject)=>{
      const child=spawn(executable,['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{
        windowsHide:true,
        stdio:['pipe','pipe','ignore'],
        env:{...process.env,ATLASFX_SPEECH_MODE:mode,ATLASFX_SPEECH_LANGUAGE:language},
      });
      active={child,mode};
      const timeout=setTimeout(()=>{
        child.kill();
        reject(new Error('El reconocimiento de voz tardó demasiado.'));
      },mode==='languages'?30000:120000);
      let result='';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data',chunk=>{
        result+=chunk;
        if(result.length>1024*1024){
          child.kill();
          reject(new Error('La respuesta del reconocedor es demasiado grande.'));
        }
      });
      child.stdin.on('error',()=>{}); // A recognizer can reject the language before reading stdin.
      child.once('error',()=>reject(new Error('No se pudo abrir el reconocimiento de voz de Windows.')));
      child.once('close',code=>{
        clearTimeout(timeout);
        if(active?.child===child)active=undefined;
        if(code!==0){
          reject(new Error('El reconocimiento de voz se interrumpió.'));
          return;
        }
        try{
          const response=JSON.parse(result);
          if(response.error)reject(new Error(response.error));
          else resolve(response);
        }catch{
          reject(new Error('Windows devolvió una transcripción no válida.'));
        }
      });
      child.stdin.end(wav);
    });
  }

  function authorize(event){
    if(!isEditor(event))throw new Error('Origen de transcripción no autorizado.');
  }

  ipcMain.handle('atlasfx:speech-languages',async event=>{
    authorize(event);
    return (await run('languages')).languages;
  });
  ipcMain.handle('atlasfx:speech-transcribe',async(event,wav,language)=>{
    authorize(event);
    if(!(wav instanceof Uint8Array)||wav.byteLength<=44||wav.byteLength>maxWavBytes||
        typeof language!=='string'||! /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/i.test(language)){
      throw new Error('Audio o idioma no válido.');
    }
    const input=Buffer.from(wav);
    if(input.toString('ascii',0,4)!=='RIFF'||input.toString('ascii',8,12)!=='WAVE'){
      throw new Error('Formato de audio no válido.');
    }
    return (await run('transcribe',language,input)).cues;
  });
  ipcMain.handle('atlasfx:speech-cancel',event=>{
    authorize(event);
    if(active?.mode==='transcribe')active.child.kill();
  });
  return ()=>active?.child.kill();
}

module.exports={installSpeech};
