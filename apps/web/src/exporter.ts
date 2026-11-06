import {endTime,SECOND,type Project} from '@corte/core';
import {Compositor} from './engine';
import type {MediaResource} from './media';
export const formats=()=>typeof MediaRecorder==='undefined'?[]:[
  {name:'MP4 · H.264 / AAC',mime:'video/mp4;codecs=avc1.424028,mp4a.40.2',extension:'mp4'},
  {name:'WebM · VP9 / Opus',mime:'video/webm;codecs=vp9,opus',extension:'webm'},
  {name:'WebM · VP8 / Opus',mime:'video/webm;codecs=vp8,opus',extension:'webm'}
].filter(f=>MediaRecorder.isTypeSupported(f.mime));
export interface ExportOptions {width:number;height:number;fps:number;bitrate:number;mime:string}
export interface ExportResult {
  blob: Blob;
  renderGaps: number;
  firstRenderGap?: number;
}
export async function exportVideo(project:Project,resources:Record<string,MediaResource>,options:ExportOptions,signal:AbortSignal,onProgress:(progress:number)=>void,onNotice?:(message:string)=>void):Promise<ExportResult>{
  const duration=endTime(project);if(!duration)throw new Error('Agrega clips antes de exportar.');
  if(Object.keys(project.assets).some(id=>!project.assets[id].generated&&project.tracks.some(t=>t.clips.some(c=>c.assetId===id))&&!resources[id]))throw new Error('Reubica los medios faltantes antes de exportar.');
  const canvas=document.createElement('canvas');canvas.width=options.width;canvas.height=options.height;
  const engine=new Compositor(canvas);let stream:MediaStream|undefined;let recorder:MediaRecorder|undefined;let frame=0;
  try{
    const audio=await engine.connectAudio();const scheduled=await engine.prepareExportAudio(project,resources,signal);if(!scheduled)onNotice?.('Este proyecto usa audio en streaming por su tamaño o códec. Puede presentar cortes: revisa el archivo exportado antes de compartirlo.');stream=canvas.captureStream(options.fps);audio.getAudioTracks().forEach(t=>stream!.addTrack(t));
    recorder=new MediaRecorder(stream,{mimeType:options.mime,videoBitsPerSecond:options.bitrate,audioBitsPerSecond:192000});
    const chunks:Blob[]=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    engine.render(project,resources,0,false);
    // Warm up browser media decoders before the recorder's clock starts.
    await new Promise<void>(resolve=>setTimeout(resolve,700));engine.render(project,resources,0,false);
    if(signal.aborted)throw new DOMException('Exportación cancelada','AbortError');
    return await new Promise<ExportResult>((resolve,reject)=>{
      let canceled=false;let failure:Error|undefined;
      let previousTime=0;
      let lastProgressTime=0;
      let renderGaps=0;
      let firstRenderGap:number|undefined;
      const abort=()=>{canceled=true;if(recorder!.state!=='inactive')recorder!.stop();};
      signal.addEventListener('abort',abort,{once:true});
      recorder!.onerror=()=>{failure=new Error('El navegador no pudo codificar el video. Prueba otra resolución o formato.');if(recorder!.state!=='inactive')recorder!.stop();else reject(failure);};
      recorder!.onstop=()=>{signal.removeEventListener('abort',abort);cancelAnimationFrame(frame);if(canceled)reject(new DOMException('Exportación cancelada','AbortError'));else if(failure)reject(failure);else {onProgress(1);resolve({blob:new Blob(chunks,{type:recorder!.mimeType||options.mime}),renderGaps,firstRenderGap});}};
      recorder!.start(1000);const start=engine.startExportAudio(project)??performance.now()/1000;
      const tick=()=>{
        const at=Math.min(duration,Math.round(((engine.audioClock()??performance.now()/1000)-start)*SECOND));
        if(at-previousTime>1.5*SECOND/options.fps){
          renderGaps++;
          firstRenderGap??=previousTime/SECOND;
        }
        previousTime=at;
        engine.render(project,resources,at,true);
        if(at-lastProgressTime>=SECOND/10){
          lastProgressTime=at;
          onProgress(at/duration);
        }
        if(at>=duration){recorder!.stop();return;}
        frame=requestAnimationFrame(tick);
      };
      tick();
    });
  }finally{cancelAnimationFrame(frame);if(recorder&&recorder.state!=='inactive')recorder.stop();engine.dispose();stream?.getTracks().forEach(t=>t.stop());}
}
