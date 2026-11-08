import {SECOND,sourceSpan,type Clip,type Project} from '@corte/core';

export interface SpeechCue {text:string;start:number;end:number}
export interface SubtitleCue {text:string;start:number;duration:number}

/** Contiguous cuts from the same recording can contain a single spoken phrase. */
export function contiguousSpeechSpans(clips:Clip[]):Clip[]{
  const spans:Clip[]=[];
  for(const clip of clips){
    const previous=spans.at(-1);
    const rate=clip.speed??1;
    if(previous&&previous.assetId===clip.assetId&&(previous.speed??1)===rate&&
        previous.start+previous.duration===clip.start&&
        previous.sourceIn+sourceSpan(previous.duration,rate)===clip.sourceIn){
      previous.duration+=clip.duration;
    }else{
      spans.push({...clip});
    }
  }
  return spans;
}

/** Speech is recognized at source speed. Convert its times to the edited timeline. */
export function placeSpeechCue(clip:Clip,sourceOffset:number,cue:SpeechCue):SubtitleCue|undefined{
  const rate=clip.speed??1;
  const start=Math.max(0,Math.round((sourceOffset+cue.start*SECOND-clip.sourceIn)/rate));
  const end=Math.min(clip.duration,Math.round((sourceOffset+cue.end*SECOND-clip.sourceIn)/rate));
  const text=cue.text.trim().slice(0,1000);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!text)return;
  return {text,start:clip.start+start,duration:end-start};
}

export function missingSubtitleCues(project:Project,cues:SubtitleCue[]):SubtitleCue[]{
  const occupied=project.tracks
    .filter(track=>track.role==='titles'&&track.name==='Subtítulos')
    .flatMap(track=>track.clips);
  const result:SubtitleCue[]=[];
  let lastEnd=0;
  for(const cue of cues.slice().sort((a,b)=>a.start-b.start||b.duration-a.duration)){
    const end=cue.start+cue.duration;
    if(cue.start<lastEnd||occupied.some(clip=>clip.start<end&&clip.start+clip.duration>cue.start))continue;
    result.push(cue);
    lastEnd=end;
  }
  return result;
}
