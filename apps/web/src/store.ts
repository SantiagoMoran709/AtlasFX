import {create} from 'zustand';
import {createProject,history,execute,undo,redo,type EditCommand,type History,type Project} from '@corte/core';
interface State {h:History;selected?:string;error:string;apply:(command:EditCommand)=>void;undo:()=>void;redo:()=>void;open:(p:Project)=>void;select:(id?:string)=>void;message:(s:string)=>void}
export const useEditor=create<State>((set,get)=>({
  h:history(createProject()),error:'',
  apply:command=>{try{const previous=get().h;const next=execute(previous,command);if(next!==previous)set({h:next});}catch(e){set({error:e instanceof Error?e.message:String(e)});}},
  undo:()=>set(s=>({h:undo(s.h)})),redo:()=>set(s=>({h:redo(s.h)})),
  open:p=>set({h:history(p),selected:undefined}),select:selected=>set({selected}),message:error=>set({error})
}));
