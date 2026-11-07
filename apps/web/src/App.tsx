import {useCallback,useEffect,useRef,useState} from 'react';
import {Film,Music2,Image as ImageIcon,FolderOpen,Upload,Plus,Play,Pause,SkipBack,SkipForward,Maximize,Download,ChevronRight,Search,Save,House,X,Check,LoaderCircle,Clapperboard,Link2,AlertCircle,Volume2,VolumeX} from 'lucide-react';
import {createProject,createClip,addTitle,canDetachAudio,detachAudio,addClip,createTrack,edit,findClip,splitClip,deleteClip,endTime,parseProject,serialize,SECOND,frameToTime,timeToFrame,duplicateClip,rippleDelete,closeGaps,trimAt,joinNext,copyClip,pasteClip,moveClip,trimClip,setClipProps,uid,type Clip,type ClipClipboard,type Project,type Kind} from '@corte/core';
import {Timeline,timecode} from './Timeline';
import {DEFAULT_TIMELINE_ZOOM,stepTimelineZoom} from './timelineZoom';
import {Inspector} from './Inspector';
import {TransitionDialog} from './TransitionDialog';
import {AudioMixer,MasterMeter} from './AudioMixer';
import {ColorPanel} from './ColorPanel';
import {CinemaPanel,CinemaGuides,type CinemaGuide} from './CinemaPanel';
import {ChromaControls} from './ChromaControls';
import {MenuBar,type EditorMenu} from './MenuBar';
import {WorkspaceDialog,type DialogMode} from './WorkspaceDialog';
import {ContentTools,CONTENT_SECTIONS,makeGraphic,type ContentSection,type Graphic,type Placement} from './ContentTools';
import {useViewport} from './useViewport';
import {WorkspaceDivider} from './WorkspaceDivider';
import {SourceMonitor} from './SourceMonitor';
import {ProjectBrowser} from './ProjectBrowser';
import {loadViewPreferences,saveViewPreferences} from './preferences';
import {useEditor} from './store';
import {importMedia,type MediaResource} from './media';
import {Compositor} from './engine';
import * as storage from './storage';
import {exportVideo,formats} from './exporter';
import {RenderPreview,type RenderReview} from './RenderPreview';

const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
const resolutionOptions=[{label:'1080p · Full HD',width:1920,height:1080},{label:'720p · HD',width:1280,height:720},{label:'480p · Compacto',width:854,height:480}];
export function App(){
  const {h,selected,select,apply,undo,redo,open,message,error}=useEditor();const p=h.present;
  const [resources,setResources]=useState<Record<string,MediaResource>>({});const [playing,setPlaying]=useState(false);const [zoom,setZoom]=useState(DEFAULT_TIMELINE_ZOOM);
  const [tab,setTab]=useState<'all'|Kind>('all');const [query,setQuery]=useState('');const [busy,setBusy]=useState(false);const [saved,setSaved]=useState('Guardando…');const [initialized,setInitialized]=useState(false);
  const [home,setHome]=useState(true);const [createOnHome,setCreateOnHome]=useState(false);const [recent,setRecent]=useState<Project[]>([]);const [exportOpen,setExportOpen]=useState(false);const [progress,setProgress]=useState<number|null>(null);
  const [exportResolution,setExportResolution]=useState(0);const [exportFps,setExportFps]=useState(30);const [exportQuality,setExportQuality]=useState(12_000_000);const [exportFormat,setExportFormat]=useState(0);
  const [renderReview,setRenderReview]=useState<RenderReview>();
  const [exportNotice,setExportNotice]=useState('');const [exportName,setExportName]=useState(p.name);const [success,setSuccess]=useState('');
  const [transitionSelection,setTransitionSelection]=useState<string>();
  const [sourceId,setSourceId]=useState<string>();const [libraryVisible,setLibraryVisible]=useState(true);const [dualView,setDualView]=useState(()=>loadViewPreferences().dualMonitor);
  const importedAssets=Object.values(p.assets).filter(asset=>!asset.generated);
  const sourceAsset=p.assets[sourceId??'']??importedAssets[0];
  const previousMonitorGain=useRef(1);const [viewerZoom,setViewerZoom]=useState<'fit'|number>('fit');const [monitorGain,setMonitorGain]=useState(1);const [dockTab,setDockTab]=useState<'inspector'|'audio'|'color'|'chroma'|'cinema'>('inspector');const [cinemaGuide,setCinemaGuide]=useState<CinemaGuide>('none');const [metersVisible,setMetersVisible]=useState(true);const [workspaceDialog,setWorkspaceDialog]=useState<DialogMode>();
  const [contentSection,setContentSection]=useState<ContentSection>();const [looping,setLooping]=useState(false);const [hasClipboard,setHasClipboard]=useState(false);const clipboard=useRef<ClipClipboard>();
  const fileInput=useRef<HTMLInputElement>(null);const projectInput=useRef<HTMLInputElement>(null);const relinkInput=useRef<HTMLInputElement>(null);const relinkId=useRef<string>();
  const canvas=useRef<HTMLCanvasElement>(null);const playerWrap=useRef<HTMLDivElement>(null);const lowerWorkspace=useRef<HTMLDivElement>(null);const playhead=useRef<HTMLDivElement>(null);const timeLabel=useRef<HTMLSpanElement>(null);
  const viewportSize=useViewport(playerWrap);
  const fitViewer=viewerZoom==='fit';
  const canvasScale=fitViewer?Math.min(viewportSize.width/p.settings.width,viewportSize.height/p.settings.height):viewerZoom;
  const displaySize={width:p.settings.width*canvasScale,height:p.settings.height*canvasScale};
  const timeRef=useRef(0);const stateRef=useRef({p,resources,playing,zoom,monitorGain,looping,exportOpen});stateRef.current={p,resources,playing,zoom,monitorGain,looping,exportOpen};const engine=useRef<Compositor>();const abort=useRef<AbortController>();const generation=useRef(0);const booted=useRef(false);const saveQueue=useRef<Promise<unknown>>(Promise.resolve());
  const availableFormats=formats();const duration=endTime(p);const clip=selected?findClip(p,selected):undefined;
  const keyedClip=clip&&!clip.audioOnly&&p.assets[clip.assetId].kind!=='audio'&&!p.assets[clip.assetId].generated?clip:undefined;
  const seek=useCallback((at:number)=>{setPlaying(false);timeRef.current=Math.max(0,Math.min(endTime(stateRef.current.p),Math.round(at)));},[]);
  const stop=useCallback(()=>setPlaying(false),[]);
  const toggle=useCallback(()=>{if(progress!==null)return;if(!endTime(stateRef.current.p)){message('Agrega un medio a la línea de tiempo para reproducir.');return;}if(timeRef.current>=endTime(stateRef.current.p))timeRef.current=0;void engine.current?.startPreviewAudio().catch(e=>message(errorText(e)));setPlaying(v=>!v);},[progress,message]);
  const split=useCallback(()=>{stop();const s=useEditor.getState();if(s.selected)s.apply(d=>splitClip(d,s.selected!,timeRef.current));},[stop]);
  const remove=useCallback(()=>{stop();const s=useEditor.getState();if(s.selected){s.apply(d=>deleteClip(d,s.selected!));s.select();}},[stop]);
  const saveFile=useCallback(()=>{try{storage.download(new Blob([serialize(stateRef.current.p)],{type:'application/json'}),`${stateRef.current.p.name}.vedit`);setSuccess('Proyecto .vedit guardado.');}catch(e){message(errorText(e));}},[message]);
  async function refreshRecent(){try{setRecent(await storage.listProjects());}catch(e){message(`No se pudo leer el almacenamiento: ${errorText(e)}`);}}
  async function loadProject(next:Project,showEditor=true){
    stop();const gen=++generation.current;open(next);seek(0);setResources({});if(showEditor){setHome(false);setCreateOnHome(false);}setBusy(true);
    try{const loaded:Record<string,MediaResource>={};for(const a of Object.values(next.assets)){if(a.generated)continue;const blob=await storage.loadMedia(a.id);if(gen!==generation.current)return;if(blob){try{const media=await importMedia(new File([blob],a.name,{type:a.mime||blob.type}));loaded[a.id]=media.resource;}catch{/* Missing media can be relinked from the library. */}}}if(gen===generation.current)setResources(loaded);
    }catch(e){message(errorText(e));}finally{if(gen===generation.current)setBusy(false);}
  }
  useEffect(()=>{
    if(booted.current)return;booted.current=true;
    void storage.listProjects().then(async projects=>{setRecent(projects);if(projects.length){await loadProject(projects[0],false);setHome(true);}}).catch(e=>message(`No se pudieron cargar los proyectos: ${errorText(e)}`)).finally(()=>setInitialized(true));
  },[message]);
  useEffect(()=>{
    if(!initialized||(home&&!recent.some(r=>r.id===p.id)))return;
    setSaved('Guardando…');let canceled=false;
    const timer=setTimeout(()=>{saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>storage.saveProject(p)).then(()=>{if(!canceled)setSaved('Guardado');}).catch(e=>{if(!canceled){setSaved('Sin guardar');message(`No se pudo guardar: ${errorText(e)}`);}});},600);
    return()=>{canceled=true;clearTimeout(timer);};
  },[p,message,initialized,home,recent]);
  const previousResources=useRef<Record<string,MediaResource>>({});
  useEffect(()=>{for(const [id,r] of Object.entries(previousResources.current)){if(resources[id]?.url!==r.url)URL.revokeObjectURL(r.url);}previousResources.current=resources;},[resources]);
  useEffect(()=>{if(!canvas.current)return;engine.current=new Compositor(canvas.current,message);let frame=0;let last=performance.now();let lastAudio:number|undefined;let exportWasOpen=false;
    const tick=(now:number)=>{const s=stateRef.current;const dt=now-last;last=now;
      if(s.exportOpen&&exportWasOpen){frame=requestAnimationFrame(tick);return;}
      exportWasOpen=s.exportOpen;
      const end=endTime(s.p);
      const clock=engine.current?.audioClock();const elapsed=s.playing&&clock!==undefined&&lastAudio!==undefined?Math.max(0,clock-lastAudio)*1000:dt;lastAudio=s.playing?clock:undefined;
      if(s.playing){timeRef.current=Math.min(end,timeRef.current+Math.round(elapsed*1000));if(timeRef.current>=end){if(s.looping&&end>0)timeRef.current=0;else setPlaying(false);}}else if(timeRef.current>end)timeRef.current=end;
      if(canvas.current&&(canvas.current.width!==s.p.settings.width||canvas.current.height!==s.p.settings.height)){canvas.current.width=s.p.settings.width;canvas.current.height=s.p.settings.height;}
      engine.current?.monitorVolume(s.monitorGain);engine.current?.render(s.p,s.resources,timeRef.current,s.playing);
      if(timeLabel.current)timeLabel.current.textContent=timecode(timeRef.current,s.p.settings.fps);
      if(playhead.current)playhead.current.style.left=`${timeRef.current/SECOND*s.zoom}px`;
      frame=requestAnimationFrame(tick);
    };frame=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(frame);engine.current?.dispose();};
  },[message]);
  useEffect(()=>{if(error){const timer=setTimeout(()=>message(''),8000);return()=>clearTimeout(timer);}},[error,message]);
  useEffect(()=>{if(success){const timer=setTimeout(()=>setSuccess(''),6000);return()=>clearTimeout(timer);}},[success]);
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{if(progress!==null)return;if(e.key==='Escape'){setHome(false);setExportOpen(false);setRenderReview(undefined);setWorkspaceDialog(undefined);setContentSection(undefined);setTransitionSelection(undefined);return;}if(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable="true"],.source-monitor'))return;const mod=e.ctrlKey||e.metaKey;
      if(home||exportOpen||workspaceDialog||contentSection||transitionSelection)return;
      if(e.code==='Space'){if((e.target as HTMLElement).closest('button')&&!(e.target as HTMLElement).closest('.timeline-clip'))return;e.preventDefault();toggle();}else if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();stop();if(e.shiftKey)redo();else undo();}
      else if(mod&&e.key.toLowerCase()==='s'){e.preventDefault();if(e.shiftKey)saveFile();else void saveLocal();}
      else if(mod&&e.key.toLowerCase()==='i'){e.preventDefault();fileInput.current?.click();}
      else if(mod&&e.key.toLowerCase()==='c'){e.preventDefault();copySelection();}else if(mod&&e.key.toLowerCase()==='x'){e.preventDefault();copySelection(true);}else if(mod&&e.key.toLowerCase()==='v'){e.preventDefault();pasteSelection();}else if(mod&&e.key.toLowerCase()==='d'){e.preventDefault();runClip(duplicateClip);}else if(mod&&e.key.toLowerCase()==='e'){e.preventDefault();if(busy||!endTime(stateRef.current.p))return;stop();setExportName(stateRef.current.p.name);setExportOpen(true);}
      else if(mod&&e.altKey&&e.key.toLowerCase()==='s'){e.preventDefault();separateAudio();}
      else if(e.key.toLowerCase()==='s'||(mod&&e.key.toLowerCase()==='b')){e.preventDefault();split();}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(e.shiftKey)runClip(rippleDelete);else remove();}
      else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();stop();const fps=stateRef.current.p.settings.fps;seek(frameToTime(timeToFrame(timeRef.current,fps)+(e.key==='ArrowLeft'?-1:1),fps));}
      else if(e.key.toLowerCase()==='k')stop();else if(e.key.toLowerCase()==='l'){void engine.current?.startPreviewAudio().catch(e=>message(errorText(e)));setPlaying(true);}else if(e.key.toLowerCase()==='j'){stop();seek(timeRef.current-SECOND);}
      else if(e.key==='+'||e.key==='=')setZoom(z=>stepTimelineZoom(z,1));else if(e.key==='-')setZoom(z=>stepTimelineZoom(z,-1));
    };window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[toggle,stop,undo,redo,saveFile,split,remove,seek,home,exportOpen,progress,workspaceDialog,contentSection,transitionSelection,hasClipboard,p,selected,resources,busy]);
  async function importFiles(files:FileList|File[],placement?:Placement){
    if(busy||progress!==null)return;
    stop();setBusy(true);
    const gen=generation.current;
    const start=timeRef.current;
    try {
      for(const file of Array.from(files)){
        try {
          const {asset,resource}=await importMedia(file);
          if(gen!==generation.current){URL.revokeObjectURL(resource.url);return;}
          await storage.saveMedia(asset.id,file);
          if(gen!==generation.current){URL.revokeObjectURL(resource.url);return;}
          setResources(r=>({...r,[asset.id]:resource}));
          apply(d=>edit(d,draft=>{
            draft.assets[asset.id]=asset;
            if(!placement)return;
            const track=createTrack('video',placement==='background'?'Fondo':placement==='recording'?'Captura':'Gráficos');
            const inserted=createClip(asset,start);
            if(placement==='overlay')inserted.scale=.38;
            track.clips.push(inserted);
            if(placement==='background')draft.tracks.push(track);
            else draft.tracks.unshift(track);
          }));
        }catch(e){message(file.name + ': ' + errorText(e));}
      }
    }finally{setBusy(false);}
  }
  async function addGraphic(kind:Graphic,color:string,secondColor:string){
    try{
      const graphic=makeGraphic(kind,color,secondColor,p.settings.width,p.settings.height);
      setContentSection(undefined);
      await importFiles([graphic],kind==='solid'||kind==='gradient'?'background':'overlay');
    }catch(e){message(errorText(e));}
  }
  function addWatermark(assetId:string,corner:number){
    apply(d=>edit(d,draft=>{
      const asset=draft.assets[assetId];
      const track=createTrack('video','Marca de agua');
      const logo=createClip(asset);
      logo.duration=endTime(d)||asset.duration;
      logo.scale=.2;
      logo.opacity=.7;
      const {width,height}=draft.settings;
      const w=asset.width??width;
      const h=asset.height??height;
      const fit=Math.min(width/w,height/h)*logo.scale;
      const x=3+w*fit/width*50;
      const y=3+h*fit/height*50;
      logo.x=corner%2===0?x:100-x;
      logo.y=corner<2?y:100-y;
      track.clips.push(logo);
      draft.tracks.unshift(track);
    }));
    setContentSection(undefined);
  }
  function addLowerThird(name:string,role:string){
    const id=uid();
    apply(d=>{
      const next=addTitle(d,timeRef.current,id);
      const title=findClip(next,id)!.title!;
      return setClipProps(next,id,{
        title:{...title,text:role?name+'\n'+role:name,x:30,y:82,outline:true,
          size:Math.max(12,Math.round(next.settings.height*.042))},
        fadeIn:350000,fadeOut:350000,
      });
    });
    select(id);
    setDockTab('inspector');
    setContentSection(undefined);
  }
  function removeLibraryAsset(assetId:string){
    apply(d=>{
      if(d.tracks.some(track=>track.clips.some(clip=>clip.assetId===assetId))){
        throw new Error('Este medio se usa en la línea de tiempo. Quitá primero sus clips.');
      }
      return edit(d,draft=>{delete draft.assets[assetId];});
    });
  }
  function addToTimeline(assetId:string){stop();apply(d=>{const asset=d.assets[assetId];const kind=asset.kind==='audio'?'audio':'video';let track=d.tracks.find(t=>t.kind===kind&&!t.locked&&t.role!=='titles');let next=d;if(!track){track=createTrack(kind,kind==='video'?'Video':'Audio');next=edit(d,x=>{x.tracks.push(track!);});}return addClip(next,assetId,track.id);});}
  async function relink(file:File){const id=relinkId.current;if(!id)return;setBusy(true);try{const imported=await importMedia(file);const original=stateRef.current.p.assets[id];if(imported.asset.kind!==original.kind)throw new Error('El medio debe ser del mismo tipo.');if(original.kind!=='image'&&imported.asset.duration<original.duration)throw new Error('El medio es más corto que el original. Elige el archivo original.');await storage.saveMedia(id,file);setResources(r=>({...r,[id]:imported.resource}));setSuccess('Medio reubicado.');}catch(e){message(errorText(e));}finally{setBusy(false);}}
  function toggleDualView() {
    const enabled = !dualView;
    setDualView(enabled);
    if (!saveViewPreferences({dualMonitor: enabled})) {
      message('No se pudo guardar la preferencia del visor.');
    }
  }
  function insertTitle(kind: 'title'|'subtitle' = 'title') {
    stop();
    const id = uid();
    try {
      const next = addTitle(useEditor.getState().h.present, timeRef.current, id, kind);
      apply(() => next);
      select(id);
      setDockTab('inspector');
    } catch (error) {
      message(errorText(error));
    }
  }
  function openTransition(id = selected) {
    if (!id) { message('Selecciona un clip para añadir una transición.'); return; }
    stop();
    setTransitionSelection(id);
  }
  async function startExport(){
    if(!availableFormats.length)return;stop();setExportNotice('');abort.current=new AbortController();setProgress(0);
    try{const resolution=resolutionOptions[exportResolution];const aspect=p.settings.width/p.settings.height;const width=aspect<1?resolution.height:resolution.width;const height=Math.round(width/aspect/2)*2;
      const result=await exportVideo(p,resources,{width,height,fps:exportFps,bitrate:exportQuality,mime:availableFormats[exportFormat].mime},abort.current.signal,setProgress,setExportNotice);
      setRenderReview({...result,name:`${exportName||p.name}.${availableFormats[exportFormat].extension}`,fps:exportFps});
    }catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))message(errorText(e));}finally{setProgress(null);}
  }
  async function saveLocal(){try{setSaved('Guardando…');await storage.saveProject(stateRef.current.p);setSaved('Guardado');setSuccess('Proyecto guardado.');}catch(e){setSaved('Sin guardar');message(errorText(e));}}
  function canSeparateAudio(id = selected) {
    if (!id || busy || progress !== null) return false;
    const track = p.tracks.find(track => track.clips.some(clip => clip.id === id));
    const clip = track?.clips.find(clip => clip.id === id);
    return !!clip && !track?.locked && canDetachAudio(clip, p.assets[clip.assetId]) &&
      resources[clip.assetId]?.hasAudio !== false;
  }
  function separateAudio(id = selected) {
    if (!id || !canSeparateAudio(id)) return;
    stop();
    apply(project => detachAudio(project, id));
  }
  function runClip(action:(p:Project,id:string)=>Project){stop();const id=useEditor.getState().selected;if(id)apply(d=>action(d,id));}
  function copySelection(cut=false){const state=useEditor.getState();if(!state.selected)return;try{clipboard.current=copyClip(state.h.present,state.selected);setHasClipboard(true);if(cut){stop();state.apply(d=>deleteClip(d,state.selected!));state.select();}}catch(e){message(errorText(e));}}
  function pasteSelection(mode:'insert'|'overwrite'|'overlay'='insert',at=timeRef.current){if(clipboard.current){stop();const data=clipboard.current;apply(d=>pasteClip(d,data,at,mode));}}
  function showDialog(mode:DialogMode){stop();setWorkspaceDialog(mode);}
  function showProjects(create=false){stop();setCreateOnHome(create);void refreshRecent();setHome(true);}
  function frameStep(direction:number){stop();seek(frameToTime(timeToFrame(timeRef.current,p.settings.fps)+direction,p.settings.fps));}
  function goEdge(direction:number){const edges=[0,...p.tracks.flatMap(t=>t.clips.flatMap(c=>[c.start,c.start+c.duration]))].sort((a,b)=>a-b);const target=direction<0?edges.filter(n=>n<timeRef.current-1).at(-1):edges.find(n=>n>timeRef.current+1);if(target!==undefined){stop();seek(target);}}
  function nearest(){const clips=p.tracks.flatMap(t=>t.clips);const closest=clips.sort((a,b)=>Math.max(0,a.start-timeRef.current,timeRef.current-a.start-a.duration)-Math.max(0,b.start-timeRef.current,timeRef.current-b.start-b.duration))[0];if(closest)select(closest.id);}
  function addMarker(){apply(d=>edit(d,x=>{x.markers??=[];x.markers.push({id:uid(),time:timeRef.current,name:`Marcador ${x.markers.length+1}`});}));}
  function goMarker(direction:number){const times=(p.markers??[]).map(m=>m.time).sort((a,b)=>a-b);const at=direction<0?times.filter(t=>t<timeRef.current).at(-1):times.find(t=>t>timeRef.current);if(at!==undefined){stop();seek(at);}}
  function exportMetadata(){const rows=[['Pista','Medio','Inicio (s)','Duración (s)','Entrada del medio (s)','Volumen'],...p.tracks.flatMap(t=>t.clips.map(c=>[t.name,p.assets[c.assetId].name,c.start/SECOND,c.duration/SECOND,c.sourceIn/SECOND,c.volume]))];const csv=rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');storage.download(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),`${p.name}-metadatos.csv`);}
  function snapshot(){canvas.current?.toBlob(blob=>{if(blob)storage.download(blob,`${p.name}-fotograma.png`);},'image/png');}
  const selectedAsset=(sourceId?p.assets[sourceId]:undefined)??(clip?p.assets[clip.assetId]:sourceAsset);
  const menus:EditorMenu[]=[
    {label:'Archivo',items:[
      {label:'Crear proyecto…',action:()=>showProjects(true)},{label:'Abrir proyecto reciente…',action:showProjects},{label:'Importar medios…',shortcut:'Ctrl+I',separator:true,action:()=>fileInput.current?.click()},{label:'Importar proyecto…',action:()=>projectInput.current?.click()},{label:'Quitar medio seleccionado de la biblioteca',disabled:!sourceAsset,action:()=>sourceAsset&&removeLibraryAsset(sourceAsset.id)},
      {label:'Guardar proyecto',shortcut:'Ctrl+S',separator:true,action:()=>void saveLocal()},{label:'Descargar proyecto como .vedit',shortcut:'Ctrl+Shift+S',action:saveFile},{label:'Crear copia de seguridad',action:()=>storage.download(new Blob([serialize(p)],{type:'application/json'}),`${p.name}-respaldo-${Date.now()}.vedit`)},
      {label:'Exportar video…',shortcut:'Ctrl+E',separator:true,disabled:!duration||busy,action:()=>{stop();setExportName(p.name);setExportOpen(true);}},{label:'Exportar metadatos CSV',action:exportMetadata},{label:'Guardar fotograma PNG',action:snapshot},
      {label:'Configuración del proyecto…',separator:true,action:()=>showDialog('settings')},{label:'Usar resolución del medio seleccionado',disabled:!selectedAsset?.width||!selectedAsset?.height,action:()=>selectedAsset&&apply(d=>edit(d,x=>{x.settings.width=selectedAsset.width!;x.settings.height=selectedAsset.height!;}))},{label:'Notas del proyecto…',action:()=>showDialog('notes')},{label:'Organizador de proyectos',separator:true,action:showProjects}]},
    {label:'Edición',items:[{label:'Deshacer',shortcut:'Ctrl+Z',disabled:!h.past.length,action:()=>{stop();undo();}},{label:'Rehacer',shortcut:'Ctrl+Shift+Z',disabled:!h.future.length,action:()=>{stop();redo();}},{label:'Historial…',action:()=>showDialog('history')},
      {label:'Cortar clip',shortcut:'Ctrl+X',separator:true,disabled:!clip,action:()=>copySelection(true)},{label:'Copiar clip',shortcut:'Ctrl+C',disabled:!clip,action:()=>copySelection()},{label:'Pegar e insertar',shortcut:'Ctrl+V',disabled:!hasClipboard,action:()=>pasteSelection()},{label:'Pegar y sobrescribir',disabled:!hasClipboard,action:()=>pasteSelection('overwrite')},{label:'Pegar en una pista nueva',disabled:!hasClipboard,action:()=>pasteSelection('overlay')},{label:'Pegar atributos',disabled:!hasClipboard||!clip,action:()=>{const c=clipboard.current?.clip;if(c&&clip)apply(d=>setClipProps(d,clip.id,{volume:c.volume,scale:c.scale,x:c.x,y:c.y,rotation:c.rotation,opacity:c.opacity,color:c.color}));}},
      {label:'Duplicar clip',shortcut:'Ctrl+D',separator:true,disabled:!clip,action:()=>runClip(duplicateClip)},{label:'Eliminar clip',shortcut:'Supr',disabled:!clip,action:remove},{label:'Eliminar y cerrar espacio en pista',shortcut:'Shift+Supr',disabled:!clip,action:()=>runClip(rippleDelete)},{label:'Eliminar espacios vacíos',action:()=>{stop();apply(closeGaps);}},{label:'Cancelar selección',separator:true,action:()=>select()},{label:'Doble visor',separator:true,checked:dualView,action:toggleDualView}]},
    {label:'Recortar',items:[{label:'Seleccionar clip más cercano',action:nearest},{label:'Abrir inspector de recortes',disabled:!clip,action:()=>setDockTab('inspector')},{label:'Recortar inicio hasta el cursor',separator:true,disabled:!clip,action:()=>runClip((d,id)=>trimAt(d,id,timeRef.current,'start'))},{label:'Recortar final hasta el cursor',disabled:!clip,action:()=>runClip((d,id)=>trimAt(d,id,timeRef.current,'end'))},{label:'Mover clip un fotograma a la izquierda',separator:true,disabled:!clip,action:()=>runClip((d,id)=>moveClip(d,id,Math.max(0,findClip(d,id)!.start-frameToTime(1,p.settings.fps))))},{label:'Mover clip un fotograma a la derecha',disabled:!clip,action:()=>runClip((d,id)=>moveClip(d,id,findClip(d,id)!.start+frameToTime(1,p.settings.fps)))},{label:'Deslizar origen un fotograma adelante',disabled:!clip,action:()=>runClip((d,id)=>{const c=findClip(d,id)!;return trimClip(d,id,c.sourceIn+frameToTime(1,p.settings.fps),c.duration);})}]},
    {label:'Línea de tiempo',items:[{label:'Insertar título',action:()=>insertTitle()},{label:'Transición de video…',disabled:!clip,action:()=>openTransition()},{label:'Dividir clip en el cursor',shortcut:'Ctrl+B',disabled:!clip,action:split},{label:'Unir con el siguiente corte',disabled:!clip,action:()=>runClip(joinNext)},{label:'Insertar espacio…',separator:true,action:()=>showDialog('gap')},{label:'Añadir pista de video',action:()=>apply(d=>edit(d,x=>{x.tracks.unshift(createTrack('video',`Video ${x.tracks.filter(t=>t.kind==='video').length+1}`));}))},{label:'Añadir pista de audio',action:()=>apply(d=>edit(d,x=>{x.tracks.push(createTrack('audio',`Audio ${x.tracks.filter(t=>t.kind==='audio').length+1}`));}))},{label:'Fundido de entrada · 0.5 s',separator:true,disabled:!clip,action:()=>clip&&apply(d=>setClipProps(d,clip.id,{fadeIn:Math.min(500000,clip.duration)}))},{label:'Fundido de salida · 0.5 s',disabled:!clip,action:()=>clip&&apply(d=>setClipProps(d,clip.id,{fadeOut:Math.min(500000,clip.duration)}))},{label:'Quitar fundidos del clip',disabled:!clip,action:()=>clip&&apply(d=>setClipProps(d,clip.id,{fadeIn:0,fadeOut:0}))}]},
    {label:'Clip',items:[{label:'Separar audio',shortcut:'Ctrl+Alt+S',disabled:!canSeparateAudio(),action:()=>separateAudio()},{label:'Restablecer transformación',disabled:!clip,action:()=>clip&&apply(d=>setClipProps(d,clip.id,{scale:1,x:50,y:50,rotation:0,opacity:1}))},{label:'Silenciar / activar audio del clip',disabled:!clip||!!clip.audioDetached,action:()=>clip&&apply(d=>setClipProps(d,clip.id,{volume:clip.volume?0:1}))},{label:'Añadir medio seleccionado al final',disabled:!sourceAsset,action:()=>sourceAsset&&addToTimeline(sourceAsset.id)}]},
    {label:'Efectos',items:[
      ...(Object.keys(CONTENT_SECTIONS) as ContentSection[]).map(section=>({
        label:CONTENT_SECTIONS[section]+'…',
        action:()=>{stop();setContentSection(section);},
      })),
      {label:'Look cinematográfico…',action:()=>setDockTab('cinema')},
      {label:'Insertar subtítulo',action:()=>insertTitle('subtitle')},
      {label:'Editar tipografía',disabled:!clip?.title,action:()=>setDockTab('inspector')},
      {label:'Filtros y corrección de color…',separator:true,disabled:!clip,action:()=>setDockTab('color')},
      {label:'Chroma key…',action:()=>setDockTab('chroma')},
    ]},
    {label:'Marcar',items:[{label:'Añadir marcador en el cursor',action:addMarker},{label:'Ir al marcador anterior',disabled:!p.markers?.length,action:()=>goMarker(-1)},{label:'Ir al marcador siguiente',disabled:!p.markers?.length,action:()=>goMarker(1)},{label:'Quitar marcador bajo el cursor',disabled:!p.markers?.length,separator:true,action:()=>apply(d=>edit(d,x=>{x.markers=x.markers?.filter(m=>Math.abs(m.time-timeRef.current)>SECOND/p.settings.fps);}))}]},
    {label:'Ver',items:[{label:'Ajustar imagen al visor',checked:viewerZoom==='fit',action:()=>setViewerZoom('fit')},{label:'Ver al 100 % · píxeles del proyecto',checked:viewerZoom===1,action:()=>setViewerZoom(1)},{label:'Ver al 50 %',checked:viewerZoom===.5,action:()=>setViewerZoom(.5)},{label:'Pantalla completa',action:()=>void playerWrap.current?.requestFullscreen().catch(e=>message(errorText(e)))},{label:'Biblioteca de medios',separator:true,checked:libraryVisible,action:()=>setLibraryVisible(!libraryVisible)},{label:'Mezclador de audio',action:()=>setDockTab('audio')},{label:'Histograma y color',action:()=>setDockTab('color')},{label:'Medidor Master',checked:metersVisible,action:()=>setMetersVisible(!metersVisible)}]},
    {label:'Reproducir',items:[{label:playing?'Pausar':'Reproducir',shortcut:'Espacio',action:toggle},{label:'Detener e ir al inicio',action:()=>{stop();seek(0);}},{label:'Fotograma anterior',shortcut:'←',separator:true,action:()=>frameStep(-1)},{label:'Fotograma siguiente',shortcut:'→',action:()=>frameStep(1)},{label:'Corte anterior',action:()=>goEdge(-1)},{label:'Corte siguiente',action:()=>goEdge(1)},{label:'Ir a un tiempo…',action:()=>showDialog('time')},{label:'Reproducir en bucle',checked:looping,separator:true,action:()=>setLooping(!looping)}]}
  ];
  const assets=importedAssets.filter(a=>(tab==='all'||a.kind===tab)&&a.name.toLowerCase().includes(query.toLowerCase()));
  return <div className={`app ${libraryVisible?'':'hide-library'} ${dualView?'':'single-view'}`} onDragStartCapture={e=>{if(e.target instanceof HTMLImageElement)e.preventDefault();}}
    onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();}}
    onDrop={e=>{
      if(!e.dataTransfer.files.length)return;
      e.preventDefault();
      if(!e.dataTransfer.types.includes('asset'))void importFiles(e.dataTransfer.files);
    }}>
    <input type="file" ref={fileInput} hidden multiple accept="video/*,audio/*,image/*" onChange={e=>{if(e.target.files)void importFiles(e.target.files);e.target.value='';}}/>
    <input type="file" ref={projectInput} hidden accept=".vedit,application/json" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{const next=parseProject(await file.text());await loadProject(next);}catch(e){message(errorText(e));}}}/>
    <input type="file" ref={relinkInput} hidden accept="video/*,audio/*,image/*" onChange={e=>{const f=e.target.files?.[0];if(f)void relink(f);e.target.value='';}}/>
    <div className="editing-shell" {...(home||exportOpen||!!workspaceDialog||!!contentSection||!!transitionSelection?{inert:''}:{})}><MenuBar menus={menus} disabled={progress!==null||busy}/>
    <header className="app-header"><div className="brand"><div className="brand-mark"><img src={`${import.meta.env.BASE_URL}logo.png`} alt=""/></div><span>AtlasFX</span><span className="beta">ALPHA</span></div><div className="header-divider"/><button className="header-home" title="Proyectos" aria-label="Ver proyectos" disabled={progress!==null} onClick={()=>{stop();void refreshRecent();setHome(true);}}><House size={17}/></button><ChevronRight size={14} className="muted"/><input className="project-title" aria-label="Nombre del proyecto" value={p.name} disabled={progress!==null} maxLength={200} onChange={e=>apply(d=>edit(d,x=>{x.name=e.target.value;}))}/><span className="save-status">{saved==='Guardado'?<Check size={13}/>:<LoaderCircle size={13}/>} {saved}</span><div className="header-right"><button type="button" className="button secondary" disabled={busy||progress!==null} onClick={()=>showDialog('settings')}>Ajustes</button><button className="button secondary" title="Guardar proyecto (Ctrl+S)" disabled={progress!==null} onClick={()=>void saveLocal()}><Save size={15}/><span>Guardar proyecto</span></button><button className="button primary" disabled={!duration||busy||progress!==null} onClick={()=>{stop();setExportName(p.name);setExportOpen(true);}}><Download size={15}/> Exportar video</button></div></header>
    <main className="workspace"><nav className="resource-nav" aria-label="Tipos de medios">{[{id:'all',label:'Medios',icon:FolderOpen},{id:'video',label:'Video',icon:Film},{id:'audio',label:'Audio',icon:Music2},{id:'image',label:'Imagen',icon:ImageIcon}].map(({id,label,icon:Icon})=><button key={id} className={tab===id?'selected':''} onClick={()=>setTab(id as typeof tab)}><Icon size={21}/><span>{label}</span></button>)}</nav>
    <aside className="media-panel"><div className="panel-heading"><span>Biblioteca de medios</span><span className="counter">{importedAssets.length}</span></div><div className="library-content"><button className="button primary import-button" disabled={busy||progress!==null} onClick={()=>fileInput.current?.click()}>{busy?<LoaderCircle className="spin" size={15}/>:<Plus size={16}/>} {busy?'Importando…':'Importar medios'}</button><label className="search-box"><Search size={15}/><input placeholder="Buscar archivos…" aria-label="Buscar archivos" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="library-title"><span>ARCHIVOS DEL PROYECTO</span><span>{assets.length}</span></div>
      {assets.length?<div className="asset-grid">{assets.map(a=><div key={a.id} className={`asset-card ${!resources[a.id]?'missing':''} ${sourceAsset?.id===a.id?'source-selected':''}`} tabIndex={0} role="group" aria-label={`Medio ${a.name}`} onClick={()=>setSourceId(a.id)} onKeyDown={e=>{if(e.key==='Enter'&&e.target===e.currentTarget)setSourceId(a.id);}} draggable={!!resources[a.id]&&progress===null} onDragStart={e=>e.dataTransfer.setData('asset',a.id)} onDoubleClick={()=>resources[a.id]&&progress===null&&addToTimeline(a.id)}><div className="asset-preview">{resources[a.id]?.thumbnail?<img src={resources[a.id].thumbnail} alt="" draggable={false}/>:a.kind==='audio'?<Music2 size={25}/>:<Film size={25}/>}<span className="asset-duration">{(a.duration/SECOND).toFixed(1)} s</span>{resources[a.id]?<button className="asset-add" title="Añadir a la línea de tiempo" aria-label={`Añadir ${a.name}`} disabled={progress!==null} onClick={()=>addToTimeline(a.id)}><Plus size={15}/></button>:<button className="relink" title="Reubicar archivo" disabled={busy||progress!==null} onClick={()=>{relinkId.current=a.id;relinkInput.current?.click();}}><Link2 size={14}/> Reubicar</button>}</div><div className="asset-name" title={a.name}>{a.name}</div><span className="asset-meta" title={a.metadata?[a.metadata.videoCodec,a.metadata.audioCodec,a.metadata.hasAudio?'Con audio':'Sin audio'].filter(Boolean).join(' · '):undefined}>{!resources[a.id]?'Medio faltante':a.kind==='image'?'Imagen':a.kind==='audio'?'Audio':'Video'}{a.width?` · ${a.width} × ${a.height}`:''}{a.metadata?.averageFps?` · ${Number(a.metadata.averageFps.toFixed(2))} fps`:''}</span></div>)}</div>:<div className="library-empty"><div className="empty-icon"><Upload size={26}/></div><strong>{query?'Sin resultados':'Todo empieza con una idea'}</strong><p>{query?'Prueba otra búsqueda.':'Importa videos, imágenes o audio. También puedes arrastrarlos a esta ventana.'}</p>{!query&&<span className="file-formats">MP4 · MOV · WEBM · MP3 · PNG · JPG</span>}</div>}
    </div></aside>
    <section className="player-panel"><div className="viewer-pair"><SourceMonitor asset={sourceAsset} resource={sourceAsset?resources[sourceAsset.id]:undefined} fps={p.settings.fps} timelinePlaying={playing} disabled={progress!==null||busy||!dualView||home||exportOpen||!!workspaceDialog||!!contentSection||!!transitionSelection} onPlay={stop} onAdd={()=>sourceAsset&&addToTimeline(sourceAsset.id)}/><div className="program-viewer"><div className="monitor-heading"><span className="monitor-type">PROGRAMA</span><span className="monitor-filename">{p.name}</span><span className="monitor-resolution">{p.settings.height}p</span></div><div className={`preview-stage ${fitViewer?'fit-view':'pixel-view'}`} ref={playerWrap}><div className="canvas-surface" style={fitViewer?undefined:displaySize}><div className="program-canvas" style={displaySize}><canvas ref={canvas} width={p.settings.width} height={p.settings.height} aria-label="Vista previa del proyecto"/><CinemaGuides guide={cinemaGuide} project={p}/></div></div></div><div className="player-info"><span>Proyecto: {p.settings.width} × {p.settings.height} · {p.settings.fps} fps</span><label className="viewer-zoom">Zoom del visor<select aria-label="Zoom del visor" value={viewerZoom} onChange={e=>setViewerZoom(e.target.value==='fit'?'fit':Number(e.target.value))}><option value="fit">Ajustar</option><option value="0.25">25 %</option><option value="0.5">50 %</option><option value="1">100 % · tamaño real</option><option value="2">200 %</option></select></label></div><div className="player-controls"><div className="time-display"><span ref={timeLabel}>00:00:00:00</span><span className="muted"> / {timecode(duration,p.settings.fps)}</span></div><div className="transport"><button title="Ir al inicio" aria-label="Ir al inicio" onClick={()=>seek(0)} disabled={progress!==null}><SkipBack size={17}/></button><button className="play-button" aria-label={playing?'Pausar':'Reproducir'} title="Reproducir / pausar (Espacio)" disabled={progress!==null} onClick={toggle}>{playing?<Pause size={19} fill="currentColor"/>:<Play size={19} fill="currentColor"/>}</button><button title="Ir al final" aria-label="Ir al final" onClick={()=>{stop();seek(duration);}} disabled={progress!==null}><SkipForward size={17}/></button></div><div className="player-right"><div className="monitor-control" title="Volumen de escucha: no modifica la exportación"><button aria-label={monitorGain?'Silenciar monitor':'Activar monitor'} onClick={()=>{if(monitorGain){previousMonitorGain.current=monitorGain;setMonitorGain(0);}else setMonitorGain(previousMonitorGain.current||1);}}>{monitorGain?<Volume2 size={16}/>:<VolumeX size={16}/>}</button><input aria-label="Volumen de escucha" type="range" min={0} max={1} step={.01} value={monitorGain} onChange={e=>setMonitorGain(Number(e.target.value))}/></div><button title="Pantalla completa" aria-label="Pantalla completa" onClick={()=>void playerWrap.current?.requestFullscreen().catch(()=>message('Pantalla completa no disponible.'))}><Maximize size={16}/></button></div></div></div></div></section>
    {metersVisible&&<MasterMeter read={()=>engine.current?.meterLevels()??{master:[-60,-60],tracks:{}}}/>}</main>
    <WorkspaceDivider panel={lowerWorkspace}/>
    <div className="lower-workspace" id="lower-workspace" ref={lowerWorkspace}><Timeline project={p} resources={resources} timeRef={timeRef} playheadRef={playhead} seek={seek} split={split} remove={remove} onTitle={()=>insertTitle()} onTransition={openTransition} onSeparateAudio={separateAudio} canSeparateAudio={canSeparateAudio} zoom={zoom} setZoom={setZoom} disabled={progress!==null}/><section className="bottom-dock" aria-label="Panel inferior"><nav className="dock-tabs" aria-label="Herramientas del panel inferior"><button className={dockTab==='inspector'?'active':''} aria-pressed={dockTab==='inspector'} onClick={()=>setDockTab('inspector')}>Inspector</button><button className={dockTab==='audio'?'active':''} aria-pressed={dockTab==='audio'} onClick={()=>setDockTab('audio')}>Audio</button><button className={dockTab==='color'?'active':''} aria-pressed={dockTab==='color'} onClick={()=>setDockTab('color')}>Color</button><button className={dockTab==='cinema'?'active':''} aria-pressed={dockTab==='cinema'} onClick={()=>setDockTab('cinema')}>Cine</button></nav><div className="dock-content">{dockTab==='inspector'?<Inspector project={p} engine={engine} disabled={progress!==null} onSeparateAudio={()=>separateAudio()} canSeparateAudio={canSeparateAudio()}/>:dockTab==='audio'?<AudioMixer project={p} engine={engine} disabled={progress!==null}/>:dockTab==='color'?<ColorPanel project={p} canvas={canvas} disabled={progress!==null||busy}/>:dockTab==='cinema'?<CinemaPanel project={p} source={canvas} guide={cinemaGuide} setGuide={setCinemaGuide} disabled={progress!==null||busy}/>:<ChromaControls clip={keyedClip} disabled={progress!==null||busy} onImport={()=>fileInput.current?.click()}/>}</div></section></div>
    <footer className="app-footer"><span>AtlasFX</span><span className="app-footer-center"><Clapperboard/> Edición</span><span>{importedAssets.length} medios · {p.tracks.length} pistas · {(duration/SECOND).toFixed(1)} s</span></footer>
    </div>
    {(error||success)&&<div className={`toast ${error?'error':'success'}`} role={error?'alert':'status'}>{error?<AlertCircle size={18}/>:<Check size={18}/>}<span>{error||success}</span><button aria-label="Cerrar aviso" onClick={()=>{message('');setSuccess('');}}><X size={15}/></button></div>}
    {home&&<ProjectBrowser initialCreate={createOnHome} projects={recent} currentId={p.id} busy={busy} onOpen={next=>void loadProject(next)} onCreate={name=>void loadProject(createProject(name))} onImport={()=>projectInput.current?.click()} onClose={()=>setHome(false)} onDelete={async id=>{try{await storage.deleteProject(id);await refreshRecent();}catch(e){message(errorText(e));}}}/>}
    {transitionSelection&&<TransitionDialog project={p} selected={transitionSelection} onClose={()=>setTransitionSelection(undefined)} onSeek={seek}/>}
    {workspaceDialog&&<WorkspaceDialog key={p.id+'-'+workspaceDialog} mode={workspaceDialog} project={p}
      time={timeRef.current} onSeek={seek} onClose={()=>setWorkspaceDialog(undefined)}/>}
    {contentSection&&<div className="modal-backdrop">
      <section className="modal workspace-dialog project-settings" role="dialog" aria-modal="true" aria-labelledby="content-section-title">
        <h2 id="content-section-title">{CONTENT_SECTIONS[contentSection]}</h2>
        <ContentTools section={contentSection}
          clip={clip&&!clip.audioOnly&&p.assets[clip.assetId].kind!=='audio'?clip:undefined}
          watermarkAssets={importedAssets.filter(asset=>asset.kind==='image'&&resources[asset.id])}
          updateClip={(props:Partial<Clip>)=>clip&&apply(d=>setClipProps(d,clip.id,props))}
          insertGraphic={(kind,color,secondColor)=>void addGraphic(kind,color,secondColor)}
          insertWatermark={addWatermark} insertLowerThird={addLowerThird} snapshot={snapshot}
          insertRecording={file=>{setContentSection(undefined);void importFiles([file],'recording');}}
          message={message}/>
        <div className="modal-actions"><button autoFocus type="button" className="button secondary"
          onClick={()=>setContentSection(undefined)}>Cerrar</button></div>
      </section>
    </div>}
    {exportOpen&&renderReview&&<RenderPreview result={renderReview} notice={exportNotice}
      onBack={()=>setRenderReview(undefined)} onSave={()=>{
        storage.download(renderReview.blob,renderReview.name);
        setRenderReview(undefined);setExportOpen(false);setSuccess('Video guardado. Revisá tus descargas.');
      }}/>}
    {exportOpen&&!renderReview&&<div className="modal-backdrop"><section className="modal export-modal" role="dialog" aria-modal="true" aria-labelledby="export-title"><button className="close-modal" aria-label="Cerrar exportación" disabled={progress!==null} onClick={()=>setExportOpen(false)}><X/></button><div className="modal-eyebrow"><Download size={17}/> EXPORTACIÓN DE VIDEO</div><h2 id="export-title">Dale salida a tu historia.</h2><p className="muted">{(duration/SECOND).toFixed(1)} segundos de video</p><fieldset disabled={progress!==null}><label className="dialog-field">Nombre del archivo<input value={exportName} onChange={e=>setExportName(e.target.value)} maxLength={120}/></label><div className="dialog-grid"><label className="dialog-field">Resolución<select value={exportResolution} onChange={e=>setExportResolution(Number(e.target.value))}>{resolutionOptions.map((r,i)=><option key={r.label} value={i}>{r.label}</option>)}</select></label><label className="dialog-field">Fotogramas por segundo<select value={exportFps} onChange={e=>setExportFps(Number(e.target.value))}>{[24,25,30,50,60].map(f=><option key={f}>{f}</option>)}</select></label></div><label className="dialog-field">Formato<select value={exportFormat} onChange={e=>setExportFormat(Number(e.target.value))}>{availableFormats.map((f,i)=><option value={i} key={f.mime}>{f.name}</option>)}</select></label><label className="dialog-field">Calidad<select value={exportQuality} onChange={e=>setExportQuality(Number(e.target.value))}><option value={3000000}>Baja · 3 Mbps</option><option value={8000000}>Media · 8 Mbps</option><option value={12000000}>Alta · 12 Mbps</option><option value={20000000}>Máxima · 20 Mbps</option></select></label></fieldset><div className="export-notice"><AlertCircle size={16}/><p>Esta versión exporta en tiempo real. Mantén esta ventana activa hasta terminar. El rendimiento del equipo puede afectar la fluidez del video. Los formatos dependen del navegador.</p></div>{exportNotice&&<p className="export-stream-notice" role="status">{exportNotice}</p>}{!availableFormats.length&&<p role="alert">Este navegador no ofrece un formato de exportación compatible. Prueba Chrome o Edge actualizados.</p>}{progress!==null&&<div className="progress-area"><div><span>Exportando video…</span><strong>{Math.round(progress*100)}%</strong></div><progress max={1} value={progress}/></div>}<div className="modal-actions">{progress!==null?<button className="button secondary" onClick={()=>abort.current?.abort()}>Cancelar exportación</button>:<button className="button secondary" onClick={()=>setExportOpen(false)}>Cancelar</button>}<button className="button primary" disabled={progress!==null||!availableFormats.length} onClick={()=>void startExport()}>{progress!==null?<LoaderCircle size={16} className="spin"/>:<Download size={16}/>} {progress!==null?'Renderizando…':'Renderizar y revisar'}</button></div></section></div>}
  </div>;
}
