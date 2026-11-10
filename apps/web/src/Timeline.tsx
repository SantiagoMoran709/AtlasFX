import {useEffect,useLayoutEffect,useMemo,useRef,useState,type MouseEvent,type PointerEvent} from 'react';
import {Eye,EyeOff,LockKeyhole,UnlockKeyhole,Volume2,VolumeX,Film,Music2,Plus,Scissors,Trash2,Undo2,Redo2,Magnet,Minus,Type} from 'lucide-react';
import {MAX_TRACKS,SECOND,addAudioTrack,addVideoTrack,moveClipLayer,frameToTime,timeToFrame,sourceSpan,endTime,firstClipEndingAfter,edit,moveClip,setClipProps,snap,type Project,type Clip,type Track} from '@corte/core';
import {useEditor} from './store';
import {useViewport} from './useViewport';
import {clampTimelineZoom,stepTimelineZoom,zoomToSlider,sliderToZoom,timelineZoomLabel,timelineTickStep,timelineTickLabel} from './timelineZoom';
import type {MediaResource} from './media';
export const timecode=(time:number,fps=30)=>{const frames=timeToFrame(Math.max(0,time),fps);const nominal=Math.round(fps);const s=Math.floor(frames/nominal);return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}:${String(frames%nominal).padStart(2,'0')}`;};
interface Props {project:Project;resources:Record<string,MediaResource>;timeRef:React.MutableRefObject<number>;playheadRef:React.RefObject<HTMLDivElement>;seek:(at:number)=>void;split:()=>void;remove:()=>void;onTitle:()=>void;onTransition:(id?:string)=>void;onSeparateAudio:(id:string)=>void;onDeleteTrack:(id:string)=>void;canSeparateAudio:(id:string)=>boolean;zoom:number;setZoom:(z:number)=>void;disabled:boolean}
export function Timeline({project:p,resources,timeRef,playheadRef,seek,split,remove,onTitle,onTransition,onSeparateAudio,onDeleteTrack,canSeparateAudio,zoom,setZoom,disabled}:Props){
  const {h,selected,select,apply,undo,redo,message}=useEditor();const [magnet,setMagnet]=useState(true);const scroll=useRef<HTMLDivElement>(null);
  const body=useRef<HTMLDivElement>(null);
  const [scrollLeft,setScrollLeft]=useState(0);
  const [focusedClip,setFocusedClip]=useState<string>();
  const pinned=useMemo(()=>new Map(p.tracks.map(track=>[
    track.id,track.clips.filter(clip=>clip.id===selected||clip.id===focusedClip),
  ])),[p.tracks,selected,focusedClip]);
  const selectedTrackIndex=p.tracks.findIndex(track=>pinned.get(track.id)?.some(clip=>clip.id===selected));
  const transitionsByTrack=useMemo(()=>new Map(p.tracks.map(track=>[
    track.id,new Map(track.transitions?.map(transition=>[transition.to,transition])),
  ])),[p.tracks]);
  useLayoutEffect(()=>{
    const viewport=body.current;
    const lane=scroll.current?.querySelectorAll<HTMLElement>('.track-lane')[selectedTrackIndex];
    if(!viewport||!lane)return;
    const bounds=viewport.getBoundingClientRect();
    const row=lane.getBoundingClientRect();
    if(row.top<bounds.top)viewport.scrollTop+=row.top-bounds.top;
    else if(row.bottom>bounds.top+viewport.clientHeight)viewport.scrollTop+=row.bottom-bounds.top-viewport.clientHeight;
  },[selectedTrackIndex]);
  const [context, setContext] = useState<{ id?: string; x: number; y: number; trigger: HTMLButtonElement }>();
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!context) return;
    const {trigger}=context;
    (menu.current?.querySelector<HTMLElement>('button:not(:disabled)') ?? menu.current)?.focus();
    function outside(event: globalThis.PointerEvent) {
      if (!menu.current?.contains(event.target as Node) && !trigger.contains(event.target as Node)) setContext(undefined);
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
    const track=p.tracks.find(item=>item.clips.some(clip=>clip.id===id));
    const menuHeight=track?.kind==='video'&&track.role!=='titles'?114:48;
    select(id);
    setContext({
      id, trigger,
      x: Math.max(4, Math.min(event.clientX || bounds.left, window.innerWidth - 224)),
      y: Math.max(4, Math.min(event.clientY || bounds.bottom, window.innerHeight - menuHeight)),
    });
  }
  function openTrackMenu(trigger:HTMLButtonElement){
    if(context&&context.id===undefined){setContext(undefined);return;}
    const bounds=trigger.getBoundingClientRect();
    setContext({trigger,x:Math.max(4,Math.min(bounds.left,window.innerWidth-224)),
      y:Math.max(4,Math.min(bounds.bottom+4,window.innerHeight-90))});
  }
  const {width: viewportWidth}=useViewport(scroll);
  const seconds=Math.max(30,endTime(p)/SECOND+5);
  const width=Math.max(viewportWidth,seconds*zoom);
  const step=timelineTickStep(zoom);
  const windowLeft=Math.max(0,Math.min(scrollLeft,width-viewportWidth)-320);
  const windowRight=Math.min(width,windowLeft+viewportWidth+640);
  const firstTick=Math.max(0,Math.floor(windowLeft/(step*zoom)));
  const lastTick=Math.min(Math.floor((width-38)/(step*zoom)),Math.ceil(windowRight/(step*zoom)));
  function visibleClips(track:Track) {
    const clips=track.clips;
    const visible:Clip[]=[];
    for(let i=firstClipEndingAfter(clips,windowLeft/zoom*SECOND);i<clips.length&&
        clips[i].start<=windowRight/zoom*SECOND;i++)visible.push(clips[i]);
    for(const clip of pinned.get(track.id)??[]){
      if(!visible.includes(clip)){
        if(clip.start<windowLeft/zoom*SECOND)visible.unshift(clip);
        else visible.push(clip);
      }
    }
    return visible;
  }
  const zoomLabel=timelineZoomLabel(zoom);
  function fitTimeline(){
    if(!scroll.current?.clientWidth)return;
    setZoom(clampTimelineZoom((scroll.current.clientWidth-1)/seconds));
    scroll.current.scrollLeft=0;
  }
  function dragFade(event:PointerEvent<HTMLButtonElement>,handle:HTMLElement,clip:Clip,track:Track,edge:'in'|'out'){
    if(disabled||track.locked||event.button!==0)return;
    event.stopPropagation();
    event.preventDefault();
    select(clip.id);
    const key=edge==='in'?'fadeIn':'fadeOut';
    const initial=clip[key]??0;
    const origin=event.clientX;
    const initialScroll=scroll.current?.scrollLeft??0;
    const clipWidth=clip.duration/SECOND*zoom;
    let duration=initial;
    const move=(moveEvent:globalThis.PointerEvent)=>{
      const delta=moveEvent.clientX-origin+(scroll.current?.scrollLeft??0)-initialScroll;
      const target=initial+(edge==='in'?delta:-delta)/zoom*SECOND;
      duration=Math.round(Math.max(0,Math.min(clip.duration,target)));
      handle.style.setProperty('--fade-offset',`${Math.min(Math.max(0,clipWidth-12),duration/SECOND*zoom)}px`);
      handle.title=`${(duration/SECOND).toFixed(2)} s`;
    };
    const cleanup=()=>{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',finish);
      window.removeEventListener('pointercancel',cancel);
      handle.style.setProperty('--fade-offset',`${Math.min(Math.max(0,clipWidth-12),initial/SECOND*zoom)}px`);
      handle.title=`Fundido de ${edge==='in'?'entrada':'salida'} · ${(initial/SECOND).toFixed(2)} s`;
    };
    const finish=()=>{
      cleanup();
      if(duration!==initial)apply(project=>setClipProps(project,clip.id,{[key]:duration}));
    };
    const cancel=()=>cleanup();
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',finish,{once:true});
    window.addEventListener('pointercancel',cancel,{once:true});
  }
  function startDrag(event:PointerEvent<HTMLButtonElement>,clip:Clip,track:Track,mode:'move'|'left'|'right'){
    if(disabled||track.locked||event.button!==0)return;event.stopPropagation();select(clip.id);event.preventDefault();
    const el=event.currentTarget;const origin=event.clientX;const originY=event.clientY;const initialScroll=scroll.current?.scrollLeft??0;
    let targetTime=clip.start;let targetSource=clip.sourceIn;let targetDuration=clip.duration;let trackId=track.id;let changed=false;
    const points=[0,timeRef.current,...p.tracks.flatMap(t=>t.clips.filter(c=>c.id!==clip.id).flatMap(c=>[c.start,c.start+c.duration]))];
    const frame=frameToTime(1,p.settings.fps);
    const speed=clip.speed??1;
    const quantize=(n:number)=>frameToTime(timeToFrame(n,p.settings.fps),p.settings.fps);
    const onMove=(e:globalThis.PointerEvent)=>{
      let delta=Math.round((e.clientX-origin+(scroll.current?.scrollLeft??0)-initialScroll)/zoom*SECOND);
      const movedHorizontally=Math.abs(e.clientX-origin)>=3;
      const movedVertically=mode==='move'&&Math.abs(e.clientY-originY)>=3;
      if(!movedHorizontally&&!movedVertically&&!changed)return;
      changed=true;
      if(mode==='move'){
        let start=movedHorizontally?Math.max(0,quantize(clip.start+delta)):clip.start;if(magnet&&movedHorizontally){const a=snap(start,points,8/zoom*SECOND);start=a!==start?a:snap(start+clip.duration,points,8/zoom*SECOND)-clip.duration;}
        targetTime=Math.max(0,Math.round(start));el.style.left=`${targetTime/SECOND*zoom}px`;
        const under=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-track]');
        const target=p.tracks.find(t=>t.id===under?.dataset.track);trackId=target?.kind===track.kind&&target.role===track.role&&!target.locked?target.id:track.id;
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
      if(cancel||!changed||(mode==='move'&&targetTime===clip.start&&trackId===track.id))return;
      if(mode==='move')apply(d=>moveClip(d,clip.id,targetTime,trackId));
      else apply(d=>edit(d,draft=>{const t=draft.tracks.find(t=>t.id===track.id)!;const c=t.clips.find(c=>c.id===clip.id)!;c.start=targetTime;c.sourceIn=targetSource;c.duration=targetDuration;c.fadeIn=Math.min(c.fadeIn??0,c.duration);c.fadeOut=Math.min(c.fadeOut??0,c.duration);}));
    };
    const onUp=()=>finish();const onCancel=()=>finish(true);
    window.addEventListener('pointermove',onMove);window.addEventListener('pointerup',onUp,{once:true});window.addEventListener('pointercancel',onCancel,{once:true});
  }
  function scrub(e:PointerEvent<HTMLDivElement>){if(disabled)return;const el=e.currentTarget;el.setPointerCapture(e.pointerId);const update=(x:number)=>seek(Math.max(0,Math.round((x-el.getBoundingClientRect().left)/zoom*SECOND)));update(e.clientX);el.onpointermove=ev=>update(ev.clientX);el.onpointerup=()=>{el.onpointermove=null;el.onpointerup=null;};}
  const contextTrack=context?p.tracks.find(track=>track.clips.some(clip=>clip.id===context.id)):undefined;
  const visualContext=contextTrack?.kind==='video'&&contextTrack.role!=='titles';
  function renderClipMenu(clipId:string){
    return <>
      {visualContext&&(['front','back'] as const).map(direction=><button key={direction} role="menuitem"
        disabled={contextTrack?.locked} onClick={()=>{
          apply(project=>moveClipLayer(project,clipId,direction));
          setContext(undefined);
        }}>{direction==='front'?'Traer al frente':'Enviar al fondo'}</button>)}
      <button role="menuitem" disabled={!canSeparateAudio(clipId)} onClick={() => {
        onSeparateAudio(clipId);
        setContext(undefined);
        context?.trigger.focus();
      }}>Separar audio <kbd>Ctrl+Alt+S</kbd></button>
    </>;
  }
  return <section className="timeline" aria-label="Línea de tiempo">
    <div className="timeline-heading"><Film/><strong>Línea de tiempo</strong><span>{p.tracks.reduce((n,t)=>n+t.clips.length,0)} clips</span><span>{p.tracks.length}/{MAX_TRACKS} pistas</span><span className="timeline-project-info">{p.name} / {p.settings.fps} fps</span></div>
    <div className="timeline-toolbar"><div className="tool-group"><button title="Deshacer (Ctrl+Z)" aria-label="Deshacer" disabled={disabled||!h.past.length} onClick={undo}><Undo2/></button><button title="Rehacer (Ctrl+Shift+Z)" aria-label="Rehacer" disabled={disabled||!h.future.length} onClick={redo}><Redo2/></button><i/><button title="Dividir (S)" aria-label="Dividir clip" disabled={disabled||!selected} onClick={split}><Scissors/></button><button title="Eliminar (Supr)" aria-label="Eliminar clip" disabled={disabled||!selected} onClick={remove}><Trash2/></button><i/><button className={magnet?'active':''} title="Ajustar a bordes" aria-label="Activar imán" aria-pressed={magnet} onClick={()=>setMagnet(!magnet)}><Magnet/></button><span className="muted tiny magnet-label">Ajuste magnético</span><i/>
      <button className="labeled-tool" disabled={disabled} onClick={onTitle}><Type/> Texto</button>
      <button className="labeled-tool" disabled={disabled||!selected} onClick={()=>onTransition()}>Transición</button></div>
    <div className="tool-group"><span className="muted tiny">Zoom</span><button aria-label="Reducir zoom" onClick={()=>setZoom(stepTimelineZoom(zoom,-1))}><Minus/></button>
      <input aria-label="Zoom de línea de tiempo" aria-valuetext={zoomLabel} type="range" min="0" max="1000" value={zoomToSlider(zoom)} onChange={e=>setZoom(sliderToZoom(Number(e.target.value)))}/>
      <button aria-label="Aumentar zoom" onClick={()=>setZoom(stepTimelineZoom(zoom,1))}><Plus/></button><span className="zoom-label">{zoomLabel}</span>
      <button className="labeled-tool" title="Ajustar toda la línea de tiempo" onClick={fitTimeline}>Ver todo</button></div></div>
    <div className="timeline-body" ref={body}><div className="track-headers"><div className="ruler-label">PISTAS <button title="Añadir pista" aria-label="Añadir pista" aria-haspopup="menu"
      aria-expanded={!!context&&context.id===undefined} disabled={disabled||p.tracks.length>=MAX_TRACKS}
      onClick={event=>openTrackMenu(event.currentTarget)}><Plus size={14}/></button></div>
    {p.tracks.map(t=><div key={t.id} className={t.role==='titles'?'track-header text-track':'track-header'}><div className="track-name">{t.kind==='video'?<Film/>:<Music2/>}<span>{t.name}</span></div><div className="track-actions"><button disabled={disabled} aria-label={`${t.muted?'Activar':'Silenciar'} ${t.name}`} title="Silenciar pista" onClick={()=>apply(d=>edit(d,x=>{x.tracks.find(a=>a.id===t.id)!.muted=!t.muted;}))}>{t.muted?<VolumeX/>:<Volume2/>}</button><button disabled={disabled} aria-label={`${t.visible?'Ocultar':'Mostrar'} ${t.name}`} title="Visibilidad de pista" onClick={()=>apply(d=>edit(d,x=>{x.tracks.find(a=>a.id===t.id)!.visible=!t.visible;}))}>{t.visible?<Eye/>:<EyeOff/>}</button><button disabled={disabled} aria-label={`${t.locked?'Desbloquear':'Bloquear'} ${t.name}`} title="Bloquear pista" onClick={()=>apply(d=>edit(d,x=>{x.tracks.find(a=>a.id===t.id)!.locked=!t.locked;}))}>{t.locked?<LockKeyhole/>:<UnlockKeyhole/>}</button>
      <button className="track-remove" type="button" disabled={disabled||t.locked}
        aria-label={`Eliminar pista ${t.name}`} title={t.locked?'Desbloqueá la pista para eliminarla':'Eliminar pista'}
        onClick={()=>onDeleteTrack(t.id)}><Trash2/></button></div></div>)}
</div>
    <div className="timeline-scroll" ref={scroll} onScroll={e=>setScrollLeft(e.currentTarget.scrollLeft)} onWheel={e=>{if(e.ctrlKey){setZoom(stepTimelineZoom(zoom,e.deltaY>0?-1:1));}else if(e.shiftKey&&scroll.current)scroll.current.scrollLeft+=e.deltaY;}}><div className="timeline-content" style={{width}}>
      <div className="ruler" onPointerDown={scrub}>{p.markers?.filter(m=>m.time/SECOND*zoom>=windowLeft&&m.time/SECOND*zoom<=windowRight).map(m=><button className="timeline-marker" key={m.id} style={{left:m.time/SECOND*zoom}} title={m.name} aria-label={`Ir a ${m.name}`} onPointerDown={e=>e.stopPropagation()} onClick={()=>seek(m.time)}>◆</button>)}{Array.from({length:Math.max(0,lastTick-firstTick+1)},(_,i)=>{const tick=firstTick+i;return <span key={tick} style={{left:tick*step*zoom}}>{timelineTickLabel(tick*step,step)}</span>;})}</div>
      {p.tracks.map(t=>{const clips=visibleClips(t);return <div className={`track-lane ${!t.visible?'invisible-track':''} ${t.role==='titles'?'text-track':''}`} style={{backgroundSize:`${step*zoom}px 100%`}} key={t.id} data-track={t.id} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(disabled)return;const assetId=e.dataTransfer.getData('asset');const asset=p.assets[assetId];if(!asset)return;if(t.locked){message('La pista está bloqueada.');return;}const start=Math.max(0,Math.round((e.clientX-e.currentTarget.getBoundingClientRect().left)/zoom*SECOND));apply(d=>edit(d,x=>{const track=x.tracks.find(a=>a.id===t.id)!;track.clips.push({id:crypto.randomUUID(),assetId,start,duration:asset.duration,sourceIn:0,volume:1,opacity:1,scale:1,rotation:0});}));}} onClick={e=>{if(e.target===e.currentTarget&&!disabled){select();seek(Math.round((e.clientX-e.currentTarget.getBoundingClientRect().left)/zoom*SECOND));}}}>
      {clips.map(c=>{const asset=p.assets[c.assetId];const kind=c.audioOnly?'audio':asset.kind;const clipWidth=c.duration/SECOND*zoom;const name=c.title?(c.title.text.trim()||'Título'):asset.name;return <button key={c.id} className={`timeline-clip ${kind} ${selected===c.id?'selected':''} ${c.title?'title-clip':''} ${clipWidth<16?'compact-clip':''} ${!asset.generated&&!resources[asset.id]?'missing':''}`} style={{left:c.start/SECOND*zoom,width:clipWidth}} aria-label={c.audioOnly?`Clip de audio ${name}`:`Clip ${name}`} onFocus={()=>setFocusedClip(c.id)} onBlur={()=>setFocusedClip(undefined)} onContextMenu={e=>openContext(e,c.id)} onClick={e=>{e.stopPropagation();select(c.id);}} onPointerDown={e=>{
        const target=e.target as HTMLElement;
        const fade=target.dataset.fade;
        if(fade==='in'||fade==='out')dragFade(e,target,c,t,fade);
        else startDrag(e,c,t,target.dataset.edge==='left'?'left':target.dataset.edge==='right'?'right':'move');
      }}>
        <span className="trim-handle left" data-edge="left"/><span className="clip-name">{c.title?<Type size={12}/>:kind==='audio'?<Music2 size={12}/>:c.audioDetached?<VolumeX size={12}/>:<Film size={12}/>} {name}</span>{kind!=='audio'&&(resources[asset.id]?.videoPreview??resources[asset.id]?.thumbnail)&&<div className="clip-strip" style={{backgroundImage:`url("${resources[asset.id].videoPreview??resources[asset.id].thumbnail}")`}}/>}{kind==='audio'&&<span className="audio-clip-label">{c.audioOnly?'Audio separado':'Audio'}</span>}<span className="trim-handle right" data-edge="right"/>
        {kind==='audio'&&!disabled&&!t.locked&&(['in','out'] as const).map(edge=>{
          const duration=c[edge==='in'?'fadeIn':'fadeOut']??0;
          const title=`Fundido de ${edge==='in'?'entrada':'salida'} · ${(duration/SECOND).toFixed(2)} s`;
          const offset=Math.min(Math.max(0,clipWidth-12),duration/SECOND*zoom);
          const opposite=Math.min(Math.max(0,clipWidth-12),(c.fadeIn??0)/SECOND*zoom);
          const overlap=edge==='out'&&Math.abs(clipWidth-12-offset-opposite)<12;
          return <span key={edge} data-fade={edge} className={`audio-fade-handle fade-${edge}`} title={title}
            style={{'--fade-offset':`${offset}px`,top:overlap?12:undefined} as React.CSSProperties}/>;
        })}</button>;})}
      {clips.map(incoming=>{
        const transition=transitionsByTrack.get(t.id)?.get(incoming.id);
        const x=incoming.start/SECOND*zoom;
        if(!transition||x<windowLeft||x>windowRight)return null;
        const label={dissolve:'Disolvencia cruzada',wipe:'Barrido',dip:'Fundido a negro',flash:'Destello de luz'}[transition.kind];
        return <button key={transition.from} className="transition-cut" aria-label={`Editar transición de ${label.toLowerCase()}`} title={label}
          style={{left:incoming.start/SECOND*zoom,width:Math.max(18,transition.duration/SECOND*zoom)}}
          disabled={disabled||t.locked} onClick={event=>{event.stopPropagation();select(transition.from);onTransition(transition.from);}}/>;
      })}
      </div>;})}
      <div className="playhead" ref={playheadRef} style={{left:0}}><div/></div>
      {!p.tracks.some(t=>t.clips.length>0)&&<div className="timeline-empty">Arrastra tus medios aquí para empezar a contar tu historia</div>}
    </div></div></div><div className="timeline-footer"><span>Espacio <b>Reproducir</b> <em>·</em> S <b>Dividir</b> <em>·</em> Supr <b>Eliminar</b></span></div>
    {context && !disabled && <div className="editor-dropdown clip-context-menu" role="menu" aria-label={context.id?"Opciones del clip":"Añadir pista"}
      ref={menu} tabIndex={-1} style={{ left: context.x, top: context.y }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          setContext(undefined);
          context.trigger.focus();
        }
      }}>
      {context.id===undefined?<>{([
        ['Pista de video',addVideoTrack],
        ['Pista de audio',addAudioTrack],
      ] as const).map(([label,command])=><button type="button" role="menuitem" key={label}
        disabled={p.tracks.length>=MAX_TRACKS} onClick={()=>{
          apply(command);
          setContext(undefined);
          context.trigger.focus();
        }}>{label}</button>)}</>:renderClipMenu(context.id)}
    </div>}
  </section>;
}
