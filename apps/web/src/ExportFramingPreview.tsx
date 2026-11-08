import {useEffect,useRef,useState} from 'react';
import {Pause,Play} from 'lucide-react';
import {endTime,frameToTime,SECOND,type Project} from '@corte/core';
import {Compositor} from './engine';
import {drawExportFrame,getExportLayout,type ExportFrame} from './exporter';
import type {MediaResource} from './media';
import {timecode} from './Timeline';

interface Props {
  project:Project;
  resources:Record<string,MediaResource>;
  sourceSize:{width:number;height:number};
  frame?:ExportFrame;
  label:string;
  initialTime:number;
}

export function ExportFramingPreview({project,resources,sourceSize,frame,label,initialTime}:Props){
  const duration=endTime(project);
  const lastFrame=Math.max(0,duration-frameToTime(1,project.settings.fps));
  const cursor=useRef(Math.min(initialTime,lastFrame));
  const [time,setTime]=useState(cursor.current);
  const playing=useRef(false);
  const [isPlaying,setIsPlaying]=useState(false);
  const canvas=useRef<HTMLCanvasElement>(null);
  const [error,setError]=useState('');

  const layout=getExportLayout(project,sourceSize,frame);
  const {width,height}=layout;

  useEffect(()=>{
    const output=canvas.current;
    const ctx=output?.getContext('2d');
    if(!ctx)return;

    const layout=getExportLayout(project,sourceSize,frame);
    const source=document.createElement('canvas');
    const scale=Math.min(1,640/Math.max(sourceSize.width,sourceSize.height));
    source.width=Math.max(1,Math.round(sourceSize.width*scale));
    source.height=Math.max(1,Math.round(sourceSize.height*scale));
    const engine=new Compositor(source,setError,true);
    let animation=0;
    let lastTick=performance.now();
    let lastDraw=-Infinity;
    let drawnTime=-1;
    setError('');

    const tick=(now:number)=>{
      const elapsed=now-lastTick;
      lastTick=now;
      if(playing.current){
        cursor.current=Math.min(lastFrame,cursor.current+elapsed*SECOND/1000);
        if(cursor.current>=lastFrame){
          playing.current=false;
          setIsPlaying(false);
        }
      }
      const drawInterval=playing.current?1000/24:120;
      if(now-lastDraw>=drawInterval||(!playing.current&&cursor.current!==drawnTime)){
        try {
          engine.render(layout.renderProject,resources,Math.round(cursor.current),playing.current,
            undefined,undefined,layout.titleViewport);
          drawExportFrame(ctx,source,layout);
        } catch {
          playing.current=false;
          setIsPlaying(false);
          setError('No se pudo mostrar la vista previa del encuadre.');
          return;
        }
        lastDraw=now;
        drawnTime=cursor.current;
        setTime(Math.round(cursor.current));
      }
      animation=requestAnimationFrame(tick);
    };
    animation=requestAnimationFrame(tick);
    return ()=>{
      cancelAnimationFrame(animation);
      engine.dispose();
    };
  },[project,resources,sourceSize,frame,lastFrame]);

  const previewScale=Math.min(1,480/Math.max(width,height));
  return <section className="export-framing" aria-label="Vista previa del encuadre">
    <div className="export-framing-heading">
      <strong>Vista previa del encuadre</strong>
      <span>{label} · {width} × {height}</span>
    </div>
    <div className="export-framing-stage">
      <canvas ref={canvas} width={Math.max(1,Math.round(width*previewScale))}
        height={Math.max(1,Math.round(height*previewScale))} aria-label="Imagen con el encuadre de salida"/>
    </div>
    <div className="export-framing-controls">
      <button className="button secondary" type="button" aria-label={isPlaying?'Pausar vista previa':'Reproducir vista previa'}
        disabled={!lastFrame||!!error&&!isPlaying} onClick={()=>{
          if(!playing.current&&cursor.current>=lastFrame)cursor.current=0;
          playing.current=!playing.current;
          setIsPlaying(playing.current);
        }}>{isPlaying?<Pause size={16}/>:<Play size={16}/>}</button>
      <input type="range" min={0} max={lastFrame} step={1} value={time} aria-label="Posición de la vista previa"
        disabled={!lastFrame} onChange={event=>{
          playing.current=false;
          setIsPlaying(false);
          cursor.current=Number(event.target.value);
          setTime(cursor.current);
        }}/>
      <span className="tiny muted">{timecode(time,project.settings.fps)}</span>
    </div>
    {error?<p className="hint" role="status">{error}</p>:<p className="hint">Revisá cómo se ve el video con este encuadre. Vista previa sin audio.</p>}
  </section>;
}
