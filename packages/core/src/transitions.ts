import { edit, type Clip, type Project, type Time, type Track } from './index';

const TRANSITION_KINDS = ['dissolve','wipe','dip','flash'] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];
export interface Transition {
  from: string;
  to: string;
  kind: TransitionKind;
  duration: Time;
}

function visualPair(
  project: Project,
  track: Track,
  from?: Clip,
  to?: Clip,
): boolean {
  return (
    track.kind === 'video' &&
    !!from &&
    !!to &&
    from.start + from.duration === to.start &&
    !project.assets[from.assetId]?.generated &&
    !project.assets[to.assetId]?.generated
  );
}

export function transitionCut(project: Project, selected: string) {
  const track = project.tracks.find((t) =>
    t.clips.some((c) => c.id === selected),
  );
  if (!track || track.locked) return undefined;
  const index = track.clips.findIndex((c) => c.id === selected);
  const clip = track.clips[index];
  const next = track.clips[index + 1];
  const previous = track.clips[index - 1];
  if (next && visualPair(project, track, clip, next))
    return { track, from: clip, to: next };
  if (previous && visualPair(project, track, previous, clip))
    return { track, from: previous, to: clip };
  return undefined;
}

export function setTransition(
  project: Project,
  selected: string,
  kind: TransitionKind | 'none',
  duration: Time,
): Project {
  return edit(project, (draft) => {
    const cut = transitionCut(draft, selected);
    if (!cut)
      throw new Error(
        'Selecciona uno de dos clips de imagen o video que se toquen en la misma pista desbloqueada.',
      );
    const { track, from, to } = cut;
    track.transitions = (track.transitions ?? []).filter(
      (t) => t.from !== from.id || t.to !== to.id,
    );
    if (kind === 'none') return;
    if (!Number.isSafeInteger(duration) || duration <= 0)
      throw new Error('Introduce una duración positiva.');
    track.transitions.push({
      from: from.id,
      to: to.id,
      kind,
      duration: Math.min(duration, from.duration, to.duration),
    });
  });
}

function findPair(track: Track, transition: Transition) {
  const index = track.clips.findIndex((clip) => clip.id === transition.from);
  if (index < 0) return undefined;
  const to = track.clips[index + 1];
  if (to?.id === transition.to) return { from: track.clips[index], to };
  return undefined;
}

export function pruneTransitions(project: Project) {
  for (const track of project.tracks) {
    if (!track.transitions) continue;
    track.transitions = track.transitions.filter((transition) => {
      const pair = findPair(track, transition);
      if (!pair || !visualPair(project, track, pair.from, pair.to))
        return false;
      transition.duration = Math.min(
        transition.duration,
        pair.from.duration,
        pair.to.duration,
      );
      return true;
    });
  }
}

export function validateTransitions(project: Project, track: Track) {
  if (track.transitions === undefined) return;
  if (!Array.isArray(track.transitions))
    throw new Error('Transiciones no válidas.');
  const seen = new Set<string>();
  for (const transition of track.transitions) {
    const pair = transition && findPair(track, transition);
    if (
      !pair ||
      !visualPair(project, track, pair.from, pair.to) ||
      seen.has(transition.from) ||
      !TRANSITION_KINDS.includes(transition.kind) ||
      !Number.isSafeInteger(transition.duration) ||
      transition.duration <= 0 ||
      transition.duration > Math.min(pair.from.duration, pair.to.duration)
    ) {
      throw new Error('Transición no válida.');
    }
    seen.add(transition.from);
  }
}

export function transitionNear(track: Track, at: Time, lookAhead = 0) {
  let upcoming:
    | {
        from: Clip;
        to: Clip;
        transition: Transition;
        start: Time;
        end: Time;
        progress: number;
      }
    | undefined;
  for (const transition of track.transitions ?? []) {
    const pair = findPair(track, transition);
    if (!pair) continue;
    const start = pair.to.start - Math.floor(transition.duration / 2);
    const end = start + transition.duration;
    if (at >= start - lookAhead && at < end) {
      const cut = {
        ...pair,
        transition,
        start,
        end,
        progress: (at - start) / transition.duration,
      };
      if (at >= start) return cut;
      if (!upcoming || start < upcoming.start) upcoming = cut;
    }
  }
  return upcoming;
}
