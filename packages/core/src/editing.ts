import {
  edit,
  uid,
  findClip,
  sourceSpan,
  type Project,
  type Clip,
  type Track,
} from './index';
function target(p: Project, id: string) {
  const track = p.tracks.find((t) => t.clips.some((c) => c.id === id));
  if (!track) throw new Error('Selecciona un clip.');
  if (track.locked) throw new Error('La pista está bloqueada.');
  return { track, clip: track.clips.find((c) => c.id === id)! };
}
export interface ClipClipboard {
  clip: Clip;
  trackId: string;
  kind: Track['kind'];
}
export function copyClip(p: Project, id: string): ClipClipboard {
  const track = p.tracks.find((t) => t.clips.some((c) => c.id === id));
  if (!track) throw new Error('Selecciona un clip.');
  return structuredClone({
    clip: findClip(p, id)!,
    trackId: track.id,
    kind: track.kind,
  });
}
function bounded(c: Clip) {
  c.fadeIn = Math.min(c.fadeIn ?? 0, c.duration);
  c.fadeOut = Math.min(c.fadeOut ?? 0, c.duration);
  return c;
}
export function pasteClip(
  p: Project,
  data: ClipClipboard,
  at: number,
  mode: 'insert' | 'overwrite' | 'overlay' = 'insert',
): Project {
  return edit(p, (d) => {
    if (!d.assets[data.clip.assetId])
      throw new Error('El medio copiado no pertenece a este proyecto.');
    let track = d.tracks.find((t) => t.id === data.trackId && !t.locked);
    if (mode === 'overlay' || !track) {
      track = {
        id: uid(),
        name: `${data.kind === 'audio' ? 'Audio' : 'Video'} ${d.tracks.filter((t) => t.kind === data.kind).length + 1}`,
        kind: data.kind,
        clips: [],
        locked: false,
        muted: false,
        visible: true,
      };
      d.tracks.unshift(track);
    }
    const start = Math.max(0, Math.round(at)),
      end = start + data.clip.duration;
    const clips: Clip[] = [];
    for (const c of track.clips) {
      const cEnd = c.start + c.duration;
      if (mode === 'insert') {
        if (c.start >= start)
          clips.push({ ...c, start: c.start + data.clip.duration });
        else if (cEnd > start) {
          clips.push(bounded({ ...c, duration: start - c.start, fadeOut: 0 }));
          clips.push(
            bounded({
              ...c,
              id: uid(),
              start: end,
              sourceIn: c.sourceIn + sourceSpan(start - c.start, c.speed),
              duration: cEnd - start,
              fadeIn: 0,
            }),
          );
        } else clips.push(c);
      } else if (mode === 'overwrite') {
        if (cEnd <= start || c.start >= end) clips.push(c);
        else {
          if (c.start < start)
            clips.push(
              bounded({ ...c, duration: start - c.start, fadeOut: 0 }),
            );
          if (cEnd > end)
            clips.push(
              bounded({
                ...c,
                id: uid(),
                start: end,
                sourceIn: c.sourceIn + sourceSpan(end - c.start, c.speed),
                duration: cEnd - end,
                fadeIn: 0,
              }),
            );
        }
      } else clips.push(c);
    }
    track.clips = [
      ...clips,
      { ...structuredClone(data.clip), id: uid(), start },
    ];
  });
}
export function duplicateClip(p: Project, id: string): Project {
  const data = copyClip(p, id);
  return pasteClip(p, data, data.clip.start + data.clip.duration);
}
export function rippleDelete(p: Project, id: string): Project {
  return edit(p, (d) => {
    const { track, clip } = target(d, id);
    const end = clip.start + clip.duration;
    track.clips = track.clips
      .filter((c) => c.id !== id)
      .map((c) =>
        c.start >= end ? { ...c, start: c.start - clip.duration } : c,
      );
  });
}
export function closeGaps(p: Project): Project {
  return edit(p, (d) => {
    for (const t of d.tracks) {
      if (t.locked) continue;
      let at = 0;
      t.clips = t.clips.map((c) => {
        const next = { ...c, start: at };
        at += c.duration;
        return next;
      });
    }
  });
}
export function trimAt(
  p: Project,
  id: string,
  at: number,
  side: 'start' | 'end',
): Project {
  return edit(p, (d) => {
    const { clip } = target(d, id);
    if (at <= clip.start || at >= clip.start + clip.duration)
      throw new Error('Coloca el cursor dentro del clip.');
    if (side === 'start') {
      const delta = at - clip.start;
      clip.start = at;
      clip.sourceIn += sourceSpan(delta, clip.speed);
      clip.duration -= delta;
    } else clip.duration = at - clip.start;
    bounded(clip);
  });
}
export function joinNext(p: Project, id: string): Project {
  return edit(p, (d) => {
    const { track, clip } = target(d, id);
    const next = track.clips.find(
      (c) => c.start === clip.start + clip.duration,
    );
    if (
      !next ||
      next.assetId !== clip.assetId ||
      next.sourceIn !== clip.sourceIn + sourceSpan(clip.duration, clip.speed) ||
      (next.speed ?? 1) !== (clip.speed ?? 1)
    )
      throw new Error(
        'Solo se pueden unir cortes consecutivos del mismo medio.',
      );
    for (const key of [
      'audioOnly',
      'audioDetached',
      'volume',
      'opacity',
      'scale',
      'rotation',
      'color',
      'title',
    ] as const)
      if (JSON.stringify(clip[key]) !== JSON.stringify(next[key]))
        throw new Error('Los dos cortes deben tener las mismas propiedades.');
    if (clip.fadeOut || next.fadeIn)
      throw new Error(
        'Retira los fundidos interiores antes de unir los cortes.',
      );
    clip.duration += next.duration;
    clip.fadeOut = next.fadeOut;
    track.clips = track.clips.filter((c) => c.id !== next.id);
  });
}
export function insertGap(p: Project, at: number, duration: number): Project {
  if (!Number.isSafeInteger(duration) || duration <= 0)
    throw new Error('La duración del espacio debe ser positiva.');
  return edit(p, (d) => {
    for (const t of d.tracks) {
      if (t.locked) continue;
      const result: Clip[] = [];
      for (const c of t.clips) {
        const end = c.start + c.duration;
        if (c.start >= at) result.push({ ...c, start: c.start + duration });
        else if (end > at) {
          result.push(bounded({ ...c, duration: at - c.start, fadeOut: 0 }));
          result.push(
            bounded({
              ...c,
              id: uid(),
              start: at + duration,
              sourceIn: c.sourceIn + sourceSpan(at - c.start, c.speed),
              duration: end - at,
              fadeIn: 0,
            }),
          );
        } else result.push(c);
      }
      t.clips = result;
    }
  });
}
