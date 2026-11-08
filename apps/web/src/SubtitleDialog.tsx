import {useEffect,useRef,useState} from 'react';
import {addSubtitles,type Project} from '@corte/core';
import type {MediaResource} from './media';
import {speechClips,transcribeTrack} from './subtitleSpeech';
import {missingSubtitleCues} from './subtitleTiming';
import {useEditor} from './store';

export function SubtitleDialog({project,selected,resources,onClose,onGenerated}:{
  project:Project;
  selected?:string;
  resources:Record<string,MediaResource>;
  onClose:()=>void;
  onGenerated:(message:string)=>void;
}){
  const speech=window.atlasfxSpeech;
  const tracks=project.tracks.filter(track=>track.visible&&speechClips(project,track).length>0);
  const preferred=tracks.find(track=>track.clips.some(clip=>clip.id===selected))
    ??tracks.find(track=>track.id===project.settings.audioMix?.voiceTrackId)
    ??tracks[0];
  const [trackId,setTrackId]=useState(preferred?.id??'');
  const [languages,setLanguages]=useState<{id:string;label:string}[]>([]);
  const [language,setLanguage]=useState('');
  const [loading,setLoading]=useState(!!speech);
  const [error,setError]=useState('');
  const [status,setStatus]=useState('');
  const controller=useRef<AbortController>();
  const languageRequest=useRef<ReturnType<NonNullable<typeof speech>['languages']>>();
  const track=tracks.find(item=>item.id===trackId);

  useEffect(()=>{
    if(!speech)return;
    let active=true;
    languageRequest.current??=speech.languages();
    void languageRequest.current.then(available=>{
      if(!active)return;
      setLanguages(available);
      setLanguage(available.find(item=>item.id.startsWith('es-'))?.id??available[0]?.id??'');
    }).catch(()=>{
      if(active)setError('No se pudo abrir el reconocimiento de voz de Windows.');
    }).finally(()=>{if(active)setLoading(false);});
    return ()=>{
      active=false;
      controller.current?.abort();
    };
  },[speech]);

  async function generate(){
    if(!track||!language||controller.current)return;
    const request=new AbortController();
    controller.current=request;
    setError('');
    setStatus('Preparando la pista de voz…');
    try{
      const {cues,skipped}=await transcribeTrack(project,track,resources,language,request.signal,
        (index,total,fraction)=>setStatus(`Procesando tramo ${index} de ${total} · ${Math.round(fraction*100)} %`));
      request.signal.throwIfAborted();
      const current=useEditor.getState().h.present;
      if(current!==project)throw new Error('El proyecto cambió. Volvé a abrir la herramienta y probá de nuevo.');
      const missing=missingSubtitleCues(current,cues);
      const warning=skipped.length?` Medios que no se pudieron leer: ${skipped.join(', ')}.`:'';
      if(!missing.length){
        setError((cues.length?'Los subtítulos existentes ya cubren las frases reconocidas.':
          'Windows no reconoció voz en esta pista. Revisá el idioma y elegí la pista que contiene el diálogo.')+warning);
        return;
      }
      const updated=addSubtitles(current,missing);
      useEditor.getState().apply(()=>updated);
      onGenerated(`Se añadieron ${missing.length} subtítulos.${warning}`);
    }catch(problem){
      if(!request.signal.aborted)setError(problem instanceof Error?problem.message:'No se pudo generar el subtitulado.');
    }finally{
      controller.current=undefined;
      if(!request.signal.aborted)setStatus('');
    }
  }

  return <div className="modal-backdrop">
    <form className="modal workspace-dialog project-settings" role="dialog" aria-modal="true" aria-labelledby="auto-subtitle-title"
      onSubmit={event=>{event.preventDefault();void generate();}}
      onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onClose();}}}>
      <h2 id="auto-subtitle-title">Subtítulos automáticos</h2>
      <p className="hint">AtlasFX usa el reconocimiento local de Windows para recorrer todos los clips de la pista elegida y completar los tramos sin subtítulos.</p>
      <fieldset disabled={!!status}>
        <label className="dialog-field">Pista de voz
          <select value={trackId} onChange={event=>setTrackId(event.target.value)}>
            {!tracks.length&&<option value="">No hay clips con audio</option>}
            {tracks.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="dialog-field">Idioma de la voz
          <select value={language} disabled={loading||!languages.length} onChange={event=>setLanguage(event.target.value)}>
            {!languages.length&&<option value="">{loading?'Buscando idiomas…':'Sin idiomas disponibles'}</option>}
            {languages.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </fieldset>
      {!speech&&<p role="status">Abrí la aplicación de escritorio de AtlasFX en Windows.</p>}
      {speech&&!loading&&!languages.length&&!error&&<p role="status">Instalá el reconocimiento de voz de escritorio para tu idioma en Windows.</p>}
      {status&&<p role="status">{status}</p>}
      {error&&<p role="alert">{error}</p>}
      <div className="modal-actions">
        <button autoFocus type="button" className="button secondary" onClick={onClose}>{status?'Cancelar':'Cerrar'}</button>
        <button type="submit" className="button primary" disabled={!track||!language||!!status}>Generar subtítulos</button>
      </div>
    </form>
  </div>;
}
