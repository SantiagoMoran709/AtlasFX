import {parseProject, serialize, type Project} from '@corte/core';
let db: Promise<IDBDatabase> | undefined;
function database() {
  return db ??= new Promise<IDBDatabase>((resolve,reject) => {
    const request = indexedDB.open('corte-studio',1);
    request.onupgradeneeded = () => { request.result.createObjectStore('projects',{keyPath:'id'}); request.result.createObjectStore('media'); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function put(store: string,value: unknown,key?: string) {
  const d = await database();
  return new Promise<void>((resolve,reject) => { const tx=d.transaction(store,'readwrite');tx.objectStore(store).put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error); });
}
async function get<T>(store: string,key: string): Promise<T|undefined> {
  const d=await database();return new Promise((resolve,reject)=>{const req=d.transaction(store).objectStore(store).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
}
export const saveMedia = (id: string,file: Blob) => put('media',file,id);
export const loadMedia = (id: string) => get<Blob>('media',id);
export const saveProject = (p: Project) => { serialize(p); return put('projects',p); };
export function readProjectRecords(records: unknown[]) {
  const projects: Project[] = [];
  let skipped = 0;
  for (const record of records) {
    try {
      const project = parseProject(JSON.stringify(record));
      if (typeof project.updatedAt !== 'string') throw new Error('Fecha de proyecto no válida.');
      projects.push(project);
    }
    catch { skipped++; }
  }
  projects.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  return {projects, skipped};
}
export async function listProjects() {
  const d = await database();
  return new Promise<ReturnType<typeof readProjectRecords>>((resolve,reject)=>{
    const req = d.transaction('projects').objectStore('projects').getAll();
    req.onsuccess = () => {
      try { resolve(readProjectRecords(req.result)); }
      catch (error) { reject(error); }
    };
    req.onerror = () => reject(req.error);
  });
}
export async function deleteProject(id: string) {
  const d=await database();return new Promise<void>((resolve,reject)=>{const tx=d.transaction('projects','readwrite');tx.objectStore('projects').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
}
export function download(blob: Blob,name: string) {const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),30_000);}
