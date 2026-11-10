import {cinemaHeight,endTime,SECOND,type Project} from '@corte/core';
import {Compositor} from './engine';
import type {MediaResource} from './media';
import type {TitleViewport} from './titleRender';
interface FFmpegBridge {
  available(): Promise<boolean>;
  start(bitrate:number,fps:number): Promise<void>;
  write(bytes:ArrayBuffer): Promise<void>;
  finish(): Promise<number>;
  read(offset:number): Promise<ArrayBuffer>;
  discard(): Promise<void>;
}
declare global { interface Window { atlasfxFFmpeg?:FFmpegBridge } }

export function formats(native=false) {
  if(typeof MediaRecorder==='undefined')return [];
  const supported:{name:string;mime:string;extension:string;native?:boolean}[]=[
    {name:'MP4 · H.264 / AAC',mime:'video/mp4;codecs=avc1.424028,mp4a.40.2',extension:'mp4'},
    {name:'WebM · VP9 / Opus',mime:'video/webm;codecs=vp9,opus',extension:'webm'},
    {name:'WebM · VP8 / Opus',mime:'video/webm;codecs=vp8,opus',extension:'webm'}
  ].filter(f=>MediaRecorder.isTypeSupported(f.mime));
  const capture=supported.find(f=>f.extension==='webm');
  if(native&&capture)supported.push({name:'MP4 · FFmpeg (escritorio)',mime:capture.mime,extension:'mp4',native:true});
  return supported;
}
export type ExportFit = 'contain'|'cover';
export interface ExportFrame {width:number;height:number;fit:ExportFit;ignoreProjectFraming?:boolean}
export const exportFrames=[
  {id:'tiktok',label:'TikTok · Vertical',width:1080,height:1920,fit:'contain'},
  {id:'reels',label:'Instagram · Reels',width:1080,height:1920,fit:'contain'},
  {id:'instagram',label:'Instagram · Publicación vertical',width:1080,height:1350,fit:'contain'},
  {id:'square',label:'Instagram · Publicación cuadrada',width:1080,height:1080,fit:'contain'},
  {id:'youtube',label:'YouTube · Horizontal',width:1920,height:1080,fit:'contain'},
  {id:'cinema',label:'Cine · Panorámico 2.39:1',width:1920,height:804,fit:'cover',ignoreProjectFraming:true},
] as const satisfies ReadonlyArray<ExportFrame & {id:string;label:string}>;

export function fitExportFrame(sourceWidth:number,sourceHeight:number,frame:ExportFrame){
  const scale=(frame.fit==='cover'?Math.max:Math.min)(frame.width/sourceWidth,frame.height/sourceHeight);
  const width=sourceWidth*scale,height=sourceHeight*scale;
  return {x:(frame.width-width)/2,y:(frame.height-height)/2,width,height,scale};
}
export function exportSourceSize(project:Project,resolution:{width:number;height:number},frame?:ExportFrame){
  const {width,height}=project.settings;
  const visible=exportVisibleHeight(project,width,height,frame);
  const scale=frame?Math.min(1,fitExportFrame(width,visible,frame).scale)
    : (width<height?resolution.height:resolution.width)/width;
  return {
    width:Math.max(2,Math.round(width*scale/2)*2),
    height:Math.max(2,Math.round(height*scale/2)*2),
  };
}

function exportVisibleHeight(project:Project,width:number,height:number,frame?:ExportFrame){
  const cinema=project.settings.cinema;
  return cinema?.framing==='crop'&&!frame?.ignoreProjectFraming
    ? cinemaHeight(width,height,cinema.ratio):height;
}

export function getExportLayout(project:Project,source:{width:number;height:number},frame?:ExportFrame){
  const {width,height}=source;
  const cinema=project.settings.cinema;
  const renderProject=frame?.ignoreProjectFraming&&cinema
    ? {...project,settings:{...project.settings,cinema:{...cinema,ratio:0 as const}}}
    : project;
  const visible=exportVisibleHeight(project,width,height,frame);
  const sourceTop=Math.floor((height-visible)/2)/height;
  const sourceHeight=visible/height;
  const destination=frame?fitExportFrame(width,visible,frame):{x:0,y:0,width,height:visible};
  let titleViewport:TitleViewport|undefined;
  if(frame?.fit==='cover'){
    titleViewport={
      x:Math.max(0,-destination.x/destination.width),
      y:sourceTop+sourceHeight*Math.max(0,-destination.y/destination.height),
      width:Math.min(1,frame.width/destination.width),
      height:sourceHeight*Math.min(1,frame.height/destination.height),
    };
  }
  return {renderProject,sourceTop,sourceHeight,width:frame?.width??width,height:frame?.height??visible,destination,titleViewport};
}

export function drawExportFrame(ctx:CanvasRenderingContext2D,source:HTMLCanvasElement,layout:ReturnType<typeof getExportLayout>){
  const {width,height}=ctx.canvas;
  const {x,y,width:frameWidth,height:frameHeight}=layout.destination;
  const scaleX=width/layout.width;
  const scaleY=height/layout.height;
  ctx.fillStyle='#000';
  ctx.fillRect(0,0,width,height);
  ctx.drawImage(source,0,source.height*layout.sourceTop,source.width,source.height*layout.sourceHeight,
    x*scaleX,y*scaleY,frameWidth*scaleX,frameHeight*scaleY);
}

export interface ExportOptions {width:number;height:number;fps:number;bitrate:number;mime:string;frame?:ExportFrame;native?:boolean}
export interface ExportResult {
  blob: Blob;
  renderGaps: number;
  firstRenderGap?: number;
}

function warmUp(signal:AbortSignal) {
  return new Promise<void>((resolve,reject)=>{
    signal.throwIfAborted();
    const abort=()=>{
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer=setTimeout(()=>{
      signal.removeEventListener('abort',abort);
      resolve();
    },700);
    signal.addEventListener('abort',abort,{once:true});
  });
}

export async function exportVideo(project:Project,resources:Record<string,MediaResource>,options:ExportOptions,signal:AbortSignal,onProgress:(progress:number)=>void,onNotice?:(message:string)=>void):Promise<ExportResult>{
  const result=await recordVideo(project,resources,options,signal,
    options.native?value=>onProgress(value*.85):onProgress,onNotice);
  if(!options.native)return result;
  try {
    const blob=await encodeNative(result.blob,options,signal,onProgress);
    return {...result,blob};
  } catch(error) {
    signal.throwIfAborted();
    throw new Error(`Falló la codificación con FFmpeg. ${error instanceof Error?error.message:String(error)}`);
  }
}

async function encodeNative(input:Blob,options:ExportOptions,signal:AbortSignal,onProgress:(progress:number)=>void){
  const bridge=window.atlasfxFFmpeg;
  if(!bridge)throw new Error('FFmpeg requiere la aplicación de escritorio.');
  signal.throwIfAborted();
  const cancel=()=>{void bridge.discard().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try {
    await bridge.start(options.bitrate,options.fps);
    signal.throwIfAborted();
    const chunkSize=1024*1024;
    for(let offset=0;offset<input.size;offset+=chunkSize){
      signal.throwIfAborted();
      await bridge.write(await input.slice(offset,offset+chunkSize).arrayBuffer());
      onProgress(.85+.1*Math.min(1,(offset+chunkSize)/input.size));
    }
    signal.throwIfAborted();
    const size=await bridge.finish();
    if(!size)throw new Error('FFmpeg no produjo un archivo.');
    const parts:ArrayBuffer[]=[];
    for(let offset=0;offset<size;){
      signal.throwIfAborted();
      const part=await bridge.read(offset);
      if(!part.byteLength)throw new Error('La lectura del MP4 quedó incompleta.');
      parts.push(part);
      offset+=part.byteLength;
    }
    signal.throwIfAborted();
    onProgress(1);
    return new Blob(parts,{type:'video/mp4'});
  } finally {
    signal.removeEventListener('abort',cancel);
    await bridge.discard();
  }
}

async function recordVideo(project:Project,resources:Record<string,MediaResource>,options:ExportOptions,signal:AbortSignal,onProgress:(progress:number)=>void,onNotice?:(message:string)=>void):Promise<ExportResult>{
  signal.throwIfAborted();
  const duration=endTime(project);if(!duration)throw new Error('Agrega clips antes de exportar.');
  if(Object.keys(project.assets).some(id=>!project.assets[id].generated&&project.tracks.some(t=>t.clips.some(c=>c.assetId===id))&&!resources[id]))throw new Error('Reubica los medios faltantes antes de exportar.');
  const canvas=document.createElement('canvas');canvas.width=options.width;canvas.height=options.height;
  const layout=getExportLayout(project,options,options.frame);
  const output=options.frame||layout.sourceHeight<1?document.createElement('canvas'):undefined;
  if(output){output.width=layout.width;output.height=layout.height;}
  const outputContext=output?.getContext('2d');
  const render=(at:number,playing:boolean)=>{
    engine.render(layout.renderProject,resources,at,playing,undefined,undefined,layout.titleViewport);
    if(outputContext)drawExportFrame(outputContext,canvas,layout);
  };
  let failure:Error|undefined;
  let stream:MediaStream|undefined;let recorder:MediaRecorder|undefined;let animationFrame=0;
  const engine=new Compositor(canvas,message=>{
    failure??=new Error(message);
    if(recorder?.state==='recording')recorder.stop();
  });
  try{
    const audio=await engine.connectAudio(project);
    if(project.tracks.some(track=>track.clips.some(clip=>clip.title?.font==='Inter'))){
      await document.fonts.load('36px Inter').catch(()=>{});
    }
    const scheduled=await engine.prepareExportAudio(project,resources,signal);if(!scheduled)onNotice?.('Este proyecto usa audio en streaming por su tamaño o códec. Puede presentar cortes: revisa el archivo exportado antes de compartirlo.');stream=(output??canvas).captureStream(options.fps);audio.getAudioTracks().forEach(t=>stream!.addTrack(t));
    recorder=new MediaRecorder(stream,{mimeType:options.mime,videoBitsPerSecond:options.bitrate,audioBitsPerSecond:192000});
    const chunks:Blob[]=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    render(0,false);
    // Warm up browser media decoders before the recorder's clock starts.
    await warmUp(signal);
    render(0,false);
    if(failure)throw failure;
    signal.throwIfAborted();
    return await new Promise<ExportResult>((resolve,reject)=>{
      let previousTime=0;
      let lastProgressTime=0;
      let renderGaps=0;
      let firstRenderGap:number|undefined;
      const abort=()=>{if(recorder!.state!=='inactive')recorder!.stop();};
      signal.addEventListener('abort',abort,{once:true});
      recorder!.onerror=()=>{failure??=new Error('El navegador no pudo codificar el video. Prueba otra resolución o formato.');if(recorder!.state!=='inactive')recorder!.stop();};
      recorder!.onstop=()=>{signal.removeEventListener('abort',abort);cancelAnimationFrame(animationFrame);if(signal.aborted)reject(signal.reason);else if(failure)reject(failure);else if(!chunks.length)reject(new Error('La exportación no generó datos de video.'));else {onProgress(1);resolve({blob:new Blob(chunks,{type:recorder!.mimeType||options.mime}),renderGaps,firstRenderGap});}};
      let start:number;
      try {
        recorder!.start(1000);
        start=engine.startExportAudio(project)??performance.now()/1000;
      } catch(error) {
        signal.removeEventListener('abort',abort);
        reject(error);
        return;
      }
      const tick=()=>{
        if(recorder!.state==='inactive')return;
        const at=Math.min(duration,Math.round(((engine.audioClock()??performance.now()/1000)-start)*SECOND));
        if(at-previousTime>1.5*SECOND/options.fps){
          renderGaps++;
          firstRenderGap??=previousTime/SECOND;
        }
        previousTime=at;
        if(at>=duration){recorder!.stop();return;}
        try {
          render(at,true);
        } catch(error) {
          failure=error instanceof Error?error:new Error(String(error));
          recorder!.stop();
          return;
        }
        if(at-lastProgressTime>=SECOND/10){
          lastProgressTime=at;
          onProgress(at/duration);
        }
        animationFrame=requestAnimationFrame(tick);
      };
      tick();
    });
  }finally{cancelAnimationFrame(animationFrame);if(recorder&&recorder.state!=='inactive')recorder.stop();engine.dispose();stream?.getTracks().forEach(t=>t.stop());}
}
