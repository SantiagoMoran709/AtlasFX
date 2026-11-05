import {SECOND,type Project} from '@corte/core';
type Stereo=[number,number];
export interface MeterLevels {master:Stereo;tracks:Record<string,Stereo>}
export const silentLevels=():MeterLevels=>({master:[-60,-60],tracks:{}});
interface StereoMeter {split:ChannelSplitterNode;analysers:[AnalyserNode,AnalyserNode];samples:Float32Array<ArrayBuffer>}
interface Bus {gain:GainNode;meter:StereoMeter}
export class AudioGraph{
  readonly context=new AudioContext();readonly destination=this.context.createMediaStreamDestination();
  private master=this.context.createGain();private monitor=this.context.createGain();private masterMeter:StereoMeter;
  private buses=new Map<string,Bus>();private clips=new Map<string,{source:MediaElementAudioSourceNode;gain:GainNode;trackId:string}>();
  private overrides=new Map<string,number>();private clipOverrides=new Map<string,number>();
  private clock=this.context.createConstantSource();private parameterValues=new WeakMap<AudioParam,number>();
  private scheduled=new Set<{source:AudioBufferSourceNode;gain:GainNode}>();
  private setGain(parameter:AudioParam,value:number){if(this.parameterValues.get(parameter)===value)return;parameter.cancelScheduledValues(this.context.currentTime);parameter.setTargetAtTime(value,this.context.currentTime,.005);this.parameterValues.set(parameter,value);}
  constructor(speakers:boolean){this.master.channelCount=2;this.master.channelCountMode='explicit';this.master.connect(this.destination);if(speakers){this.master.connect(this.monitor);this.monitor.connect(this.context.destination);}this.masterMeter=this.meter(this.master);this.clock.offset.value=0;this.clock.connect(this.master);this.clock.start();}
  private meter(input:AudioNode):StereoMeter{const split=this.context.createChannelSplitter(2);input.connect(split);const analysers:[AnalyserNode,AnalyserNode]=[this.context.createAnalyser(),this.context.createAnalyser()];analysers.forEach((a,i)=>{a.fftSize=1024;split.connect(a,i);});return {split,analysers,samples:new Float32Array(new ArrayBuffer(1024*4))};}
  private bus(id:string):Bus{let b=this.buses.get(id);if(!b){const gain=this.context.createGain();gain.channelCount=2;gain.channelCountMode='explicit';gain.connect(this.master);b={gain,meter:this.meter(gain)};this.buses.set(id,b);}return b;}
  configure(p:Project){this.setGain(this.master.gain,this.overrides.get('master')??p.settings.masterVolume??1);for(const t of p.tracks){const bus=this.bus(t.id);this.setGain(bus.gain.gain,t.muted||!t.visible?0:this.overrides.get(t.id)??t.volume??1);}for(const [id,b]of this.buses)if(!p.tracks.some(t=>t.id===id)){b.gain.disconnect();b.meter.split.disconnect();b.meter.analysers.forEach(a=>a.disconnect());this.buses.delete(id);}}
  attach(id:string,el:HTMLMediaElement,trackId:string){let node=this.clips.get(id);if(!node){const source=this.context.createMediaElementSource(el);const gain=this.context.createGain();source.connect(gain);gain.connect(this.bus(trackId).gain);node={source,gain,trackId};this.clips.set(id,node);}else if(node.trackId!==trackId){node.gain.disconnect();node.gain.connect(this.bus(trackId).gain);node.trackId=trackId;}el.volume=1;}
  clipGain(id:string,value:number,envelope=1){const node=this.clips.get(id);if(node)this.setGain(node.gain.gain,(this.clipOverrides.get(id)??value)*envelope);}
  muteClip(id:string){const node=this.clips.get(id);if(node)this.setGain(node.gain.gain,0);}
  overrideBus(id:string,value?:number){if(value===undefined)this.overrides.delete(id);else this.overrides.set(id,value);}
  overrideClip(id:string,value?:number){if(value===undefined)this.clipOverrides.delete(id);else this.clipOverrides.set(id,value);}
  setMonitorVolume(value:number){this.monitor.gain.value=value;}
  async resume(){await this.context.resume();}
  schedule(p:Project,buffers:Map<string,AudioBuffer>):number{const start=this.context.currentTime;this.configure(p);for(const track of p.tracks){if(!track.visible||track.muted)continue;for(const clip of track.clips){if(clip.audioDetached)continue;const buffer=buffers.get(clip.assetId);if(!buffer)continue;const offset=clip.sourceIn/SECOND,rate=clip.speed??1,duration=Math.min(clip.duration/SECOND,(buffer.duration-offset)/rate);if(duration<=0)continue;const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;source.playbackRate.value=rate;source.connect(gain);gain.connect(this.bus(track.id).gain);const when=start+clip.start/SECOND,fadeIn=(clip.fadeIn??0)/SECOND,fadeOut=(clip.fadeOut??0)/SECOND;const envelope=(t:number)=>Math.min(1,fadeIn?t/fadeIn:1,fadeOut?(duration-t)/fadeOut:1);const points=[...new Set([0,duration,fadeIn,duration-fadeOut,fadeIn&&fadeOut?duration*fadeIn/(fadeIn+fadeOut):0])].filter(t=>t>=0&&t<=duration).sort((a,b)=>a-b);gain.gain.setValueAtTime(clip.volume*envelope(0),when);for(const point of points.slice(1))gain.gain.linearRampToValueAtTime(clip.volume*envelope(point),when+point);const node={source,gain};this.scheduled.add(node);source.onended=()=>{source.disconnect();gain.disconnect();this.scheduled.delete(node);};source.start(when,offset,duration*rate);}}
    return start;
  }
  private read(m:StereoMeter):Stereo{return m.analysers.map(a=>{a.getFloatTimeDomainData(m.samples);let peak=0;for(const n of m.samples)peak=Math.max(peak,Math.abs(n));return Math.max(-60,Math.min(6,20*Math.log10(Math.max(peak,.000001))));}) as Stereo;}
  levels():MeterLevels{const tracks:Record<string,Stereo>={};for(const [id,b]of this.buses)tracks[id]=this.read(b.meter);return {master:this.read(this.masterMeter),tracks};}
  release(id:string){const node=this.clips.get(id);node?.source.disconnect();node?.gain.disconnect();this.clips.delete(id);this.clipOverrides.delete(id);}
  dispose(){for(const id of this.clips.keys())this.release(id);for(const node of this.scheduled){node.source.stop();node.source.disconnect();node.gain.disconnect();}this.scheduled.clear();this.clock.stop();void this.context.close();}
}
