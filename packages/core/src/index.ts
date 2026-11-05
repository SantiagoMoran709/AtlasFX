import { produce } from 'immer';
import {
  pruneTransitions,
  validateTransitions,
  type Transition,
} from './transitions';
import { frameToTime, secToTime, sourceSpan, SECOND, type Time } from './time';

export * from './time';
export type Kind = 'video' | 'audio' | 'image';
export interface MediaMetadata {
  hasAudio: boolean;
  hasVideo: boolean;
  audioCodec?: string;
  videoCodec?: string;
  averageFps?: number;
  rotation?: number;
}
export interface Asset {
  id: string;
  name: string;
  kind: Kind;
  duration: Time;
  mime: string;
  width?: number;
  height?: number;
  generated?: 'title';
  metadata?: MediaMetadata;
}
export interface TitleStyle {
  text: string;
  size: number;
  color: string;
  x: number;
  y: number;
  bold: boolean;
}
export interface Clip {
  audioOnly?: true;
  audioDetached?: true;
  id: string;
  assetId: string;
  start: Time;
  duration: Time;
  sourceIn: Time;
  volume: number;
  opacity: number;
  scale: number;
  rotation: number;
  speed?: number;
  fadeIn?: Time;
  fadeOut?: Time;
  color?: {
    exposure: number;
    contrast: number;
    saturation: number;
    hue: number;
  };
  title?: TitleStyle;
}
export interface Track {
  id: string;
  name: string;
  kind: 'video' | 'audio';
  muted: boolean;
  locked: boolean;
  visible: boolean;
  clips: Clip[];
  volume?: number;
  role?: 'titles';
  transitions?: Transition[];
}
export interface Project {
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: {
    width: number;
    height: number;
    fps: number;
    sampleRate: number;
    masterVolume?: number;
  };
  assets: Record<string, Asset>;
  tracks: Track[];
  notes?: string;
  markers?: { id: string; time: Time; name: string }[];
}
export const MAX_TRACKS = 100;
export const seconds = secToTime;
export const uid = (): string => crypto.randomUUID();
export function createProject(name = 'Mi primer proyecto'): Project {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    settings: { width: 1920, height: 1080, fps: 30, sampleRate: 48000 },
    assets: {},
    tracks: [createTrack('video', 'Video 1'), createTrack('audio', 'Audio 1')],
  };
}
export function createTrack(kind: Track['kind'], name: string): Track {
  return {
    id: uid(),
    name,
    kind,
    muted: false,
    locked: false,
    visible: true,
    clips: [],
  };
}
export function createClip(asset: Asset, start = 0): Clip {
  return {
    id: uid(),
    assetId: asset.id,
    start,
    duration: asset.duration,
    sourceIn: 0,
    volume: 1,
    opacity: 1,
    scale: 1,
    rotation: 0,
  };
}
export const endTime = (p: Project): Time =>
  Math.max(
    0,
    ...p.tracks.flatMap((t) => t.clips.map((c) => c.start + c.duration)),
  );
export const findClip = (p: Project, id: string) =>
  p.tracks.flatMap((t) => t.clips).find((c) => c.id === id);
export function activeClips(p: Project, time: Time) {
  return p.tracks
    .filter((t) => t.visible)
    .flatMap((track) =>
      track.clips
        .filter((c) => c.start <= time && c.start + c.duration > time)
        .map((clip) => ({ track, clip, asset: p.assets[clip.assetId] })),
    );
}
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const time = (v: unknown): v is number =>
  finite(v) && Number.isSafeInteger(v) && v >= 0;
export function validateProject(p: Project): void {
  check(p && p.version === 1, 'Versión de proyecto no compatible.');
  check(
    typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      p.name.length <= 200,
    'Proyecto no válido.',
  );
  check(
    p.settings &&
      [p.settings.width, p.settings.height].every(
        (n) => Number.isInteger(n) && n >= 16 && n <= 7680,
      ) &&
      finite(p.settings.fps) &&
      p.settings.fps >= 1 &&
      p.settings.fps <= 120,
    'Configuración no válida.',
  );
  check(p.settings.sampleRate === 48000, 'Frecuencia de audio no compatible.');
  check(
    p.settings.masterVolume === undefined ||
      (finite(p.settings.masterVolume) &&
        p.settings.masterVolume >= 0 &&
        p.settings.masterVolume <= 2),
    'Volumen maestro no válido.',
  );
  check(
    p.notes === undefined ||
      (typeof p.notes === 'string' && p.notes.length <= 20000),
    'Notas no válidas.',
  );
  check(
    p.assets &&
      typeof p.assets === 'object' &&
      !Array.isArray(p.assets) &&
      Array.isArray(p.tracks),
    'Estructura de proyecto no válida.',
  );
  check(
    p.tracks.length <= MAX_TRACKS,
    `El proyecto admite hasta ${MAX_TRACKS} pistas en total.`,
  );
  const ids = new Set<string>([p.id]);
  const id = (v: string) => {
    check(
      typeof v === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          v,
        ) &&
        !ids.has(v),
      'ID duplicado o no válido.',
    );
    ids.add(v);
  };
  if (p.markers !== undefined) {
    check(Array.isArray(p.markers), 'Marcadores no válidos.');
    for (const m of p.markers) {
      id(m.id);
      check(
        time(m.time) && typeof m.name === 'string' && m.name.length <= 200,
        'Marcador no válido.',
      );
    }
  }
  for (const [key, a] of Object.entries(p.assets)) {
    check(a && key === a.id, 'Referencia de medio no válida.');
    id(a.id);
    check(
      ['video', 'audio', 'image'].includes(a.kind) &&
        typeof a.name === 'string' &&
        typeof a.mime === 'string' &&
        time(a.duration) &&
        a.duration > 0,
      'Medio no válido.',
    );
    check(
      a.generated === undefined ||
        (a.generated === 'title' && a.kind === 'image'),
      'Tipo de medio generado no válido.',
    );
    if (a.metadata !== undefined) {
      const m = a.metadata;
      check(
        m &&
          typeof m.hasAudio === 'boolean' &&
          typeof m.hasVideo === 'boolean' &&
          [m.audioCodec, m.videoCodec].every(
            (codec) => codec === undefined || typeof codec === 'string',
          ) &&
          (m.averageFps === undefined ||
            (finite(m.averageFps) && m.averageFps > 0)) &&
          (m.rotation === undefined ||
            (finite(m.rotation) && Math.abs(m.rotation) <= 180)),
        'Metadatos de medio no válidos.',
      );
    }
  }
  for (const t of p.tracks) {
    id(t.id);
    check(
      ['video', 'audio'].includes(t.kind) &&
        typeof t.name === 'string' &&
        [t.muted, t.locked, t.visible].every((v) => typeof v === 'boolean') &&
        Array.isArray(t.clips),
      'Pista no válida.',
    );
    check(
      t.role === undefined || (t.role === 'titles' && t.kind === 'video'),
      'Tipo de pista no válido.',
    );
    check(
      t.volume === undefined ||
        (finite(t.volume) && t.volume >= 0 && t.volume <= 2),
      'Volumen de pista no válido.',
    );
    let end = 0;
    for (const c of t.clips) {
      id(c.id);
      const a = p.assets[c.assetId];
      check(a, 'No se encontró el medio del clip.');
      check(
        (c.audioOnly === undefined ||
          (c.audioOnly === true && a.kind === 'video' && t.kind === 'audio')) &&
          (c.audioDetached === undefined ||
            (c.audioDetached === true &&
              a.kind === 'video' &&
              t.kind === 'video')),
        'Separación de audio no válida.',
      );
      check(
        (t.kind === 'audio') === (a.kind === 'audio' || c.audioOnly === true),
        'El tipo de medio no corresponde a la pista.',
      );
      if (a.generated === 'title') {
        const title = c.title;
        check(
          title &&
            typeof title.text === 'string' &&
            title.text.length <= 1000 &&
            finite(title.size) &&
            title.size >= 12 &&
            title.size <= 500 &&
            typeof title.color === 'string' &&
            /^#[\da-f]{6}$/i.test(title.color) &&
            [title.x, title.y].every((n) => finite(n) && n >= 0 && n <= 100) &&
            typeof title.bold === 'boolean',
          'Ajustes de título no válidos.',
        );
      } else check(c.title === undefined, 'El clip no es un título.');
      check(
        time(c.start) && time(c.duration) && c.duration > 0 && time(c.sourceIn),
        'Tiempo de clip no válido.',
      );
      check(c.start >= end, 'Los clips de una pista no pueden solaparse.');
      const speed = c.speed ?? 1;
      check(
        finite(speed) && speed >= 0.1 && speed <= 8 && c.speed !== null,
        'La velocidad debe estar entre 0.1 y 8.',
      );
      check(
        a.kind === 'image' ||
          c.sourceIn + sourceSpan(c.duration, speed) <= a.duration,
        'El recorte supera la duración del medio.',
      );
      check(
        finite(c.volume) &&
          c.volume >= 0 &&
          c.volume <= 2 &&
          finite(c.opacity) &&
          c.opacity >= 0 &&
          c.opacity <= 1 &&
          finite(c.scale) &&
          c.scale >= 0.1 &&
          c.scale <= 4 &&
          finite(c.rotation) &&
          Math.abs(c.rotation) <= 360,
        'Propiedades de clip no válidas.',
      );
      check(
        [c.fadeIn, c.fadeOut].every(
          (v) => v === undefined || (time(v) && v <= c.duration),
        ),
        'Duración del fundido no válida.',
      );
      if (c.color)
        check(
          finite(c.color.exposure) &&
            Math.abs(c.color.exposure) <= 2 &&
            finite(c.color.contrast) &&
            c.color.contrast >= 0 &&
            c.color.contrast <= 2 &&
            finite(c.color.saturation) &&
            c.color.saturation >= 0 &&
            c.color.saturation <= 2 &&
            finite(c.color.hue) &&
            Math.abs(c.color.hue) <= 180,
          'Ajustes de color no válidos.',
        );
      end = c.start + c.duration;
      check(time(end), 'Duración fuera de rango.');
    }
    validateTransitions(p, t);
  }
}
export function parseProject(json: string): Project {
  const p = JSON.parse(json) as Project;
  validateProject(p);
  return p;
}
export function serialize(p: Project): string {
  validateProject(p);
  return JSON.stringify(p, null, 2);
}
export function edit(p: Project, change: (draft: Project) => void): Project {
  const next = produce(p, (draft) => {
    change(draft);
    draft.tracks.forEach((t) => t.clips.sort((a, b) => a.start - b.start));
    pruneTransitions(draft);
  });
  validateProject(next);
  return next === p
    ? p
    : produce(next, (draft) => {
        draft.updatedAt = new Date().toISOString();
      });
}
function editable(p: Project, clipId: string) {
  const track = p.tracks.find((t) => t.clips.some((c) => c.id === clipId));
  check(track, 'Clip no encontrado.');
  check(!track.locked, 'La pista está bloqueada.');
  return { track, clip: track.clips.find((c) => c.id === clipId)! };
}
export function addClip(
  p: Project,
  assetId: string,
  trackId: string,
  start?: Time,
): Project {
  return edit(p, (d) => {
    const t = d.tracks.find((t) => t.id === trackId);
    check(t && !t.locked, 'Pista no disponible.');
    check(d.assets[assetId], 'Medio no encontrado.');
    t.clips.push(
      createClip(
        d.assets[assetId],
        start ?? Math.max(0, ...t.clips.map((c) => c.start + c.duration)),
      ),
    );
  });
}
export function splitClip(p: Project, id: string, at: Time): Project {
  return edit(p, (d) => {
    const { track, clip } = editable(d, id);
    const left = at - clip.start;
    const right = clip.duration - left;
    const frame = frameToTime(1, d.settings.fps);
    check(
      left >= frame && right >= frame,
      'Deja al menos un fotograma a cada lado del corte.',
    );
    track.clips.push({
      ...clip,
      id: uid(),
      start: at,
      sourceIn: clip.sourceIn + sourceSpan(left, clip.speed),
      duration: right,
      fadeIn: 0,
      fadeOut: Math.min(clip.fadeOut ?? 0, right),
    });
    clip.duration = left;
    clip.fadeIn = Math.min(clip.fadeIn ?? 0, left);
    clip.fadeOut = 0;
  });
}
export function deleteClip(p: Project, id: string): Project {
  return edit(p, (d) => {
    const { track } = editable(d, id);
    track.clips = track.clips.filter((c) => c.id !== id);
  });
}
export function moveClip(
  p: Project,
  id: string,
  start: Time,
  targetId?: string,
): Project {
  return edit(p, (d) => {
    const { track, clip } = editable(d, id);
    const target = d.tracks.find((t) => t.id === (targetId ?? track.id));
    check(
      target && !target.locked && target.kind === track.kind,
      'Pista de destino no disponible.',
    );
    track.clips = track.clips.filter((c) => c.id !== id);
    clip.start = Math.max(0, Math.round(start));
    target.clips.push(clip);
  });
}
export function trimClip(
  p: Project,
  id: string,
  sourceIn: Time,
  duration: Time,
): Project {
  return edit(p, (d) => {
    const { clip } = editable(d, id);
    const asset = d.assets[clip.assetId];
    check(
      time(sourceIn) && time(duration) && duration > 0,
      'Tiempo de recorte no válido.',
    );
    if (asset.kind !== 'image') {
      const available = asset.duration - sourceIn;
      check(available > 0, 'La entrada supera la duración del medio.');
      const speed = clip.speed ?? 1;
      if (sourceSpan(duration, speed) > available)
        duration = Math.floor(available / speed);
      check(duration > 0, 'El recorte debe dejar una duración positiva.');
    }
    clip.sourceIn = sourceIn;
    clip.duration = duration;
    clip.fadeIn = Math.min(clip.fadeIn ?? 0, duration);
    clip.fadeOut = Math.min(clip.fadeOut ?? 0, duration);
  });
}
export function setClipProps(
  p: Project,
  id: string,
  props: Partial<
    Pick<
      Clip,
      | 'volume'
      | 'opacity'
      | 'scale'
      | 'rotation'
      | 'color'
      | 'fadeIn'
      | 'fadeOut'
      | 'title'
    >
  >,
): Project {
  return edit(p, (d) => {
    Object.assign(editable(d, id).clip, props);
  });
}
export function snap(value: Time, points: Time[], threshold: Time): Time {
  let result = value;
  let delta = threshold + 1;
  for (const point of points) {
    const diff = Math.abs(point - value);
    if (diff <= threshold && diff < delta) {
      result = point;
      delta = diff;
    }
  }
  return result;
}
export interface History {
  past: Project[];
  present: Project;
  future: Project[];
}
export type EditCommand = (project: Project) => Project;
export const history = (p: Project): History => ({
  past: [],
  present: p,
  future: [],
});
export const commit = (h: History, p: Project): History =>
  p === h.present
    ? h
    : { past: [...h.past.slice(-99), h.present], present: p, future: [] };
export function execute(h: History, command: EditCommand): History {
  const next = command(h.present);
  validateProject(next);
  return commit(h, next);
}
export function batch(...commands: EditCommand[]): EditCommand {
  return (project) =>
    commands.reduce((current, command) => command(current), project);
}
export const undo = (h: History): History =>
  h.past.length
    ? {
        past: h.past.slice(0, -1),
        present: h.past.at(-1)!,
        future: [h.present, ...h.future],
      }
    : h;
export const redo = (h: History): History =>
  h.future.length
    ? {
        past: [...h.past, h.present],
        present: h.future[0],
        future: h.future.slice(1),
      }
    : h;
export function fadeEnvelope(c: Clip, at: Time): number {
  const t = at - c.start;
  if (t < 0 || t >= c.duration) return 0;
  return Math.min(
    1,
    c.fadeIn ? t / c.fadeIn : 1,
    c.fadeOut ? (c.duration - t) / c.fadeOut : 1,
  );
}
export * from './editing';
export * from './detachAudio';
export * from './transitions';

export function addTitle(
  project: Project,
  start: Time,
  clipId = uid(),
): Project {
  return edit(project, (draft) => {
    const duration = 3 * SECOND;
    const asset: Asset = {
      id: uid(),
      name: 'Título',
      kind: 'image',
      duration,
      mime: '',
      generated: 'title',
    };
    const top = draft.tracks[0];
    const available =
      top?.role === 'titles' &&
      top.visible &&
      !top.locked &&
      top.clips.every(
        (clip) =>
          clip.start + clip.duration <= start || clip.start >= start + duration,
      );
    const track = available
      ? top
      : { ...createTrack('video', 'Títulos'), role: 'titles' as const };
    if (!available) draft.tracks.unshift(track);
    draft.assets[asset.id] = asset;
    track.clips.push({
      ...createClip(asset, start),
      id: clipId,
      title: {
        text: 'Escribe tu título',
        size: 72,
        color: '#ffffff',
        x: 50,
        y: 50,
        bold: true,
      },
    });
  });
}
