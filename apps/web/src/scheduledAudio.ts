import {SECOND,type Project} from '@corte/core';
import type {MediaResource} from './media';

const AUDIO_MEMORY_BUDGET=192*1024*1024;

/** Decoded audio is scheduled on the audio clock, independent of UI frames.
 * Large sources retain the streaming path instead of allocating unbounded PCM. */
export async function prepareAudio(context:AudioContext,p:Project,resources:Record<string,MediaResource>,signal:AbortSignal):Promise<Map<string,AudioBuffer>|undefined>{
  const ids=[...new Set(p.tracks.filter(t=>t.visible&&!t.muted)
    .flatMap(t=>t.clips.filter(c=>!c.audioDetached).map(c=>c.assetId)))]
    .filter(id=>p.assets[id].kind!=='image'&&p.assets[id].metadata?.hasAudio!==false);
  const pcmEstimate=(id:string)=>p.assets[id].duration/SECOND*context.sampleRate*2*4;
  let decodedBytes=0;
  const decoded=new Map<string,AudioBuffer>();
  for(const id of ids){
    signal.throwIfAborted();
    const resource=resources[id];
    if(!resource)continue;
    if(decodedBytes+pcmEstimate(id)+resource.blob.size>AUDIO_MEMORY_BUDGET)return undefined;
    let buffer:AudioBuffer;
    try {
      const bytes=await resource.blob.arrayBuffer();
      signal.throwIfAborted();
      buffer=await context.decodeAudioData(bytes);
    } catch {
      signal.throwIfAborted();
      return undefined;
    }
    signal.throwIfAborted();
    decodedBytes+=buffer.length*buffer.numberOfChannels*4;
    if(decodedBytes>AUDIO_MEMORY_BUDGET)return undefined;
    decoded.set(id,buffer);
  }
  return decoded;
}
