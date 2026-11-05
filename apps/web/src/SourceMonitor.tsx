import {useEffect,useRef,useState} from 'react';
import {Film,Music2,Play,Pause,SkipBack,Plus} from 'lucide-react';
import {SECOND,type Asset} from '@corte/core';
import type {MediaResource} from './media';
import {timecode} from './Timeline';

interface Props {asset?:Asset;resource?:MediaResource;fps:number;timelinePlaying:boolean;disabled:boolean;onPlay:()=>void;onAdd:()=>void}
export function SourceMonitor({asset,resource,fps,timelinePlaying,disabled,onPlay,onAdd}:Props){
  const media=useRef<HTMLVideoElement|HTMLAudioElement|null>(null);
  const [playing,setPlaying]=useState(false);const [at,setAt]=useState(0);
  useEffect(()=>{setAt(0);setPlaying(false);},[asset?.id,resource?.url]);
  useEffect(()=>{if(timelinePlaying)media.current?.pause();},[timelinePlaying]);
  useEffect(()=>{if(disabled)media.current?.pause();},[disabled]);
  const mediaEvents={onTimeUpdate:()=>setAt(media.current?.currentTime??0),onPlay:()=>{setPlaying(true);onPlay();},onPause:()=>setPlaying(false),onEnded:()=>setPlaying(false)};
  async function toggle(){const el=media.current;if(!el)return;if(el.paused){try{await el.play();}catch{setPlaying(false);}}else el.pause();}
  const playable=!!asset&&!!resource&&asset.kind!=='image';
  return <section className="source-monitor" aria-label="Monitor de origen">
    <div className="monitor-heading"><span className="monitor-type">ORIGEN</span><span className="monitor-filename" title={asset?.name}>{asset?.name??'Ningún medio seleccionado'}</span><span className="monitor-resolution">{asset?.width?`${asset.width} × ${asset.height}`:'—'}</span></div>
    <div className="source-stage">
      {asset&&resource?asset.kind==='image'?<img src={resource.url} alt={`Origen: ${asset.name}`}/>:asset.kind==='video'?<video key={resource.url} ref={el=>{media.current=el;}} src={resource.url} playsInline preload="metadata" {...mediaEvents}/>:<><div className="source-audio-art"><Music2 size={34}/><span>{asset.name}</span></div><audio key={resource.url} ref={el=>{media.current=el;}} src={resource.url} preload="metadata" {...mediaEvents}/></>:<div className="monitor-placeholder"><Film size={27}/><span>Selecciona un archivo de la biblioteca</span><small>Revísalo aquí antes de añadirlo a la edición</small></div>}
    </div>
    <div className="source-scrub"><input aria-label="Posición en el medio de origen" type="range" min={0} max={(asset?.duration??SECOND)/SECOND} step={1/fps} value={at} disabled={!playable||disabled} onChange={e=>{const next=Number(e.target.value);if(media.current)media.current.currentTime=next;setAt(next);}}/></div>
    <div className="source-controls"><span className="time-display">{timecode(at*SECOND,fps)}</span><div className="source-transport"><button aria-label="Origen: ir al inicio" disabled={!playable||disabled} onClick={()=>{if(media.current)media.current.currentTime=0;setAt(0);}}><SkipBack size={12}/></button><button aria-label={playing?'Pausar origen':'Reproducir origen'} disabled={!playable||disabled} onClick={()=>void toggle()}>{playing?<Pause size={13} fill="currentColor"/>:<Play size={13} fill="currentColor"/>}</button></div><button className="source-add" disabled={!asset||!resource||disabled} onClick={()=>{media.current?.pause();onAdd();}} title="Añadir al final de una pista"><Plus size={12}/> Añadir clip</button></div>
  </section>;
}
