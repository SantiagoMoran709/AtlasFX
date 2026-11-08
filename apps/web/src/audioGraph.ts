import {SECOND,type AudioMixSettings,type Project} from '@corte/core';
import duckingProcessorUrl from './duckingProcessor.js?url&no-inline';
type Stereo=[number,number];
export interface MeterLevels {master:Stereo;tracks:Record<string,Stereo>}
export const silentLevels=():MeterLevels=>({master:[-60,-60],tracks:{}});
interface StereoMeter {split:ChannelSplitterNode;analysers:[AnalyserNode,AnalyserNode];samples:Float32Array<ArrayBuffer>}
interface Bus {input:GainNode;gain:GainNode;output:GainNode;meter:StereoMeter}

export function duckingTracks(project:Project) {
  const mix=project.settings.audioMix;
  if(!mix?.ducking||!mix.voiceTrackId||!mix.musicTrackId||mix.voiceTrackId===mix.musicTrackId)return;
  if(!project.tracks.some(track=>track.id===mix.voiceTrackId)||!project.tracks.some(track=>track.id===mix.musicTrackId))return;
  return {voice:mix.voiceTrackId,music:mix.musicTrackId};
}
export class AudioGraph{
  readonly context=new AudioContext();readonly destination=this.context.createMediaStreamDestination();
  private master=this.context.createGain();private monitor=this.context.createGain();private masterMeter:StereoMeter;
  private buses=new Map<string,Bus>();private clips=new Map<string,{source:MediaElementAudioSourceNode;gain:GainNode;trackId:string}>();
  private overrides=new Map<string,number>();private clipOverrides=new Map<string,number>();
  private clock=this.context.createConstantSource();private parameterValues=new WeakMap<AudioParam,number>();
  private scheduled=new Set<{source:AudioBufferSourceNode;gain:GainNode}>();
  private voiceEQ = [
    new BiquadFilterNode(this.context,{type:'lowshelf',frequency:200}),
    new BiquadFilterNode(this.context,{type:'peaking',frequency:3500,Q:1}),
    new BiquadFilterNode(this.context,{type:'highshelf',frequency:6000}),
  ];
  private eqBus?:Bus;
  private voicePreview:Partial<Pick<AudioMixSettings,'body'|'clarity'|'deEss'>> = {};
  private ducking?:AudioWorkletNode;
  private duckingLoad?:Promise<void>;
  private duckingFailed=false;
  private duckingRoute?:{voice:Bus;music:Bus};
  private disposed=false;

  async prepareDucking(project:Project) {
    if(!duckingTracks(project))return;
    await this.loadDucking();
    if(!this.ducking&&!this.disposed)throw new Error('No se pudo iniciar la reducción automática de música.');
  }

  private loadDucking(){
    this.duckingLoad??=(async()=>{
      if(!this.context.audioWorklet)throw new Error('AudioWorklet no disponible');
      await this.context.audioWorklet.addModule(duckingProcessorUrl);
      if(this.disposed)return;
      this.ducking=new AudioWorkletNode(this.context,'atlas-ducking',{
        numberOfInputs:2,numberOfOutputs:1,outputChannelCount:[2],
        channelCount:2,channelCountMode:'explicit',
      });
    })().catch(()=>{
      if(this.disposed)return;
      this.duckingFailed=true;
      this.onError?.('No se pudo iniciar la reducción automática de música.');
    });
    return this.duckingLoad;
  }

  previewVoiceBand(band:'body'|'clarity'|'deEss',value?:number) {
    this.voicePreview[band]=value;
  }

  private configureEffects(project:Project){
    const mix=project.settings.audioMix;
    const voice=mix?.eqEnabled&&project.tracks.some(track=>track.id===mix.voiceTrackId)
      ?this.buses.get(mix.voiceTrackId!):undefined;
    const [body,clarity,deEss]=this.voiceEQ;
    if(voice!==this.eqBus){
      if(this.eqBus){
        this.eqBus.input.disconnect(body);
        deEss.disconnect(this.eqBus.gain);
        this.eqBus.input.connect(this.eqBus.gain);
      }
      if(voice){
        voice.input.disconnect(voice.gain);
        voice.input.connect(body);
        deEss.connect(voice.gain);
      }
      this.eqBus=voice;
    }
    if(voice&&mix){
      this.setGain(body.gain,this.voicePreview.body??mix.body);
      this.setGain(clarity.gain,this.voicePreview.clarity??mix.clarity);
      this.setGain(deEss.gain,this.voicePreview.deEss??mix.deEss);
    }

    const roles=duckingTracks(project);
    if(roles&&!this.ducking&&!this.duckingFailed)void this.loadDucking();
    const sidechain=roles&&this.ducking?this.buses.get(roles.voice):undefined;
    const music=roles&&this.ducking?this.buses.get(roles.music):undefined;
    if(sidechain===this.duckingRoute?.voice&&music===this.duckingRoute?.music)return;

    const processor=this.ducking!;
    const previous=this.duckingRoute;
    if(previous){
      previous.voice.gain.disconnect(processor,0,1);
      previous.music.gain.disconnect(processor,0,0);
      processor.disconnect(previous.music.output);
      previous.music.gain.connect(previous.music.output);
    }
    this.duckingRoute=undefined;
    if(sidechain&&music){
      processor.port.postMessage('reset');
      music.gain.disconnect(music.output);
      music.gain.connect(processor,0,0);
      sidechain.gain.connect(processor,0,1);
      processor.connect(music.output);
      this.duckingRoute={voice:sidechain,music};
    }
  }

  private setGain(parameter:AudioParam,value:number){if(this.parameterValues.get(parameter)===value)return;parameter.cancelScheduledValues(this.context.currentTime);parameter.setTargetAtTime(value,this.context.currentTime,.005);this.parameterValues.set(parameter,value);}
  constructor(speakers:boolean,private onError?:(message:string)=>void){this.voiceEQ[0].connect(this.voiceEQ[1]);this.voiceEQ[1].connect(this.voiceEQ[2]);this.master.channelCount=2;this.master.channelCountMode='explicit';this.master.connect(this.destination);if(speakers){this.master.connect(this.monitor);this.monitor.connect(this.context.destination);}this.masterMeter=this.meter(this.master);this.clock.offset.value=0;this.clock.connect(this.master);this.clock.start();}
  private meter(input:AudioNode):StereoMeter{const split=this.context.createChannelSplitter(2);input.connect(split);const analysers:[AnalyserNode,AnalyserNode]=[this.context.createAnalyser(),this.context.createAnalyser()];analysers.forEach((a,i)=>{a.fftSize=1024;split.connect(a,i);});return {split,analysers,samples:new Float32Array(new ArrayBuffer(1024*4))};}
  private bus(id:string):Bus {
    const existing=this.buses.get(id);
    if(existing)return existing;
    const input=this.context.createGain();
    const gain=this.context.createGain();
    const output=this.context.createGain();
    output.channelCount=2;
    output.channelCountMode='explicit';
    input.connect(gain);
    gain.connect(output);
    output.connect(this.master);
    const bus={input,gain,output,meter:this.meter(output)};
    this.buses.set(id,bus);
    return bus;
  }
  configure(project:Project){
    this.setGain(this.master.gain,this.overrides.get('master')??project.settings.masterVolume??1);
    const ids=new Set(project.tracks.map(track=>track.id));
    for(const track of project.tracks){
      const bus=this.bus(track.id);
      this.setGain(bus.gain.gain,track.muted||!track.visible?0:this.overrides.get(track.id)??track.volume??1);
    }
    this.configureEffects(project);
    for(const [id,bus] of this.buses){
      if(ids.has(id))continue;
      bus.input.disconnect();
      bus.gain.disconnect();
      bus.output.disconnect();
      bus.meter.split.disconnect();
      bus.meter.analysers.forEach(analyser=>analyser.disconnect());
      this.buses.delete(id);
    }
  }
  attach(id:string,el:HTMLMediaElement,trackId:string){let node=this.clips.get(id);if(!node){const source=this.context.createMediaElementSource(el);const gain=this.context.createGain();source.connect(gain);gain.connect(this.bus(trackId).input);node={source,gain,trackId};this.clips.set(id,node);}else if(node.trackId!==trackId){node.gain.disconnect();node.gain.connect(this.bus(trackId).input);node.trackId=trackId;}el.volume=1;}
  clipGain(id:string,value:number,envelope=1){const node=this.clips.get(id);if(node)this.setGain(node.gain.gain,(this.clipOverrides.get(id)??value)*envelope);}
  muteClip(id:string){const node=this.clips.get(id);if(node)this.setGain(node.gain.gain,0);}
  overrideBus(id:string,value?:number){if(value===undefined)this.overrides.delete(id);else this.overrides.set(id,value);}
  overrideClip(id:string,value?:number){if(value===undefined)this.clipOverrides.delete(id);else this.clipOverrides.set(id,value);}
  setMonitorVolume(value:number){this.monitor.gain.value=value;}
  async resume(){await this.context.resume();}
  schedule(project:Project,buffers:Map<string,AudioBuffer>):number{
    const start=this.context.currentTime;
    this.configure(project);
    for(const track of project.tracks){
      if(!track.visible||track.muted)continue;
      for(const clip of track.clips){
        if(clip.audioDetached)continue;
        const buffer=buffers.get(clip.assetId);
        if(!buffer)continue;
        const offset=clip.sourceIn/SECOND;
        const rate=clip.speed??1;
        const clipDuration=clip.duration/SECOND;
        const duration=Math.min(clipDuration,(buffer.duration-offset)/rate);
        if(duration<=0)continue;

        const source=this.context.createBufferSource();
        const gain=this.context.createGain();
        source.buffer=buffer;
        source.playbackRate.value=rate;
        source.connect(gain);
        gain.connect(this.bus(track.id).input);
        const when=start+clip.start/SECOND;
        const fadeIn=(clip.fadeIn??0)/SECOND;
        const fadeOut=(clip.fadeOut??0)/SECOND;
        const envelope=(time:number)=>Math.min(1,fadeIn?time/fadeIn:1,fadeOut?(clipDuration-time)/fadeOut:1);
        const intersection=fadeIn&&fadeOut?clipDuration*fadeIn/(fadeIn+fadeOut):0;
        const points=[...new Set([0,duration,fadeIn,clipDuration-fadeOut,intersection])]
          .filter(time=>time>=0&&time<=duration).sort((a,b)=>a-b);
        gain.gain.setValueAtTime(clip.volume*envelope(0),when);
        for(const time of points.slice(1)){
          gain.gain.linearRampToValueAtTime(clip.volume*envelope(time),when+time);
        }
        const node={source,gain};
        this.scheduled.add(node);
        source.onended=()=>{
          source.disconnect();
          gain.disconnect();
          this.scheduled.delete(node);
        };
        source.start(when,offset,duration*rate);
      }
    }
    return start;
  }
  private read(m:StereoMeter):Stereo{return m.analysers.map(a=>{a.getFloatTimeDomainData(m.samples);let peak=0;for(const n of m.samples)peak=Math.max(peak,Math.abs(n));return Math.max(-60,Math.min(6,20*Math.log10(Math.max(peak,.000001))));}) as Stereo;}
  levels():MeterLevels{const tracks:Record<string,Stereo>={};for(const [id,b]of this.buses)tracks[id]=this.read(b.meter);return {master:this.read(this.masterMeter),tracks};}
  release(id:string){const node=this.clips.get(id);node?.source.disconnect();node?.gain.disconnect();this.clips.delete(id);this.clipOverrides.delete(id);}
  dispose(){this.disposed=true;this.ducking?.port.close();for(const id of this.clips.keys())this.release(id);for(const node of this.scheduled){node.source.stop();node.source.disconnect();node.gain.disconnect();}this.scheduled.clear();this.clock.stop();void this.context.close();}
}
