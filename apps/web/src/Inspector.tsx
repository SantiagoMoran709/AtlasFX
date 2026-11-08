import {ColorPanel} from './ColorPanel';
import {CinemaCorrection} from './CinemaPanel';
import {SlidersHorizontal,Film,Info} from 'lucide-react';
import {findClip,moveClip,trimClip,setClipProps,SECOND,TITLE_FONTS,type Project} from '@corte/core';
import {useEditor} from './store';
import {Parameter,dbToGain,gainToDb} from './Controls';
import type {Compositor} from './engine';
export function Inspector({project:p,disabled,engine,onSeparateAudio,canSeparateAudio,canvas,transformOnly=false}:{project:Project;disabled:boolean;canvas:React.RefObject<HTMLCanvasElement>;transformOnly?:boolean;onSeparateAudio:()=>void;canSeparateAudio:boolean;engine:React.MutableRefObject<Compositor|undefined>}){
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
  if(transformOnly)return <aside className="inspector transform-panel">
    <div className="panel-heading"><span><SlidersHorizontal size={15}/> Transformación del clip</span></div>
    {clip&&asset&&kind!=='audio'?<fieldset disabled={disabled}><legend>TRANSFORMACIÓN</legend>
      {!title&&<>
        {field('Posición horizontal (%)',clip.x??50,n=>apply(d=>setClipProps(d,clip.id,{x:n})),{min:0,max:100,step:1})}
        {field('Posición vertical (%)',clip.y??50,n=>apply(d=>setClipProps(d,clip.id,{y:n})),{min:0,max:100,step:1})}
        {field('Ancho (%)',(clip.scaleX??1)*100,n=>apply(d=>setClipProps(d,clip.id,{scaleX:n/100})),{min:10,max:400,step:5})}
        {field('Alto (%)',(clip.scaleY??1)*100,n=>apply(d=>setClipProps(d,clip.id,{scaleY:n/100})),{min:10,max:400,step:5})}
      </>}{field('Escala (%)',clip.scale*100,n=>apply(d=>setClipProps(d,clip.id,{scale:n/100})),{min:10,max:400,step:5})}{field('Rotación (°)',clip.rotation,n=>apply(d=>setClipProps(d,clip.id,{rotation:n})),{min:-360,max:360})}{field('Opacidad (%)',clip.opacity*100,n=>apply(d=>setClipProps(d,clip.id,{opacity:n/100})),{min:0,max:100})}</fieldset>:<p className="hint">Selecciona un clip visual para cambiar su escala, posición o rotación.</p>}
  </aside>;
  return <aside className="inspector"><div className="panel-heading"><span><SlidersHorizontal size={15}/> Inspector</span><span className="tiny muted">{clip?'CLIP':'PROYECTO'}</span></div>
    {clip&&asset?<><div className="inspector-selection"><div className="file-icon"><Film/></div><div><strong>{asset.name}</strong><span>{title?'Texto editable':kind==='image'?'Imagen':kind==='audio'?'Audio':clip.audioDetached?'Video · Audio separado':'Video'}{!title&&' · '}{!title&&(kind!=='audio'&&asset.width?`${asset.width} × ${asset.height}`:'Estéreo / mono')}</span></div></div>
    {title && <fieldset disabled={disabled}><legend>{title.preset==='lowerThird'?'TERCIO INFERIOR':title.outline?'SUBTÍTULO':'TÍTULO'}</legend>
      <label className="title-text-field">{title.preset==='lowerThird'?'Nombre':'Texto'}
        <textarea aria-label={title.preset==='lowerThird'?'Nombre del tercio inferior':title.outline?'Texto del subtítulo':'Texto del título'}
          rows={title.preset==='lowerThird'?2:3} maxLength={title.preset==='lowerThird'?90:1000}
          key={`${clip.id}:${title.text}`} defaultValue={title.text}
          onBlur={event => { if (event.currentTarget.value !== title.text) updateTitle({text: event.currentTarget.value}); }}/>
      </label>
      {title.preset==='lowerThird'&&<label className="title-text-field">Cargo o ubicación
        <input maxLength={90} key={`${clip.id}:${title.roleText}`} defaultValue={title.roleText}
          onBlur={event=>{if(event.currentTarget.value!==(title.roleText??''))updateTitle({roleText:event.currentTarget.value});}}/>
      </label>}
      {title.preset==='subtitle'&&<label className="property-field">Fondo negro translúcido
        <input type="checkbox" checked={title.background??false}
          onChange={event=>updateTitle({background:event.currentTarget.checked})}/>
      </label>}
      <p className="hint">El texto se actualiza al salir del campo.</p>
      <label className="property-field">Tipo de letra
        <select value={title.font ?? ''} onChange={event=>updateTitle({font:TITLE_FONTS.find(font=>font===event.target.value)})}>
          <option value="">Predeterminada</option>
          {TITLE_FONTS.map(font=><option key={font}>{font}</option>)}
        </select>
      </label>
      {field('Tamaño (px)',title.size,n=>updateTitle({size:n}),{min:12,max:500,step:1})}
      <label className="property-field">Color del texto<input type="color" value={title.color} onChange={event=>updateTitle({color:event.currentTarget.value})}/></label>
      {field('Posición horizontal (%)',title.x,n=>updateTitle({x:n}),{min:0,max:100,step:1})}
      {field('Posición vertical (%)',title.y,n=>updateTitle({y:n}),{min:0,max:100,step:1})}
      <label className="property-field">Negrita<input type="checkbox" checked={title.bold} onChange={event=>updateTitle({bold:event.currentTarget.checked})}/></label>
    </fieldset>}
    <fieldset disabled={disabled}><legend>TIEMPO</legend>{field('Inicio (s)',clip.start/SECOND,n=>apply(d=>moveClip(d,clip.id,Math.round(n*SECOND))),{min:0,step:0.1})}{!title&&field('Entrada del medio (s)',clip.sourceIn/SECOND,n=>apply(d=>trimClip(d,clip.id,Math.round(n*SECOND),clip.duration)),{min:0,step:0.1})}{field('Duración (s)',clip.duration/SECOND,n=>apply(d=>trimClip(d,clip.id,clip.sourceIn,Math.round(n*SECOND))),{min:1/p.settings.fps,step:0.1})}</fieldset>
    {kind!=='image'&&!clip.audioDetached&&<fieldset disabled={disabled}><legend>AUDIO DEL CLIP</legend>{kind==='video'&&<button type="button" className="button secondary" disabled={!canSeparateAudio} onClick={onSeparateAudio}>Separar audio</button>}<Parameter label="Volumen del clip" min={-60} max={6} step={.5} unit=" dB" value={gainToDb(clip.volume)} disabled={disabled} onPreview={db=>engine.current?.previewClipVolume(clip.id,db===undefined?undefined:dbToGain(db))} onCommit={db=>apply(d=>setClipProps(d,clip.id,{volume:dbToGain(db)}))}/><p className="hint">0 dB conserva el volumen original. Usa el mezclador para ajustar las pistas.</p></fieldset>}
    <fieldset disabled={disabled}><legend>FUNDIDOS DE IMAGEN Y AUDIO</legend>{field('Entrada (s)',(clip.fadeIn??0)/SECOND,n=>apply(d=>setClipProps(d,clip.id,{fadeIn:Math.round(n*SECOND)})),{min:0,max:clip.duration/SECOND,step:.1})}{field('Salida (s)',(clip.fadeOut??0)/SECOND,n=>apply(d=>setClipProps(d,clip.id,{fadeOut:Math.round(n*SECOND)})),{min:0,max:clip.duration/SECOND,step:.1})}</fieldset>
    </>:<><div className="project-card"><div className="project-format">{p.settings.width/p.settings.height>1.5?'16:9':p.settings.width/p.settings.height<1?'9:16':'1:1'}</div><strong>{p.name}</strong><span>{p.settings.width} × {p.settings.height} · {p.settings.fps} fps</span></div><div className="project-details"><span>Resolución <b>{p.settings.width} × {p.settings.height}</b></span><span>Fotogramas <b>{p.settings.fps} fps</b></span><span>Audio <b>48 kHz</b></span><span>Medios <b>{Object.values(p.assets).filter(asset=>!asset.generated).length} archivos</b></span></div><div className="inspector-tip"><Info size={17}/><p>Selecciona un clip en la línea de tiempo para ajustar su duración, imagen y sonido.</p></div></>}
    <ColorPanel project={p} canvas={canvas} disabled={disabled}/>
    <CinemaCorrection project={p} source={canvas} disabled={disabled}/>
  </aside>;
}
