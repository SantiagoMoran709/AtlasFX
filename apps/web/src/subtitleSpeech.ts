import {SECOND,sourceSpan,type Clip,type Project,type Track} from '@corte/core';
import type {MediaResource} from './media';
import {contiguousSpeechSpans,placeSpeechCue,type SpeechCue,type SubtitleCue} from './subtitleTiming';

interface SpeechLanguage {id:string;label:string}
interface LocalSpeech {
  languages():Promise<SpeechLanguage[]>;
  transcribe(wav:Uint8Array,language:string):Promise<SpeechCue[]>;
  cancel():Promise<void>;
}

declare global {
  interface Window {atlasfxSpeech?:LocalSpeech}
}

const sampleRate=16000;
const windowSize=50*sampleRate;
const contextSize=2*sampleRate;

export function speechClips(project:Project,track:Track){
  return track.clips.filter(clip=>{
    const asset=project.assets[clip.assetId];
    return !clip.audioDetached&&asset.kind!=='image'&&asset.metadata?.hasAudio!==false;
  });
}

function wavSamples(buffer:AudioBuffer,start:number,end:number){
  const bytes=new Uint8Array(44+(end-start)*2);
  const view=new DataView(bytes.buffer);
  const tag=(offset:number,value:string)=>bytes.set([...value].map(char=>char.charCodeAt(0)),offset);
  tag(0,'RIFF');view.setUint32(4,bytes.length-8,true);tag(8,'WAVE');tag(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);
  view.setUint16(32,2,true);view.setUint16(34,16,true);tag(36,'data');
  view.setUint32(40,bytes.length-44,true);

  const channels=Array.from({length:buffer.numberOfChannels},(_,channel)=>buffer.getChannelData(channel));
  let audible=false;
  for(let index=start;index<end;index++){
    let sample=0;
    for(const channel of channels)sample+=channel[index];
    sample=Math.max(-1,Math.min(1,sample/channels.length));
    if(Math.abs(sample)>.001)audible=true;
    view.setInt16(44+2*(index-start),Math.round(sample*32767),true);
  }
  return audible?bytes:undefined;
}

async function recognizeClip(
  clip:Clip,buffer:AudioBuffer,speech:LocalSpeech,language:string,signal:AbortSignal,
  update:(fraction:number)=>void,
){
  const start=Math.max(0,Math.floor(clip.sourceIn/SECOND*sampleRate));
  const stop=Math.min(buffer.length,Math.ceil((clip.sourceIn+sourceSpan(clip.duration,clip.speed))/SECOND*sampleRate));
  const phrases:SpeechCue[]=[];
  for(let from=start;from<stop;from+=windowSize){
    signal.throwIfAborted();
    const to=Math.min(stop,from+windowSize);
    const inputStart=Math.max(start,from-contextSize);
    const wav=wavSamples(buffer,inputStart,Math.min(stop,to+contextSize));
    if(wav){
      const found=await speech.transcribe(wav,language);
      signal.throwIfAborted();
      for(const cue of found){
        const middle=inputStart+(cue.start+cue.end)*sampleRate/2;
        if(middle>=from&&middle<to){
          const offset=inputStart/sampleRate;
          phrases.push({...cue,start:offset+cue.start,end:offset+cue.end});
        }
      }
    }
    update((to-start)/(stop-start));
  }
  return phrases;
}

export async function transcribeTrack(
  project:Project,track:Track,resources:Record<string,MediaResource>,language:string,signal:AbortSignal,
  onProgress:(clip:number,total:number,fraction:number)=>void,
){
  const speech=window.atlasfxSpeech;
  if(!speech)throw new Error('Abrí la aplicación de escritorio de AtlasFX en Windows.');
  const clips=contiguousSpeechSpans(speechClips(project,track));
  const context=new OfflineAudioContext(1,1,sampleRate);
  const cues:SubtitleCue[]=[];
  const skipped=new Set<string>();
  const transcripts=new Map<string,SpeechCue[]>();
  let cached:{assetId:string;buffer?:AudioBuffer}|undefined;
  const cancel=()=>{void speech.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try{
    for(const [index,clip] of clips.entries()){
      signal.throwIfAborted();
      onProgress(index+1,clips.length,0);
      const key=`${clip.assetId}/${clip.sourceIn}/${sourceSpan(clip.duration,clip.speed)}`;
      let phrases=transcripts.get(key);
      if(!phrases){
        if(cached?.assetId!==clip.assetId){
          const resource=resources[clip.assetId];
          cached={assetId:clip.assetId};
          if(resource){
            try{cached.buffer=await context.decodeAudioData(await resource.blob.arrayBuffer());}
            catch{/* Report the affected file after processing the other clips. */}
          }
        }
        signal.throwIfAborted();
        if(!cached.buffer){
          skipped.add(project.assets[clip.assetId].name);
          continue;
        }
        phrases=await recognizeClip(clip,cached.buffer,speech,language,signal,
          fraction=>onProgress(index+1,clips.length,fraction));
        transcripts.set(key,phrases);
      }
      for(const phrase of phrases){
        const cue=placeSpeechCue(clip,0,phrase);
        if(cue)cues.push(cue);
      }
    }
    return {cues,skipped:[...skipped]};
  }finally{
    signal.removeEventListener('abort',cancel);
  }
}
