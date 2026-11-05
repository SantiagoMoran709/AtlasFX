import {SECOND,type Project} from '@corte/core';
import type {MediaResource} from './media';
/** Decoded audio is scheduled on the audio clock, independent of UI frames.
 * Large sources retain the streaming path instead of allocating unbounded PCM. */
export async function prepareAudio(context:AudioContext,p:Project,resources:Record<string,MediaResource>,signal:AbortSignal):Promise<Map<string,AudioBuffer>|undefined>{
 const ids=[...new Set(p.tracks.filter(t=>t.visible&&!t.muted).flatMap(t=>t.clips.filter(c=>!c.audioDetached).map(c=>c.assetId)))].filter(id=>p.assets[id].kind!=='image');
 const estimate=ids.reduce((sum,id)=>sum+p.assets[id].duration/SECOND*context.sampleRate*2*4,0);
 if(estimate>192*1024*1024)return undefined;
 const decoded=new Map<string,AudioBuffer>();
 for(const id of ids){if(signal.aborted)throw new DOMException('Exportación cancelada','AbortError');const resource=resources[id];if(!resource)continue;try{decoded.set(id,await context.decodeAudioData(await resource.blob.arrayBuffer()));}catch{return undefined;}}
 return decoded;
}
