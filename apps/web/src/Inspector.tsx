import {SlidersHorizontal,Film,Info} from 'lucide-react';
import {findClip,moveClip,trimClip,setClipProps,SECOND,type Project} from '@corte/core';
import {useEditor} from './store';
import {Parameter,dbToGain,gainToDb} from './Controls';
import type {Compositor} from './engine';
export function Inspector({project:p,disabled,engine,onSeparateAudio,canSeparateAudio}:{project:Project;disabled:boolean;onSeparateAudio:()=>void;canSeparateAudio:boolean;engine:React.MutableRefObject<Compositor|undefined>}){
  const {selected,apply}=useEditor();const clip=selected?findClip(p,selected):undefined;const asset=clip?p.assets[clip.assetId]:undefined;
  const title = clip?.title;
  const kind = clip?.audioOnly ? 'audio' : asset?.kind;
  function updateTitle(changes: Partial<NonNullable<typeof title>>) {
    if (clip && title) apply(project => {
      const current = findClip(project, clip.id)?.title;
      return current ? setClipProps(project, clip.id, {title: {...current, ...changes}}) : project;
    });
  }
  const field=(label:string,value:number,update:(n:number)=>void,options:{min?:number;max?:number;step?:number}={})=><label className="property-field"><span>{label}</span><input key={`${selected}-${label}-${value}`} type="number" disabled={disabled} defaultValue={value} {...options} onBlur={e=>{const raw=e.target.value;const n=Number(raw);e.target.value=String(value);if(raw!==''&&n!==value)update(n);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>;
  return <aside className="inspector"><div className="panel-heading"><span><SlidersHorizontal size={15}/> Inspector</span><span className="tiny muted">{clip?'CLIP':'PROYECTO'}</span></div>
    {clip&&asset?<><div className="inspector-selection"><div className="file-icon"><Film/></div><div><strong>{asset.name}</strong><span>{title?'Texto editable':kind==='image'?'Imagen':kind==='audio'?'Audio':clip.audioDetached?'Video · Audio separado':'Video'}{!title&&' · '}{!title&&(kind!=='audio'&&asset.width?`${asset.width} × ${asset.height}`:'Estéreo / mono')}</span></div></div>
    {title && <fieldset disabled={disabled}><legend>TÍTULO</legend>
      <label className="title-text-field">Texto<textarea aria-label="Texto del título" rows={3} maxLength={1000}
        key={`${clip.id}:${title.text}`} defaultValue={title.text}
        onBlur={event => { if (event.currentTarget.value !== title.text) updateTitle({text: event.currentTarget.value}); }}/></label>
      <p className="hint">El texto se actualiza al salir del campo.</p>
      {field('Tamaño (px)',title.size,n=>updateTitle({size:n}),{min:12,max:500,step:1})}
      <label className="property-field">Color del texto<input type="color" value={title.color} onChange={event=>updateTitle({color:event.currentTarget.value})}/></label>
      {field('Posición horizontal (%)',title.x,n=>updateTitle({x:n}),{min:0,max:100,step:1})}
      {field('Posición vertical (%)',title.y,n=>updateTitle({y:n}),{min:0,max:100,step:1})}
      <label className="property-field">Negrita<input type="checkbox" checked={title.bold} onChange={event=>updateTitle({bold:event.currentTarget.checked})}/></label>
    </fieldset>}
    <fieldset disabled={disabled}><legend>TIEMPO</legend>{field('Inicio (s)',clip.start/SECOND,n=>apply(d=>moveClip(d,clip.id,Math.round(n*SECOND))),{min:0,step:0.1})}{!title&&field('Entrada del medio (s)',clip.sourceIn/SECOND,n=>apply(d=>trimClip(d,clip.id,Math.round(n*SECOND),clip.duration)),{min:0,step:0.1})}{field('Duración (s)',clip.duration/SECOND,n=>apply(d=>trimClip(d,clip.id,clip.sourceIn,Math.round(n*SECOND))),{min:1/p.settings.fps,step:0.1})}</fieldset>
    {kind!=='audio'&&<fieldset disabled={disabled}><legend>TRANSFORMACIÓN</legend>{field('Escala (%)',clip.scale*100,n=>apply(d=>setClipProps(d,clip.id,{scale:n/100})),{min:10,max:400,step:5})}{field('Rotación (°)',clip.rotation,n=>apply(d=>setClipProps(d,clip.id,{rotation:n})),{min:-360,max:360})}{field('Opacidad (%)',clip.opacity*100,n=>apply(d=>setClipProps(d,clip.id,{opacity:n/100})),{min:0,max:100})}</fieldset>}
    {kind!=='image'&&!clip.audioDetached&&<fieldset disabled={disabled}><legend>AUDIO DEL CLIP</legend>{kind==='video'&&<button type="button" className="button secondary" disabled={!canSeparateAudio} onClick={onSeparateAudio}>Separar audio</button>}<Parameter label="Volumen del clip" min={-60} max={6} step={.5} unit=" dB" value={gainToDb(clip.volume)} disabled={disabled} onPreview={db=>engine.current?.previewClipVolume(clip.id,db===undefined?undefined:dbToGain(db))} onCommit={db=>apply(d=>setClipProps(d,clip.id,{volume:dbToGain(db)}))}/><p className="hint">0 dB conserva el volumen original. Usa el mezclador para ajustar las pistas.</p></fieldset>}
    <fieldset disabled={disabled}><legend>FUNDIDOS DE IMAGEN Y AUDIO</legend>{field('Entrada (s)',(clip.fadeIn??0)/SECOND,n=>apply(d=>setClipProps(d,clip.id,{fadeIn:Math.round(n*SECOND)})),{min:0,max:clip.duration/SECOND,step:.1})}{field('Salida (s)',(clip.fadeOut??0)/SECOND,n=>apply(d=>setClipProps(d,clip.id,{fadeOut:Math.round(n*SECOND)})),{min:0,max:clip.duration/SECOND,step:.1})}</fieldset>
    </>:<><div className="project-card"><div className="project-format">{p.settings.width/p.settings.height>1.5?'16:9':p.settings.width/p.settings.height<1?'9:16':'1:1'}</div><strong>{p.name}</strong><span>{p.settings.width} × {p.settings.height} · {p.settings.fps} fps</span></div><div className="project-details"><span>Resolución <b>{p.settings.width} × {p.settings.height}</b></span><span>Fotogramas <b>{p.settings.fps} fps</b></span><span>Audio <b>48 kHz</b></span><span>Medios <b>{Object.values(p.assets).filter(asset=>!asset.generated).length} archivos</b></span></div><div className="inspector-tip"><Info size={17}/><p>Selecciona un clip en la línea de tiempo para ajustar su duración, imagen y sonido.</p></div></>}
  </aside>;
}
