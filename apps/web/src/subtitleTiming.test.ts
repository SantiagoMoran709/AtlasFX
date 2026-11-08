import {describe,expect,it} from 'vitest';
import {addSubtitles,createProject,seconds,type Clip} from '@corte/core';
import {contiguousSpeechSpans,missingSubtitleCues,placeSpeechCue} from './subtitleTiming';

function clip(start:number,sourceIn:number,duration:number,speed=1):Clip {
  return {id:crypto.randomUUID(),assetId:'recording',start:seconds(start),sourceIn:seconds(sourceIn),
    duration:seconds(duration),speed,volume:1,opacity:1,scale:1,rotation:0};
}

describe('subtítulos sobre la línea de tiempo',()=>{
  it('mantiene la frase entre cortes continuos y ubica las copias posteriores en su propio tiempo',()=>{
    const spans=contiguousSpeechSpans([clip(0,4,2,2),clip(2,8,2,2),clip(6,4,4,2)]);
    expect(spans.map(span=>[span.start,span.duration])).toEqual([[0,seconds(4)],[seconds(6),seconds(4)]]);
    const phrase={text:'Una frase completa',start:7,end:9};
    expect(spans.map(span=>placeSpeechCue(span,0,phrase))).toEqual([
      {text:phrase.text,start:seconds(1.5),duration:seconds(1)},
      {text:phrase.text,start:seconds(7.5),duration:seconds(1)},
    ]);
  });

  it('completa el tramo posterior sin reemplazar los subtítulos editados',()=>{
    const project=addSubtitles(createProject(),[{text:'Subtítulo corregido',start:0,duration:seconds(2)}]);
    const missing=missingSubtitleCues(project,[
      {text:'Transcripción nueva',start:seconds(1),duration:seconds(1)},
      {text:'Frase posterior',start:seconds(5),duration:seconds(1)},
    ]);
    expect(missing.map(cue=>cue.text)).toEqual(['Frase posterior']);
    expect(addSubtitles(project,missing).tracks[0].clips.map(cue=>cue.title?.text)).toEqual([
      'Subtítulo corregido','Frase posterior',
    ]);
  });
});
