import {useEffect,useRef} from 'react';
import {Volume2,VolumeX,RotateCcw} from 'lucide-react';
import {DEFAULT_AUDIO_MIX,edit,type AudioMixSettings,type Project} from '@corte/core';
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
const voiceBands=[
  {band:'body',label:'Cuerpo',min:-3,max:6},
  {band:'clarity',label:'Claridad',min:-2,max:4},
  {band:'deEss',label:'Suavizar eses',min:-4,max:0},
] as const;

export function AudioMixer({project,engine,disabled}:{
  project:Project;engine:React.MutableRefObject<Compositor|undefined>;disabled:boolean;
}){
  const {apply}=useEditor();
  const mix=project.settings.audioMix??DEFAULT_AUDIO_MIX;
  const tracks=project.tracks.filter(track=>track.role!=='titles');
  const voice=tracks.find(track=>track.id===mix.voiceTrackId);
  const music=tracks.find(track=>track.id===mix.musicTrackId);
  const hasDuckingTracks=!!voice&&!!music&&voice.id!==music.id;

  function updateMix(changes:Partial<AudioMixSettings>){
    apply(current=>edit(current,draft=>{
      draft.settings.audioMix={...DEFAULT_AUDIO_MIX,...draft.settings.audioMix,...changes};
    }));
  }

  const gainPreview=(trackId:string)=>(db?:number)=>
    engine.current?.previewBusVolume(trackId,db===undefined?undefined:dbToGain(db));
  const setMaster=(gain:number)=>apply(current=>edit(current,draft=>{draft.settings.masterVolume=gain;}));

  return <section className="audio-mixer" aria-label="Mezclador de audio">
    <div className="audio-mix-tools">
      <fieldset disabled={disabled}>
        <legend>Voz de Cine</legend>
        <label className="property-field">Pista de voz
          <select value={voice?.id??''} onChange={event=>{
            const id=event.target.value||undefined;
            updateMix({voiceTrackId:id,...(!id||id===music?.id?{ducking:false}:{})});
          }}>
            <option value="">Seleccionar pista</option>
            {tracks.map(track=><option key={track.id} value={track.id}>{track.name}</option>)}
          </select>
        </label>
        <label className="property-field">Activar ecualizador
          <input type="checkbox" checked={mix.eqEnabled} disabled={!voice}
            onChange={event=>updateMix({eqEnabled:event.target.checked})}/>
        </label>
        {voiceBands.map(({band,...props})=><Parameter key={band} {...props} unit=" dB" step={.5} value={mix[band]}
          disabled={!voice||!mix.eqEnabled||disabled}
          onPreview={value=>engine.current?.previewVoiceBand(band,value)}
          onCommit={value=>updateMix({[band]:value})}/>)}
      </fieldset>

      <fieldset disabled={disabled}>
        <legend>Reducción de música de fondo</legend>
        <label className="property-field">Pista de música
          <select value={music&&music.id!==voice?.id?music.id:''} onChange={event=>{
            const id=event.target.value||undefined;
            updateMix({musicTrackId:id,...(!id?{ducking:false}:{})});
          }}>
            <option value="">Seleccionar pista</option>
            {tracks.filter(track=>track.id!==voice?.id).map(track=><option key={track.id} value={track.id}>{track.name}</option>)}
          </select>
        </label>
        <label className="property-field">Activar Auto-Ducking
          <input type="checkbox" checked={mix.ducking&&hasDuckingTracks} disabled={!hasDuckingTracks}
            onChange={event=>updateMix({ducking:event.target.checked})}/>
        </label>
        <p className="hint">Elegí pistas distintas. La música baja 12 dB cuando la voz supera −30 dBFS.</p>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend>Ganancia general</legend>
        <Parameter label="Ganancia Master" min={-60} max={6} step={.5} unit=" dB"
          value={gainToDb(project.settings.masterVolume??1)}
          onPreview={gainPreview('master')} onCommit={db=>setMaster(dbToGain(db))}/>
        <button className="channel-mute" type="button" onClick={()=>setMaster(1)}>Restablecer 0 dB</button>
      </fieldset>
    </div>
    <details className="audio-channel-details">
      <summary>Mezclador por pistas</summary>
      <div className="mixer-channels">
        {project.tracks.map(track=><section className="mixer-channel" key={track.id}>
          <strong>{track.name}</strong>
          <span className="channel-gain">{gainToDb(track.volume??1).toFixed(1)} dB</span>
          <div className="channel-controls">
            <Parameter vertical label={`Ganancia ${track.name}`} min={-60} max={6} step={.5} unit=" dB"
              value={gainToDb(track.volume??1)} disabled={disabled||track.locked} onPreview={gainPreview(track.id)}
              onCommit={db=>apply(current=>edit(current,draft=>{
                const target=draft.tracks.find(item=>item.id===track.id);
                if(target&&!target.locked)target.volume=dbToGain(db);
              }))}/>
            <LevelMeter label={track.name} read={()=>engine.current?.meterLevels().tracks[track.id]??[-60,-60]}/>
          </div>
          <button type="button" className={`channel-mute ${track.muted?'muted-channel':''}`}
            disabled={disabled} aria-label={`${track.muted?'Activar':'Silenciar'} canal ${track.name}`}
            onClick={()=>apply(current=>edit(current,draft=>{
              const target=draft.tracks.find(item=>item.id===track.id);
              if(target)target.muted=!target.muted;
            }))}>{track.muted?<VolumeX size={14}/>:<Volume2 size={14}/>} {track.muted?'Mudo':'Silenciar'}</button>
        </section>)}
      </div>
    </details>
  </section>;
}
