import {useState} from 'react';
import type {TitlePreset} from '@corte/core';

const presets=[
  {id:'subtitle',label:'Diálogo de cine',sample:'Todo empieza con una historia.'},
  {id:'opening',label:'Título de apertura',sample:'Capítulo 1'},
  {id:'lowerThird',label:'Tercio inferior',sample:'Nombre de la persona'},
] as const;

export function TextPresets({insert}:{
  insert:(preset:TitlePreset,content?:{text:string;roleText?:string})=>void;
}){
  const [preset,setPreset]=useState<TitlePreset>('subtitle');
  const [drafts,setDrafts]=useState<Record<TitlePreset,string>>({
    subtitle:'',opening:'',lowerThird:'',
  });
  const [role,setRole]=useState('Cargo o ubicación');
  const selected=presets.find(item=>item.id===preset)!;
  const draft=drafts[preset];

  return <div className="text-presets">
    <div className="text-preset-grid" aria-label="Estilos de texto">
      {presets.map(item=><button className="text-preset" type="button" key={item.id}
        aria-pressed={item.id===preset} onClick={()=>setPreset(item.id)}>
        <span className={`text-preset-preview sample-${item.id}`} aria-hidden="true">
          {item.id==='lowerThird'?<span className="lower-third-sample">
            <strong>Andrea Pérez</strong><small>Directora</small>
          </span>:<span>{item.sample}</span>}
        </span>
        <span>{item.label}</span>
      </button>)}
    </div>
    <label className="dialog-field">{preset==='lowerThird'?'Nombre':'Texto'}
      <textarea rows={preset==='subtitle'?3:2} maxLength={preset==='lowerThird'?90:1000}
        placeholder={selected.sample} value={draft}
        onChange={event=>setDrafts({...drafts,[preset]:event.target.value})}/>
    </label>
    {preset==='lowerThird'&&<label className="dialog-field">Cargo o ubicación
      <input value={role} maxLength={90} onChange={event=>setRole(event.target.value)}/>
    </label>}
    <button className="button primary" type="button" onClick={()=>insert(preset,{
      text:draft.trim()||selected.sample,
      ...(preset==='lowerThird'?{roleText:role.trim()}:{}),
    })}>Insertar en el cursor</button>
  </div>;
}
