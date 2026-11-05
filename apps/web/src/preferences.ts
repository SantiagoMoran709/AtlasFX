export interface ViewPreferences {dualMonitor:boolean}
const key='corte-studio:view';
export function loadViewPreferences():ViewPreferences {
  try {const value=JSON.parse(localStorage.getItem(key)??'{}') as Partial<ViewPreferences>;return {dualMonitor:value.dualMonitor===true};}
  catch{return {dualMonitor:false};}
}
export function saveViewPreferences(preferences:ViewPreferences):boolean {
  try{localStorage.setItem(key,JSON.stringify(preferences));return true;}catch{return false;}
}
