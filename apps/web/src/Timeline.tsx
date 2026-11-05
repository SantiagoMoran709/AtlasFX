import {useEffect,useRef,useState,type MouseEvent,type PointerEvent} from 'react';
import {Eye,EyeOff,LockKeyhole,UnlockKeyhole,Volume2,VolumeX,Film,Music2,Plus,Scissors,Trash2,Undo2,Redo2,Magnet,Minus,Type} from 'lucide-react';
import {MAX_TRACKS,SECOND,frameToTime,timeToFrame,sourceSpan,createTrack,endTime,edit,moveClip,snap,type Project,type Clip,type Track} from '@corte/core';
import {useEditor} from './store';
import {useViewport} from './useViewport';
import {clampTimelineZoom,stepTimelineZoom,zoomToSlider,sliderToZoom,timelineZoomLabel,timelineTickStep,timelineTickLabel} from './timelineZoom';
import type {MediaResource} from './media';
export const timecode=(time:number,fps=30)=>{const frames=timeToFrame(Math.max(0,time),fps);const nominal=Math.round(fps);const s=Math.floor(frames/nominal);return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}:${String(frames%nominal).padStart(2,'0')}`;};
interface Props {project:Project;resources:Record<string,MediaResource>;timeRef:React.MutableRefObject<number>;playheadRef:React.RefObject<HTMLDivElement>;seek:(at:number)=>void;split:()=>void;remove:()=>void;onTitle:()=>void;onTransition:(id?:string)=>void;onSeparateAudio:(id:string)=>void;canSeparateAudio:(id:string)=>boolean;zoom:number;setZoom:(z:number)=>void;disabled:boolean}
export function Timeline({project:p,resources,timeRef,playheadRef,seek,split,remove,onTitle,onTransition,onSeparateAudio,canSeparateAudio,zoom,setZoom,disabled}:Props){
  const {h,selected,select,apply,undo,redo,message}=useEditor();const [magnet,setMagnet]=useState(true);const scroll=useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<{ id: string; x: number; y: number; trigger: HTMLButtonElement }>();
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!context) return;
    (menu.current?.querySelector<HTMLElement>('button:not(:disabled)') ?? menu.current)?.focus();
    function outside(event: globalThis.PointerEvent) {
      if (!menu.current?.contains(event.target as Node)) setContext(undefined);
    }
    function close() { setContext(undefined); }
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', close);
    };
  }, [context]);
  function openContext(event: MouseEvent<HTMLButtonElement>, id: string) {
    event.preventDefault();
    if (disabled) return;
    const trigger = event.currentTarget;
    const bounds = trigger.getBoundingClientRect();
    select(id);
    setContext({
      id, trigger,
      x: Math.max(4, Math.min(event.clientX || bounds.left, window.innerWidth - 224)),
      y: Math.max(4, Math.min(event.clientY || bounds.bottom, window.innerHeight - 48)),
    });
  }
  const {width: viewportWidth}=useViewport(scroll);
  const seconds=Math.max(30,endTime(p)/SECOND+5);
  const width=Math.max(viewportWidth,seconds*zoom);
  const step=timelineTickStep(zoom);
  const zoomLabel=timelineZoomLabel(zoom);
  function fitTimeline(){
    if(!scroll.current?.clientWidth)return;
    setZoom(clampTimelineZoom((scroll.current.clientWidth-1)/seconds));
    scroll.current.scrollLeft=0;
  }
  function startDrag(event:PointerEvent<HTMLButtonElement>,clip:Clip,track:Track,mode:'move'|'left'|'right'){
    if(disabled||track.locked||event.button!==0)return;event.stopPropagation();select(clip.id);event.preventDefault();
    const el=event.currentTarget;const origin=event.clientX;const initialScroll=scroll.current?.scrollLeft??0;
    let targetTime=clip.start;let targetSource=clip.sourceIn;let targetDuration=clip.duration;let trackId=track.id;let changed=false;
    const points=[0,timeRef.current,...p.tracks.flatMap(t=>t.clips.filter(c=>c.id!==clip.id).flatMap(c=>[c.start,c.start+c.duration]))];
    const frame=frameToTime(1,p.settings.fps);
    const speed=clip.speed??1;
    const quantize=(n:number)=>frameToTime(timeToFrame(n,p.settings.fps),p.settings.fps);
    const onMove=(e:globalThis.PointerEvent)=>{
      let delta=Math.round((e.clientX-origin+(scroll.current?.scrollLeft??0)-initialScroll)/zoom*SECOND);
      if(Math.abs(e.clientX-origin)<3&&!changed)return;changed=true;
      if(mode==='move'){
        let start=Math.max(0,quantize(clip.start+delta));if(magnet){const a=snap(start,points,8/zoom*SECOND);start=a!==start?a:snap(start+clip.duration,points,8/zoom*SECOND)-clip.duration;}
        targetTime=Math.max(0,Math.round(start));el.style.left=`${targetTime/SECOND*zoom}px`;
        const under=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-track]');
        const target=p.tracks.find(t=>t.id===under?.dataset.track);trackId=target?.kind===track.kind&&!target.locked?target.id:track.id;
      }else if(mode==='right'){
        const max=p.assets[clip.assetId].kind==='image'?3600*SECOND:Math.floor((p.assets[clip.assetId].duration-clip.sourceIn)/speed);
        let end=quantize(clip.start+clip.duration+delta);if(magnet)end=snap(end,points,8/zoom*SECOND);
        targetDuration=Math.round(Math.min(max,Math.max(Math.min(frame,clip.duration),end-clip.start)));el.style.width=`${targetDuration/SECOND*zoom}px`;
      }else{
        delta=quantize(delta);delta=Math.round(Math.max(-clip.start,Math.ceil(-clip.sourceIn/speed),Math.min(clip.duration-Math.min(frame,clip.duration),delta)));targetSource=clip.sourceIn+sourceSpan(delta,speed);targetTime=clip.start+delta;targetDuration=clip.duration-delta;
        el.style.left=`${targetTime/SECOND*zoom}px`;el.style.width=`${targetDuration/SECOND*zoom}px`;
      }
    };
    const finish=(cancel=false)=>{
      window.removeEventListener('pointermove',onMove);window.removeEventListener('pointerup',onUp);window.removeEventListener('pointercancel',onCancel);
      el.style.left=`${clip.start/SECOND*zoom}px`;el.style.width=`${clip.duration/SECOND*zoom}px`;
      if(cancel||!changed)return;
      if(mode==='move')apply(d=>moveClip(d,clip.id,targetTime,trackId));
      else apply(d=>edit(d,draft=>{const t=draft.tracks.find(t=>t.id===track.id)!;const c=t.clips.find(c=>c.id===clip.id)!;c.start=targetTime;c.sourceIn=targetSource;c.duration=targetDuration;c.fadeIn=Math.min(c.fadeIn??0,c.duration);c.fadeOut=Math.min(c.fadeOut??0,c.duration);}));
    };
    const onUp=()=>finish();const onCancel=()=>finish(true);
    window.addEventListener('pointermove',onMove);window.addEventListener('pointerup',onUp,{once:true});window.addEventListener('pointercancel',onCancel,{once:true});
  }
  function scrub(e:PointerEvent<HTMLDivElement>){if(disabled)return;const el=e.currentTarget;el.setPointerCapture(e.pointerId);const update=(x:number)=>seek(Math.max(0,Math.round((x-el.getBoundingClientRect().left)/zoom*SECOND)));update(e.clientX);el.onpointermove=ev=>update(ev.clientX);el.onpointerup=()=>{el.onpointermove=null;el.onpointerup=null;};}
  return <section className="timeline" aria-label="Línea de tiempo">
    <div className="timeline-heading"><Film/><strong>Línea de tiempo</strong><span>{p.tracks.reduce((n,t)=>n+t.clips.length,0)} clips</span><span>{p.tracks.length}/{MAX_TRACKS} pistas</span><span className="timeline-project-info">{p.name} / {p.settings.fps} fps</span></div>
    <div className="timeline-toolbar"><div className="tool-group"><button title="Deshacer (Ctrl+Z)" aria-label="Deshacer" disabled={disabled||!h.past.length} onClick={undo}><Undo2/></button><button title="Rehacer (Ctrl+Shift+Z)" aria-label="Rehacer" disabled={disabled||!h.future.length} onClick={redo}><Redo2/></button><i/><button title="Dividir (S)" aria-label="Dividir clip" disabled={disabled||!selected} onClick={split}><Scissors/></button><button title="Eliminar (Supr)" aria-label="Eliminar clip" disabled={disabled||!selected} onClick={remove}><Trash2/></button><i/><button className={magnet?'active':''} title="Ajustar a bordes" aria-label="Activar imán" aria-pressed={magnet} onClick={()=>setMagnet(!magnet)}><Magnet/></button><span className="muted tiny magnet-label">Ajuste magnético</span><i/>
      <button className="labeled-tool" disabled={disabled} onClick={onTitle}><Type/> Texto</button>
      <button className="labeled-tool" disabled={disabled||!selected} onClick={()=>onTransition()}>Transición</button></div>
    <div className="tool-group"><span className="muted tiny">Zoom</span><button aria-label="Reducir zoom" onClick={()=>setZoom(stepTimelineZoom(zoom,-1))}><Minus/></button>
      <input aria-label="Zoom de línea de tiempo" aria-valuetext={zoomLabel} type="range" min="0" max="1000" value={zoomToSlider(zoom)} onChange={e=>setZoom(sliderToZoom(Number(e.target.value)))}/>
      <button aria-label="Aumentar zoom" onClick={()=>setZoom(stepTimelineZoom(zoom,1))}><Plus/></button><span className="zoom-label">{zoomLabel}</span>
      <button className="labeled-tool" title="Ajustar toda la línea de tiempo" onClick={fitTimeline}>Ver todo</button></div></div>
    <div className="timeline-body"><div className="track-headers"><div className="ruler-label">PISTAS <button title="Añadir pista de video" aria-label="Añadir pista de video" disabled={disabled} onClick={()=>apply(d=>edit(d,x=>{x.tracks.unshift(createTrack('video',`Video ${x.tracks.filter(t=>t.kind==='video').length+1}`));}))}><Plus size={14}/></button></div>
    {p.tracks.map(t=><div key={t.id} className="track-header"><div className="track-name">{t.kind==='video'?<Film/>:<Music2/>}<span>{t.name}</span></div><div className="track-actions"><button disabled={disabled} aria-label={`${t.muted?'Activar':'Silenciar'} ${t.name}`} title="Silenciar pista" onClick={()=>apply(d=>edit(d,x=>{x.tracks.find(a=>a.id===t.id)!.muted=!t.muted;}))}>{t.muted?<VolumeX/>:<Volume2/>}</button><button disabled={disabled} aria-label={`${t.visible?'Ocultar':'Mostrar'} ${t.name}`} title="Visibilidad de pista" onClick={()=>apply(d=>edit(d,x=>{x.tracks.find(a=>a.id===t.id)!.visible=!t.visible;}))}>{t.visible?<Eye/>:<EyeOff/>}</button><button disabled={disabled} aria-label={`${t.locked?'Desbloquear':'Bloquear'} ${t.name}`} title="Bloquear pista" onClick={()=>apply(d=>edit(d,x=>{x.tracks.find(a=>a.id===t.id)!.locked=!t.locked;}))}>{t.locked?<LockKeyhole/>:<UnlockKeyhole/>}</button></div></div>)}
    <button className="add-audio" disabled={disabled} onClick={()=>apply(d=>edit(d,x=>{x.tracks.push(createTrack('audio',`Audio ${x.tracks.filter(t=>t.kind==='audio').length+1}`));}))}><Plus size={13}/> Pista de audio</button></div>
    <div className="timeline-scroll" ref={scroll} onWheel={e=>{if(e.ctrlKey){setZoom(stepTimelineZoom(zoom,e.deltaY>0?-1:1));}else if(scroll.current)scroll.current.scrollLeft+=e.deltaY;}}><div className="timeline-content" style={{width,minHeight:p.tracks.length*72+70}}>
      <div className="ruler" onPointerDown={scrub}>{p.markers?.map(m=><button className="timeline-marker" key={m.id} style={{left:m.time/SECOND*zoom}} title={m.name} aria-label={`Ir a ${m.name}`} onPointerDown={e=>e.stopPropagation()} onClick={()=>seek(m.time)}>◆</button>)}{Array.from({length:Math.max(1,Math.floor((width-38)/(step*zoom))+1)},(_,i)=><span key={i} style={{left:i*step*zoom}}>{timelineTickLabel(i*step,step)}</span>)}</div>
      {p.tracks.map(t=><div className={`track-lane ${!t.visible?'invisible-track':''}`} style={{backgroundSize:`${step*zoom}px 100%`}} key={t.id} data-track={t.id} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(disabled)return;const assetId=e.dataTransfer.getData('asset');const asset=p.assets[assetId];if(!asset)return;if(t.locked){message('La pista está bloqueada.');return;}const start=Math.max(0,Math.round((e.clientX-e.currentTarget.getBoundingClientRect().left)/zoom*SECOND));apply(d=>edit(d,x=>{const track=x.tracks.find(a=>a.id===t.id)!;track.clips.push({id:crypto.randomUUID(),assetId,start,duration:asset.duration,sourceIn:0,volume:1,opacity:1,scale:1,rotation:0});}));}} onClick={e=>{if(e.target===e.currentTarget&&!disabled){select();seek(Math.round((e.clientX-e.currentTarget.getBoundingClientRect().left)/zoom*SECOND));}}}>
      {t.clips.map(c=>{const asset=p.assets[c.assetId];const kind=c.audioOnly?'audio':asset.kind;const clipWidth=c.duration/SECOND*zoom;const name=c.title?(c.title.text.trim()||'Título'):asset.name;return <button key={c.id} className={`timeline-clip ${kind} ${selected===c.id?'selected':''} ${c.title?'title-clip':''} ${clipWidth<16?'compact-clip':''} ${!asset.generated&&!resources[asset.id]?'missing':''}`} style={{left:c.start/SECOND*zoom,width:clipWidth}} aria-label={c.audioOnly?`Clip de audio ${name}`:`Clip ${name}`} onContextMenu={e=>openContext(e,c.id)} onClick={e=>{e.stopPropagation();select(c.id);}} onPointerDown={e=>startDrag(e,c,t,(e.target as HTMLElement).dataset.edge==='left'?'left':(e.target as HTMLElement).dataset.edge==='right'?'right':'move')}>
        <span className="trim-handle left" data-edge="left"/><span className="clip-name">{c.title?<Type size={12}/>:kind==='audio'?<Music2 size={12}/>:c.audioDetached?<VolumeX size={12}/>:<Film size={12}/>} {name}</span>{kind!=='audio'&&resources[asset.id]?.thumbnail&&<div className="clip-strip" style={{backgroundImage:`url("${resources[asset.id].thumbnail}")`}}/>}{kind==='audio'&&<span className="audio-clip-label">{c.audioOnly?'Audio separado':'Audio'}</span>}<span className="trim-handle right" data-edge="right"/></button>;})}
      {t.transitions?.map(transition=>{
        const incoming=t.clips.find(clip=>clip.id===transition.to);
        if(!incoming)return null;
        const label=transition.kind==='dissolve'?'Disolvencia cruzada':'Barrido';
        return <button key={transition.from} className="transition-cut" aria-label={`Editar transición de ${label.toLowerCase()}`} title={label}
          style={{left:incoming.start/SECOND*zoom,width:Math.max(18,transition.duration/SECOND*zoom)}}
          disabled={disabled||t.locked} onClick={event=>{event.stopPropagation();select(transition.from);onTransition(transition.from);}}/>;
      })}
      </div>)}
      <div className="playhead" ref={playheadRef} style={{left:0}}><div/></div>
      {!p.tracks.some(t=>t.clips.length>0)&&<div className="timeline-empty">Arrastra tus medios aquí para empezar a contar tu historia</div>}
    </div></div></div><div className="timeline-footer"><span>Espacio <b>Reproducir</b> <em>·</em> S <b>Dividir</b> <em>·</em> Supr <b>Eliminar</b></span></div>
    {context && !disabled && <div className="editor-dropdown clip-context-menu" role="menu" aria-label="Opciones del clip"
      ref={menu} tabIndex={-1} style={{ left: context.x, top: context.y }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          setContext(undefined);
          context.trigger.focus();
        }
      }}>
      <button role="menuitem" disabled={!canSeparateAudio(context.id)} onClick={() => {
        onSeparateAudio(context.id);
        setContext(undefined);
        context.trigger.focus();
      }}>Separar audio <kbd>Ctrl+Alt+S</kbd></button>
    </div>}
  </section>;
}
