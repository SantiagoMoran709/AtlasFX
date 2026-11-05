import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const desktop=process.argv.includes('--desktop');
if(desktop){
  const binary=path.join(root,'apps/desktop/node_modules/electron/dist/electron.exe');
  if(!existsSync(binary)||!existsSync(path.join(root,'apps/web/dist/index.html'))){console.error('Ejecuta pnpm install, node apps/desktop/node_modules/electron/install.js y pnpm build primero.');process.exit(1);}
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(binary,[path.join(root,'apps/desktop')],{cwd:root,detached:true,stdio:'ignore',windowsHide:false,env});child.unref();
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
