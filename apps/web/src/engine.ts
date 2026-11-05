import {activeClips, fadeEnvelope, transitionNear, sourceSpan, SECOND, type Asset, type Clip, type Project, type Track} from '@corte/core';
import type {MediaResource} from './media';
import {AudioGraph,silentLevels} from './audioGraph';
import {prepareAudio} from './scheduledAudio';
import {ChromaRenderer} from './chromaKey';

const MAX_IDLE_MEDIA = 12;
const IDLE_MEDIA_MS = 2500;

/** The same compositor is used by preview and real-time browser export. */
export class Compositor {
  private elements = new Map<string,HTMLVideoElement|HTMLAudioElement|HTMLImageElement>();
  private urls = new Map<string,string>();
  private lastUsed = new Map<string, number>();
  private graph?:AudioGraph;
  private transitionCanvas?: HTMLCanvasElement;
  private chroma?: ChromaRenderer;
  private scheduledBuffers?:Map<string,AudioBuffer>;
  private failed = new Set<string>();
  private lastActive=new Set<string>();private pendingSeek=new Set<string>();private previousTime=0;private sourceMapping=new Map<string,string>();
  constructor(private canvas: HTMLCanvasElement,private onError?: (message:string)=>void) {}
  async connectAudio() {
    this.graph??=new AudioGraph(false);await this.graph.resume();return this.graph.destination.stream;
  }
  async startPreviewAudio(){this.graph??=new AudioGraph(true);await this.graph.resume();}
  audioClock(){return this.graph?.context.currentTime;}
  async prepareExportAudio(p:Project,resources:Record<string,MediaResource>,signal:AbortSignal){if(this.graph)this.scheduledBuffers=await prepareAudio(this.graph.context,p,resources,signal);return !!this.scheduledBuffers;}
  startExportAudio(p:Project){return this.graph&&this.scheduledBuffers?this.graph.schedule(p,this.scheduledBuffers):this.audioClock();}
  meterLevels=()=>this.graph?.levels()??silentLevels();
  previewBusVolume(id:string,value?:number){this.graph?.overrideBus(id,value);}
  previewClipVolume(id:string,value?:number){this.graph?.overrideClip(id,value);}
  monitorVolume(value:number){this.graph?.setMonitorVolume(value);}
  render(project: Project, resources: Record<string, MediaResource>, at: number, playing: boolean) {
    const ctx = this.canvas.getContext('2d')!;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const active = new Map(activeClips(project, at).map(layer => [layer.track.id, layer.clip]));
    const needed = new Set<string>();
    const now = performance.now();
    const backwards = at < this.previousTime;
    this.previousTime = at;
    this.graph?.configure(project);

    // Track zero is the topmost layer.
    for (const track of project.tracks.slice().reverse()) {
      if (!track.visible) continue;
      const current = active.get(track.id);
      const cut = transitionNear(track, at, playing ? SECOND : 0);
      const prepare = (clip: Clip, sampleAt: number, advance: boolean) => {
        const asset = project.assets[clip.assetId];
        const resource = resources[asset.id];
        if (asset.generated || (this.scheduledBuffers && track.kind === 'audio')) return;
        if (!resource) {
          if (this.elements.has(clip.id)) this.release(clip.id);
          return;
        }
        needed.add(clip.id);
        this.updateMedia(clip, track, asset, resource, sampleAt, at, advance, backwards, project.settings.fps);
        this.lastUsed.set(clip.id, now);
      };
      if (cut && cut.progress >= 0) {
        prepare(cut.from, at, playing);
        prepare(cut.to, at, playing);
        if (this.drawTransition(ctx, cut, at, project.settings.height)) continue;
      } else {
        if (cut && cut.to !== current) prepare(cut.to, cut.start, false);
        if (current) prepare(current, at, playing);
        if (playing && !cut && (!current || current.start + current.duration <= at + SECOND)) {
          const next = track.clips.find(clip => clip.start > at && clip.start <= at + SECOND);
          if (next) prepare(next, next.start, false);
        }
      }
      if (current) this.drawClip(ctx, current, at, project.settings.height);
    }
    const existing = new Set(project.tracks.flatMap(t => t.clips.map(c => c.id)));
    const idle: {id: string; used: number}[] = [];
    for (const [id, element] of this.elements) {
      if (needed.has(id)) continue;
      const used = this.lastUsed.get(id) ?? 0;
      if (!existing.has(id) || now - used >= IDLE_MEDIA_MS) this.release(id);
      else {
        idle.push({id, used});
        if (element instanceof HTMLMediaElement) {
          element.pause();
          this.graph?.muteClip(id);
        }
      }
    }
    if (idle.length > MAX_IDLE_MEDIA) {
      idle.sort((a, b) => b.used - a.used);
      idle.slice(MAX_IDLE_MEDIA).forEach(({id}) => this.release(id));
    }
    this.lastActive = needed;
  }

  private updateMedia(clip: Clip, track: Track, asset: Asset, resource: MediaResource,
      sampleAt: number, at: number, playing: boolean, backwards: boolean, fps: number) {
    let element = this.elements.get(clip.id);
    if (element && this.urls.get(clip.id) !== resource.url) {
      this.release(clip.id);
      element = undefined;
    }
    if (!element) {
      element = asset.kind === 'image' ? new Image() : document.createElement(track.kind === 'audio' ? 'audio' : 'video');
      if (element instanceof HTMLMediaElement) {
        this.pendingSeek.add(clip.id);
        element.preload = 'auto';
        if (element instanceof HTMLVideoElement) element.playsInline = true;
        element.addEventListener('error', () => {
          if (this.failed.has(asset.id)) return;
          this.failed.add(asset.id);
          this.onError?.(`No se puede reproducir ${asset.name}. Reubica el medio o conviértelo a un códec compatible.`);
        });
      }
      element.src = resource.url;
      this.elements.set(clip.id, element);
      this.urls.set(clip.id, resource.url);
    }
    if (!(element instanceof HTMLMediaElement)) return;
    const speed = clip.speed ?? 1;
    const raw = clip.sourceIn + sourceSpan(sampleAt - clip.start, speed);
    const lastFrame = asset.duration - Math.min(Math.round(SECOND / fps), Math.floor(asset.duration / 2));
    const advancing = playing && raw >= 0 && raw < asset.duration;
    const holdingEnd = raw >= asset.duration;
    const source = Math.max(0, holdingEnd ? lastFrame : raw) / SECOND;
    const mapping = `${clip.start}/${clip.sourceIn}/${speed}/${advancing}`;
    if (!this.lastActive.has(clip.id) || backwards || this.sourceMapping.get(clip.id) !== mapping) this.pendingSeek.add(clip.id);
    this.sourceMapping.set(clip.id, mapping);
    // Repeated seeks during playback interrupt audio. Seek at activation or when holding an edge frame.
    if (element.readyState >= 1 && (!advancing || this.pendingSeek.has(clip.id))) {
      const hasEndFrame = holdingEnd && element.readyState >= 2 && element.currentTime >= source - .008;
      if (!hasEndFrame && Math.abs(element.currentTime - source) > .008) element.currentTime = source;
      this.pendingSeek.delete(clip.id);
    }
    const envelope = fadeEnvelope(clip, at);
    if (element.playbackRate !== speed) element.playbackRate = speed;
    element.muted = !!this.scheduledBuffers || !!clip.audioDetached;
    if (this.graph && !this.scheduledBuffers) {
      this.graph.attach(clip.id, element, track.id);
      this.graph.clipGain(clip.id, clip.volume, clip.audioDetached ? 0 : envelope);
    } else if (!this.graph) {
      element.volume = Math.min(1, (track.muted ? 0 : clip.volume) * (track.volume ?? 1) * envelope);
    }
    if (advancing && element.paused) void element.play().catch(() => {});
    else if (!advancing && !element.paused) element.pause();
  }

  private drawable(id: string) {
    const element = this.elements.get(id);
    if (element instanceof HTMLVideoElement && element.readyState >= 2 && element.videoWidth) return element;
    if (element instanceof HTMLImageElement && element.complete && element.naturalWidth) return element;
    return undefined;
  }

  private drawClip(ctx: CanvasRenderingContext2D, clip: Clip, at: number, projectHeight: number, weight = 1) {
    const drawable = this.drawable(clip.id);
    if (!clip.title && !drawable) return;
    const {width, height} = this.canvas;
    const localTime = Math.max(clip.start, Math.min(at, clip.start + clip.duration - 1));
    ctx.save();
    ctx.globalAlpha = weight * clip.opacity * fadeEnvelope(clip, localTime);
    const color = clip.color;
    ctx.filter = color ? `brightness(${2 ** color.exposure}) contrast(${color.contrast}) saturate(${color.saturation}) hue-rotate(${color.hue}deg)` : 'none';
    if (clip.title) {
      const title = clip.title;
      const size = title.size * height / projectHeight * clip.scale;
      ctx.translate(width * title.x / 100, height * title.y / 100);
      ctx.rotate(clip.rotation * Math.PI / 180);
      ctx.fillStyle = title.color;
      ctx.font = `${title.bold ? '700' : '400'} ${size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = title.text.split(/\r?\n/);
      lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * size * 1.2, width * .9));
    } else if (drawable) {
      const w = drawable instanceof HTMLVideoElement ? drawable.videoWidth : drawable.naturalWidth;
      const h = drawable instanceof HTMLVideoElement ? drawable.videoHeight : drawable.naturalHeight;
      const scale = Math.min(width / w, height / h) * clip.scale;
      ctx.translate(width / 2, height / 2);
      ctx.rotate(clip.rotation * Math.PI / 180);
      const frame = clip.chromaKey?.enabled
        ? (this.chroma ??= new ChromaRenderer()).render(drawable, w, h, scale, clip.chromaKey)
        : drawable;
      ctx.drawImage(frame, -w * scale / 2, -h * scale / 2, w * scale, h * scale);
    }
    ctx.restore();
  }

  private drawTransition(ctx: CanvasRenderingContext2D, cut: NonNullable<ReturnType<typeof transitionNear>>, at: number, projectHeight: number) {
    if (!this.drawable(cut.from.id) || !this.drawable(cut.to.id)) return false;
    const {width, height} = this.canvas;
    if (cut.transition.kind === 'wipe') {
      const boundary = Math.round(width * cut.progress);
      for (const [clip, x, w] of [[cut.to, 0, boundary], [cut.from, boundary, width - boundary]] as const) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, 0, w, height);
        ctx.clip();
        this.drawClip(ctx, clip, at, projectHeight);
        ctx.restore();
      }
      return true;
    }
    const scratch = this.transitionCanvas ??= document.createElement('canvas');
    if (scratch.width !== width) scratch.width = width;
    if (scratch.height !== height) scratch.height = height;
    const blend = scratch.getContext('2d')!;
    blend.clearRect(0, 0, width, height);
    blend.globalCompositeOperation = 'lighter';
    this.drawClip(blend, cut.from, at, projectHeight, 1 - cut.progress);
    this.drawClip(blend, cut.to, at, projectHeight, cut.progress);
    ctx.drawImage(scratch, 0, 0);
    return true;
  }
  private release(id:string){const el=this.elements.get(id);if(el instanceof HTMLMediaElement){el.pause();el.removeAttribute('src');el.load();}this.graph?.release(id);this.elements.delete(id);this.urls.delete(id);this.lastUsed.delete(id);this.pendingSeek.delete(id);this.sourceMapping.delete(id);}
  dispose(){for(const id of this.elements.keys())this.release(id);this.graph?.dispose();this.chroma?.dispose();}
}
