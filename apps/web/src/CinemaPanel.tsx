import {useEffect} from 'react';
import {CINEMA_RATIOS,DEFAULT_CINEMA,DEFAULT_GRADE,cinemaHeight,edit,type CinemaGrade,type CinemaSettings,type Project} from '@corte/core';
import {Parameter} from './Controls';
import {useEditor} from './store';
import {CinemaScopes} from './CinemaScopes';
import {cinemaPresets} from './cinemaPresets';

export type CinemaGuide = 'none'|'thirds'|'center'|'safe';
const gradeFields=[
  {key:'exposure',label:'Exposición',min:-3,max:3,step:.1,unit:' EV'},
  {key:'contrast',label:'Contraste',min:.5,max:1.5,step:.01},
  {key:'saturation',label:'Saturación',min:0,max:2,step:.01},
  {key:'temperature',label:'Temperatura',min:-100,max:100,step:1},
  {key:'tint',label:'Tinte',min:-100,max:100,step:1},
] as const;
const gradeChannels=[
  {key:'lift',label:'Sombras',min:-.1,max:.1},
  {key:'gamma',label:'Tonos medios',min:.8,max:1.2},
  {key:'gain',label:'Luces',min:.8,max:1.2},
] as const;


function useCinema(project:Project){
  const {apply}=useEditor();
  const settings=project.settings.cinema??DEFAULT_CINEMA;
  const update=(values:Partial<CinemaSettings>)=>apply(project=>edit(project,draft=>{
    draft.settings.cinema={...DEFAULT_CINEMA,...draft.settings.cinema,...values};
  }));
  return {settings,update};
}

export function CinemaPanel({project,disabled,onPreview}:{
  project:Project;disabled:boolean;onPreview:(value?:CinemaSettings)=>void;
}){
  const {settings,update}=useCinema(project);
  useEffect(()=>()=>onPreview(),[onPreview,project,disabled]);
  const preview=(values:Partial<CinemaSettings>)=>{if(!disabled)onPreview({...settings,...values});};
  const commit=(values:Partial<CinemaSettings>)=>{onPreview();update(values);};
  const interaction=(values:Partial<CinemaSettings>)=>({
    onPointerEnter:()=>preview(values), onPointerLeave:()=>onPreview(),
    onFocus:()=>preview(values), onBlur:()=>onPreview(),
    onClick:()=>commit(values),
  });
  const neutral={look:'neutral',grade:undefined,intensity:1,grain:0,vignette:0,lightLeak:0} as const;
  return <div className="cinema-panel">
    <fieldset disabled={disabled}>
      <legend>Looks cinematográficos · todo el proyecto</legend>
      <p className="hint">Pasa el cursor o enfoca un look para previsualizarlo. Haz clic para aplicarlo.</p>
      <div className="filter-options">
        <button type="button" aria-pressed={settings.look==='neutral'&&!settings.grade} {...interaction(neutral)}>Sin look</button>
        {cinemaPresets.map(preset=><button key={preset.settings.look} type="button" aria-pressed={settings.look===preset.settings.look}
          {...interaction(preset.settings)}>{preset.label}</button>)}
        <button type="button" aria-pressed={settings.look==='clean'} {...interaction({...neutral,look:'clean',vignette:.16})}>Cine limpio</button>
      </div>
      <Parameter label="Intensidad del look" min={0} max={100} unit=" %" value={settings.intensity*100}
        onPreview={value=>value===undefined?onPreview():preview({intensity:value/100})} onCommit={value=>commit({intensity:value/100})}/>
      <Parameter label="Grano" min={0} max={100} unit=" %" value={settings.grain*100} onCommit={value=>commit({grain:value/100})}/>
      <Parameter label="Viñeta" min={0} max={100} unit=" %" value={settings.vignette*100} onCommit={value=>commit({vignette:value/100})}/>
      <Parameter label="Fuga de luz" min={0} max={100} unit=" %" value={settings.lightLeak*100} onCommit={value=>commit({lightLeak:value/100})}/>
    </fieldset>
    <fieldset disabled={disabled}>
      <legend>Bloom · todo el proyecto</legend>
      <p className="hint">Añade un halo a las altas luces y se puede combinar con cualquier look.</p>
      <div className="filter-options">
        <button type="button" aria-pressed={!!settings.bloom} {...interaction({bloom:settings.bloom?0:.25})}>
          {settings.bloom?'Quitar Bloom':'Activar Bloom'}
        </button>
      </div>
      <Parameter label="Intensidad de Bloom" min={0} max={100} unit=" %" value={(settings.bloom??0)*100}
        onPreview={value=>value===undefined?onPreview():preview({bloom:value/100})} onCommit={value=>commit({bloom:value/100})}/>
    </fieldset>
  </div>;
}

export function CinemaFraming({project,guide,setGuide,disabled}:{
  project:Project;guide:CinemaGuide;setGuide:(value:CinemaGuide)=>void;disabled:boolean;
}){
  const {settings,update}=useCinema(project);
  const {width,height}=project.settings;
  const visible=cinemaHeight(width,height,settings.ratio);
  return <fieldset disabled={disabled}>
      <legend>Encuadre del proyecto</legend>
      <label className="property-field">Relación de aspecto
        <select value={settings.ratio} onChange={event=>update({ratio:Number(event.target.value) as CinemaSettings['ratio']})}>
          <option value={0}>Original</option>
          {CINEMA_RATIOS.map(ratio=><option value={ratio} key={ratio}>{ratio.toFixed(2)}:1</option>)}
        </select>
      </label>
      <label className="property-field">Salida en formato original
        <select disabled={!settings.ratio} value={settings.framing} onChange={event=>update({framing:event.target.value as CinemaSettings['framing']})}>
          <option value="bars">Barras sobre la imagen</option>
          <option value="crop">Recorte panorámico</option>
        </select>
      </label>
      {settings.ratio>0&&<p className="hint">{visible<height
        ? `Área visible del proyecto: ${width} × ${visible} px.`
        : 'El cuadro ya es igual o más ancho que la relación elegida.'}</p>}
      <label className="property-field">Guías del visor
        <select value={guide} onChange={event=>setGuide(event.target.value as CinemaGuide)}>
          <option value="none">Ocultas</option><option value="thirds">Tercios</option>
          <option value="center">Centro</option><option value="safe">Márgenes seguros</option>
        </select>
      </label>
    </fieldset>;
}

export function CinemaCorrection({project,source,disabled}:{
  project:Project;source:React.RefObject<HTMLCanvasElement>;disabled:boolean;
}){
  const {settings,update}=useCinema(project);
  const grade=settings.grade??DEFAULT_GRADE;
  const updateGrade=(values:Partial<CinemaGrade>)=>update({grade:{...grade,...values}});
  return <details className="inspector-grade">
        <summary>Corrección de color del proyecto</summary><fieldset disabled={disabled}>
        {gradeFields.map(({key,...field})=><Parameter key={key} {...field}
          value={grade[key]} onCommit={value=>updateGrade({[key]:value})}/>)}
        {gradeChannels.map(({key,label,min,max})=><fieldset key={key}>
          <legend>{label}</legend>
          {['Rojo','Verde','Azul'].map((channel,index)=><Parameter key={channel} label={channel}
            min={min} max={max} step={.01} value={grade[key][index]} onCommit={value=>{
              const channels=[...grade[key]] as CinemaGrade[typeof key];
              channels[index]=value;
              updateGrade({[key]:channels});
            }}/>)}
        </fieldset>)}
      </fieldset><CinemaScopes source={source}/></details>;
}

export function CinemaGuides({guide,project}:{guide:CinemaGuide;project:Project}){
  if(guide==='none')return null;
  const {width,height,cinema}=project.settings;
  const visible=cinemaHeight(width,height,cinema?.ratio??0);
  const top=Math.floor((height-visible)/2);
  return <svg className="cinema-guides" aria-hidden="true" viewBox={`0 0 ${width} ${visible}`}
    preserveAspectRatio="none" style={{top:`${top/height*100}%`,height:`${visible/height*100}%`}}>
    {guide==='thirds'&&<path vectorEffect="non-scaling-stroke" d={`M ${width/3} 0 V ${visible} M ${width*2/3} 0 V ${visible} M 0 ${visible/3} H ${width} M 0 ${visible*2/3} H ${width}`}/>}
    {guide==='center'&&<path vectorEffect="non-scaling-stroke" d={`M ${width*.47} ${visible/2} H ${width*.53} M ${width/2} ${visible*.45} V ${visible*.55}`}/>}
    {guide==='safe'&&[.05,.1].map(margin=><rect key={margin} vectorEffect="non-scaling-stroke" x={width*margin} y={visible*margin}
      width={width*(1-2*margin)} height={visible*(1-2*margin)}/>)}
  </svg>;
}
