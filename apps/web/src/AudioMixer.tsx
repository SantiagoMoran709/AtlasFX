import {useEffect,useRef} from 'react';
import {Volume2,VolumeX,RotateCcw} from 'lucide-react';
import {edit,type Project} from '@corte/core';
import {type Compositor} from './engine';
import {type MeterLevels} from './audioGraph';
import {useEditor} from './store';
import {Parameter,gainToDb,dbToGain} from './Controls';
export function LevelMeter({read,label,compact=false}:{read:()=>[number,number];label:string;compact?:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),output=useRef<HTMLOutputElement>(null);const reader=useRef(read);reader.current=read;const peak=useRef(-60);
 useEffect(()=>{
   const element=canvas.current;
   if(!element)return;
   const observer=new ResizeObserver(([entry])=>{
     const height=Math.round(entry.contentRect.height);
     if(height>0&&element.height!==height)element.height=height;
   });
   observer.observe(element);
   return ()=>observer.disconnect();
 },[]);
 useEffect(()=>{let raf=0,last=performance.now(),textAt=0;let levels=[-60,-60];const draw=(now:number)=>{const ctx=canvas.current?.getContext('2d');if(ctx){const next=reader.current(),dt=(now-last)/1000;levels=next.map((v,i)=>Math.max(v,levels[i]-dt*35));last=now;const w=canvas.current!.width,h=canvas.current!.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#111113';ctx.fillRect(0,0,w,h);const top=9,bottom=h-17,height=bottom-top;const x=compact?30:24,bw=compact?9:10;ctx.font='9px monospace';ctx.textAlign='right';const ticks=height<82?[0,-20,-40,-60]:[0,-6,-12,-24,-36,-48,-60];const segments=Math.min(40,Math.max(1,Math.floor(height/3)));for(const db of ticks){const y=top+(-db/60)*height;ctx.fillStyle='#86868f';ctx.fillText(String(db),x-5,y+3);}levels.forEach((db,i)=>{const bx=x+i*(bw+5);for(let s=0;s<segments;s++){const threshold=-60+s*60/segments;ctx.fillStyle=db>threshold?(threshold>=-3?'#ed6a72':threshold>=-12?'#e1ba55':'#65b789'):'#232327';ctx.fillRect(bx,bottom-(s+1)*height/segments,bw,height/segments-1);}ctx.fillStyle='#85858e';ctx.textAlign='center';ctx.fillText(i?'R':'L',bx+bw/2,h-4);});peak.current=Math.max(peak.current,...next);if(output.current&&now-textAt>100){const current=Math.max(...next);output.current.textContent=current<=-60?'−∞ dBFS':`${current.toFixed(1)} dBFS`;output.current.dataset.peak=String(current);output.current.classList.toggle('clipping',peak.current>=0);textAt=now;}}raf=requestAnimationFrame(draw);};raf=requestAnimationFrame(draw);return()=>cancelAnimationFrame(raf);},[compact]);
 return <div className={`level-meter ${compact?'compact-meter':''}`}><canvas ref={canvas} width={compact?66:64} height={compact?230:174} role="img" aria-label={`Medidor de señal real ${label}`}/><output ref={output} aria-label={`Nivel ${label}`} className="meter-readout">−∞ dBFS</output><button className="reset-peak" aria-label={`Restablecer pico ${label}`} title="Restablecer indicador de pico" onClick={()=>{peak.current=-60;}}><RotateCcw size={11}/></button></div>;
}
export function MasterMeter({read}:{read:()=>MeterLevels}){return <aside className="master-meter"><span>MASTER</span><LevelMeter compact label="Master" read={()=>read().master}/><small>dBFS</small></aside>;}
export function AudioMixer({project:p,engine,disabled}:{project:Project;engine:React.MutableRefObject<Compositor|undefined>;disabled:boolean}){
 const {apply}=useEditor();const levels=()=>engine.current?.meterLevels();
 return <section className="audio-mixer" aria-label="Mezclador de audio"><div className="mixer-channels">{[...p.tracks.map(t=>({id:t.id,name:t.name,volume:t.volume??1,muted:t.muted,locked:t.locked})),{id:'master',name:'Master',volume:p.settings.masterVolume??1,muted:false,locked:false}].map(t=><section className={`mixer-channel ${t.id==='master'?'master-channel':''}`} key={t.id}><strong>{t.name}</strong><span className="channel-gain">{t.volume<=.001?'−∞':gainToDb(t.volume).toFixed(1)} dB</span><div className="channel-controls"><Parameter vertical label={`Ganancia ${t.name}`} min={-60} max={6} step={.5} unit=" dB" value={gainToDb(t.volume)} disabled={disabled||t.locked} onPreview={db=>engine.current?.previewBusVolume(t.id,db===undefined?undefined:dbToGain(db))} onCommit={db=>apply(d=>edit(d,x=>{if(t.id==='master')x.settings.masterVolume=dbToGain(db);else{const track=x.tracks.find(a=>a.id===t.id)!;if(track.locked)throw new Error('La pista está bloqueada.');track.volume=dbToGain(db);}}))}/><LevelMeter label={t.name} read={()=>t.id==='master'?levels()?.master??[-60,-60]:levels()?.tracks[t.id]??[-60,-60]}/></div>{t.id!=='master'?<button className={`channel-mute ${t.muted?'muted-channel':''}`} disabled={disabled} aria-label={`${t.muted?'Activar':'Silenciar'} canal ${t.name}`} onClick={()=>apply(d=>edit(d,x=>{x.tracks.find(a=>a.id===t.id)!.muted=!t.muted;}))}>{t.muted?<VolumeX size={14}/>:<Volume2 size={14}/>} {t.muted?'Mudo':'Silenciar'}</button>:<button className="channel-mute" disabled={disabled} onClick={()=>apply(d=>edit(d,x=>{x.settings.masterVolume=1;}))}>Restablecer 0 dB</button>}</section>)}</div></section>;
}
