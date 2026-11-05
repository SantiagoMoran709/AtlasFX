import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const desktop=process.argv.includes('--desktop');
if(desktop){
  const desktopApp=path.join(root,'apps/desktop');
  if(!existsSync(path.join(root,'apps/web/dist/index.html'))){console.error('Falta la compilación de AtlasFX. Ejecuta pnpm build.');process.exit(1);}
  let binary;
  try{binary=createRequire(path.join(desktopApp,'package.json'))('electron');}
  catch(error){console.error('No se pudo preparar Electron. Ejecuta pnpm install y comprueba la conexión.',error.message);process.exit(1);}
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(binary,[desktopApp],{cwd:root,detached:true,stdio:'ignore',windowsHide:false,env});child.unref();
}else{
  const url='http://127.0.0.1:5173/';
  let ready=false;try{ready=(await fetch(url)).ok;}catch{}
  if(!ready){
    const vite=path.join(root,'apps/web/node_modules/vite/bin/vite.js');
    if(!existsSync(vite)){console.error('Instala las dependencias con pnpm install.');process.exit(1);}
    const child=spawn(process.execPath,[vite,'--host','127.0.0.1','--port','5173','--strictPort'],{cwd:path.join(root,'apps/web'),detached:true,stdio:'ignore',windowsHide:true});child.unref();
    for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,200));try{if((await fetch(url)).ok){ready=true;break;}}catch{}}
  }
  if(!ready){console.error('No se pudo iniciar el editor en el puerto 5173.');process.exit(1);}
  const child=spawn('cmd.exe',['/c','start','',url],{stdio:'ignore',windowsHide:true});child.unref();console.log(`Editor listo en ${url}`);
}
