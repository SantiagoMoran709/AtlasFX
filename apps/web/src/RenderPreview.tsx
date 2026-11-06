import {useEffect,useRef,useState} from 'react';
import {Download} from 'lucide-react';
import type {ExportResult} from './exporter';

export interface RenderReview extends ExportResult {
  name: string;
  fps: number;
}

export function RenderPreview({result, notice, onBack, onSave}: {
  result: RenderReview;
  notice: string;
  onBack: () => void;
  onSave: () => void;
}) {
  const player = useRef<HTMLVideoElement>(null);
  const [url,setUrl] = useState('');
  const [size,setSize] = useState('');
  const [error,setError] = useState(false);
  const [stats,setStats] = useState<{fps?:number; largestGap?:number; dropped:number}>();

  useEffect(()=>{
    const source = URL.createObjectURL(result.blob);
    setUrl(source);
    return ()=>URL.revokeObjectURL(source);
  },[result.blob]);

  useEffect(()=>{
    const video = player.current;
    if(!video || !url || !video.requestVideoFrameCallback) return;
    let callback = 0;
    let previous: VideoFrameCallbackMetadata | undefined;
    let frames = 0;
    let seconds = 0;
    let largestGap = 0;
    let lastUpdate = 0;
    const publish = ()=>{
      setStats({
        fps:seconds>=.25?frames/seconds:undefined,
        largestGap:largestGap||undefined,
        dropped:video.getVideoPlaybackQuality().droppedVideoFrames,
      });
    };
    const resetBaseline = ()=>{previous=undefined;};
    const sample: VideoFrameRequestCallback = (now, metadata)=>{
      if(!video.paused&&!video.seeking&&video.playbackRate===1){
        if(previous){
          const elapsed=metadata.mediaTime-previous.mediaTime;
          const presented=metadata.presentedFrames-previous.presentedFrames;
          if(elapsed>0&&presented>0){
            frames+=presented;
            seconds+=elapsed;
            if(presented===1)largestGap=Math.max(largestGap,elapsed);
          }
        }
        previous=metadata;
        if(now-lastUpdate>=250){lastUpdate=now;publish();}
      }else resetBaseline();
      callback=video.requestVideoFrameCallback(sample);
    };
    callback=video.requestVideoFrameCallback(sample);
    for(const event of ['seeking','pause','ratechange','ended']) video.addEventListener(event,resetBaseline);
    video.addEventListener('ended',publish);
    return ()=>{
      video.cancelVideoFrameCallback(callback);
      for(const event of ['seeking','pause','ratechange','ended']) video.removeEventListener(event,resetBaseline);
      video.removeEventListener('ended',publish);
    };
  },[url]);

  return <div className="modal-backdrop">
    <section className="modal render-review" role="dialog" aria-modal="true" aria-labelledby="render-review-title">
      <h2 id="render-review-title">Vista previa del renderizado</h2>
      <p className="muted render-name">{result.name}</p>
      {url&&<video ref={player} src={url} controls playsInline preload="metadata" aria-label="Video renderizado"
        onLoadedMetadata={event=>setSize(`${event.currentTarget.videoWidth} × ${event.currentTarget.videoHeight}`)}
        onError={()=>setError(true)}/>}
      <dl className="render-stats">
        <div><dt>Resolución del archivo</dt><dd>{size||'—'}</dd></div>
        <div><dt>FPS objetivo</dt><dd>{result.fps}</dd></div>
        <div><dt>FPS observados</dt><dd>{stats?.fps?.toFixed(1)??'—'}</dd></div>
        <div><dt>Descartes del reproductor</dt><dd>{stats?.dropped??'—'}</dd></div>
      </dl>
      {error&&<p role="alert">No se pudo reproducir el render. Podés volver y probar otro formato.</p>}
      {result.firstRenderGap!==undefined&&<p className="export-stream-notice">
        El render tardó más de lo previsto en {result.renderGaps} intervalos.{' '}
        <button className="button secondary" onClick={()=>{
          if(player.current)player.current.currentTime=result.firstRenderGap??0;
        }}>Revisar desde {result.firstRenderGap.toFixed(1)} s</button>
      </p>}
      {(stats?.largestGap??0)>1.5/result.fps&&<p className="export-stream-notice">
        Se observó un intervalo de {Math.round(stats!.largestGap!*1000)} ms entre fotogramas durante la reproducción.
      </p>}
      {notice&&<p className="export-stream-notice">{notice}</p>}
      <p className="hint">Reproducí el video para estimar su fluidez. Los FPS observados y los descartes dependen también de la reproducción en este equipo.</p>
      <div className="modal-actions">
        <button className="button secondary" onClick={onBack}>Volver a ajustes</button>
        <button className="button primary" onClick={onSave}><Download size={17}/> Guardar video</button>
      </div>
    </section>
  </div>;
}
