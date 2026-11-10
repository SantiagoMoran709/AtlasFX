import {useEffect,useRef,useState} from 'react';
import {Clapperboard,FolderOpen,Plus,Search,LayoutGrid,List,ArrowUpRight,Clock3,Trash2,X,Film,Check} from 'lucide-react';
import {endTime,SECOND,type Project} from '@corte/core';
import {importMedia} from './media';
import {loadMedia} from './storage';

interface Props {projects:Project[];currentId:string;busy:boolean;initialCreate?:boolean;onOpen:(project:Project)=>void;onCreate:(name:string)=>void;onImport:()=>void;onClose:()=>void;onDelete:(id:string)=>Promise<void>}
const dateLabel=(value:string)=>new Date(value).toLocaleDateString('es-GT',{day:'numeric',month:'short',year:'numeric'});
const durationLabel=(p:Project)=>{const s=Math.round(endTime(p)/SECOND);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
export function ProjectBrowser({projects,currentId,busy,initialCreate=false,onOpen,onCreate,onImport,onClose,onDelete}:Props){
  const [query,setQuery]=useState('');const [view,setView]=useState<'grid'|'list'>('grid');const [sort,setSort]=useState('recent');
  const [selected,setSelected]=useState(currentId);const [newProject,setNewProject]=useState(initialCreate);const [name,setName]=useState('Proyecto sin título');
  const [remove,setRemove]=useState<Project>();const [deleting,setDeleting]=useState(false);const [thumbnails,setThumbnails]=useState<Record<string,string>>({});
  const thumbs=useRef<Record<string,string>>({});
  useEffect(()=>setSelected(currentId),[currentId]);
  useEffect(()=>{
    let canceled=false;
    void (async()=>{
      for(const project of projects){
        if(canceled)return;
        if(thumbs.current[project.id])continue;
        const asset=Object.values(project.assets).find(asset=>asset.kind!=='audio'&&!asset.generated);
        if(!asset)continue;
        try{
          const blob=await loadMedia(asset.id);
          if(canceled)return;
          if(!blob)continue;
          const {resource}=await importMedia(new File([blob],asset.name,{type:asset.mime||blob.type}));
          URL.revokeObjectURL(resource.url);
          if(canceled)return;
          const preview=resource.videoPreview??resource.thumbnail;
          if(preview){
            thumbs.current[project.id]=preview;
            setThumbnails({...thumbs.current});
          }
        }catch{/* A missing source does not prevent the project from being opened. */}
      }
    })();
    return()=>{canceled=true;};
  },[projects]);
  const filtered=projects.filter(p=>p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):b.updatedAt.localeCompare(a.updatedAt));
  const chosen=projects.find(p=>p.id===selected);
  function create(){const value=name.trim();if(!value)return;setNewProject(false);onCreate(value);}
  return <section className="project-browser" role="dialog" aria-modal="true" aria-label="Biblioteca de proyectos">
    <header className="projects-header"><div className="studio-wordmark"><span><img src={`${import.meta.env.BASE_URL}logo.png`} alt=""/></span><strong>AtlasFX</strong></div><button className="projects-back" aria-label="Volver al editor" disabled={busy} onClick={onClose}>Volver al editor <ArrowUpRight size={14}/></button></header>
    <div className="projects-shell"><div className="projects-sidebar" aria-hidden="true"/>
      <main className="projects-main"><div className="projects-title-row"><div><div className="eyebrow">TU BIBLIOTECA</div><h1>Proyectos</h1><p>Crea una nueva edición o continúa con tus proyectos.</p></div><div className="projects-actions"><button className="button secondary" disabled={busy} onClick={onImport}><FolderOpen size={15}/> Importar proyecto</button><button className="button primary" disabled={busy} onClick={()=>{setName('Proyecto sin título');setNewProject(true);}}><Plus size={16}/> Nuevo proyecto</button></div></div>
      <div className="projects-filterbar"><label className="projects-search"><Search size={15}/><input aria-label="Buscar proyectos" placeholder="Buscar un proyecto…" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="projects-view-controls"><label className="project-sort"><span>Ordenar</span><select aria-label="Orden de proyectos" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Más recientes</option><option value="name">Nombre</option></select></label><div className="segmented-control"><button aria-label="Ver proyectos en cuadrícula" aria-pressed={view==='grid'} className={view==='grid'?'active':''} onClick={()=>setView('grid')}><LayoutGrid size={15}/></button><button aria-label="Ver proyectos en lista" aria-pressed={view==='list'} className={view==='list'?'active':''} onClick={()=>setView('list')}><List size={16}/></button></div></div></div>
      <div className="projects-section-label"><span>Todos los proyectos <b>{filtered.length}</b></span></div>
      <div className={`project-collection ${view}`}>
        {!query&&<button className="project-create-tile" disabled={busy} onClick={()=>{setName('Proyecto sin título');setNewProject(true);}}><span className="project-create-symbol"><Plus size={24}/></span><strong>Crear proyecto</strong><small>Un espacio para tu próxima historia</small></button>}
        {filtered.map(p=><article key={p.id} className={`project-tile ${selected===p.id?'selected':''}`}><button className="project-tile-main" aria-pressed={selected===p.id} aria-label={`Seleccionar proyecto ${p.name}`} disabled={busy} onClick={()=>setSelected(p.id)} onDoubleClick={()=>onOpen(p)}><div className="project-cover">{thumbnails[p.id]?<img src={thumbnails[p.id]} alt="" draggable={false}/>:<div className="project-cover-empty"><Clapperboard size={29}/><span>{Object.keys(p.assets).length?'Proyecto sin miniatura':'Proyecto vacío'}</span></div>}<span className="project-format-badge">{p.settings.width} × {p.settings.height}</span>{selected===p.id&&<span className="project-selected-check"><Check size={12}/></span>}<span className="project-duration-badge">{durationLabel(p)}</span></div><div className="project-tile-info"><strong>{p.name||'Sin título'}</strong><span><Clock3 size={11}/>{dateLabel(p.updatedAt)}<i/> {Object.values(p.assets).filter(asset=>!asset.generated).length} medios</span></div></button><button className="project-delete" aria-label={`Eliminar proyecto ${p.name}`} title="Eliminar de la biblioteca" disabled={busy} onClick={()=>setRemove(p)}><Trash2 size={13}/></button></article>)}
      </div>{!filtered.length&&query&&<div className="project-search-empty"><Search size={26}/><strong>No encontramos ese proyecto</strong><span>Prueba con otro nombre.</span></div>}
      </main></div>
    <footer className="projects-bottom"><span><span className="status-dot"/> {projects.length} proyectos en tu biblioteca</span><div>{chosen&&<span className="selected-project-caption">{chosen.name}</span>}<button className="button primary" disabled={!chosen||busy} onClick={()=>chosen&&onOpen(chosen)}>Abrir proyecto <ArrowUpRight size={14}/></button></div></footer>
    {newProject&&<div className="modal-backdrop" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')setNewProject(false);}}><form className="modal create-project-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title" onSubmit={e=>{e.preventDefault();create();}}><button className="close-modal" type="button" aria-label="Cerrar creación de proyecto" onClick={()=>setNewProject(false)}><X size={17}/></button><span className="dialog-icon"><Clapperboard size={23}/></span><h2 id="new-project-title">Nuevo proyecto</h2><p className="muted">Ponle nombre a tu próxima edición.</p><label className="dialog-field">Nombre del proyecto<input autoFocus value={name} maxLength={200} onFocus={e=>e.target.select()} onChange={e=>setName(e.target.value)}/></label><div className="new-project-specs"><Film size={14}/><span>1920 × 1080</span><span>30 fps</span><span>48 kHz</span></div><div className="modal-actions"><button className="button secondary" type="button" onClick={()=>setNewProject(false)}>Cancelar</button><button className="button primary" type="submit" disabled={!name.trim()||busy}>Crear proyecto <ArrowUpRight size={14}/></button></div></form></div>}
    {remove&&<div className="modal-backdrop"><section className="modal remove-project-modal" role="dialog" aria-modal="true" aria-labelledby="remove-project-title"><h2 id="remove-project-title">Eliminar proyecto</h2><p>Se eliminará «{remove.name}» de esta biblioteca. Sus medios originales se conservan.</p><div className="modal-actions"><button className="button secondary" disabled={deleting} onClick={()=>setRemove(undefined)}>Cancelar</button><button className="button danger" disabled={deleting} onClick={async()=>{setDeleting(true);try{await onDelete(remove.id);setRemove(undefined);}finally{setDeleting(false);}}}>{deleting?'Eliminando…':'Eliminar proyecto'}</button></div></section></div>}
  </section>;
}
