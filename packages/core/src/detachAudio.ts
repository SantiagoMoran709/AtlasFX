import {
  createTrack,
  edit,
  uid,
  type Asset,
  type Clip,
  type Project,
} from './index';

export function canDetachAudio(clip?: Clip, asset?: Asset): boolean {
  return (
    !!clip &&
    asset?.kind === 'video' &&
    !clip.audioOnly &&
    !clip.audioDetached &&
    asset.metadata?.hasAudio !== false
  );
}

export function detachAudio(project: Project, clipId: string): Project {
  return edit(project, (draft) => {
    const sourceTrack = draft.tracks.find((track) =>
      track.clips.some((clip) => clip.id === clipId),
    );
    const clip = sourceTrack?.clips.find((clip) => clip.id === clipId);
    if (
      !sourceTrack ||
      !clip ||
      !canDetachAudio(clip, draft.assets[clip.assetId])
    ) {
      throw new Error(
        'Selecciona un clip de video con audio que todavía esté unido.',
      );
    }
    if (sourceTrack.locked)
      throw new Error('La pista de video está bloqueada.');

    const end = clip.start + clip.duration;
    let destination = draft.tracks.find(
      (track) =>
        track.kind === 'audio' &&
        !track.locked &&
        track.visible === sourceTrack.visible &&
        track.muted === sourceTrack.muted &&
        (track.volume ?? 1) === (sourceTrack.volume ?? 1) &&
        track.clips.every(
          (other) =>
            other.start >= end || other.start + other.duration <= clip.start,
        ),
    );
    if (!destination) {
      destination = {
        ...createTrack('audio', 'Audio separado'),
        visible: sourceTrack.visible,
        muted: sourceTrack.muted,
        ...(sourceTrack.volume === undefined
          ? {}
          : { volume: sourceTrack.volume }),
      };
      draft.tracks.push(destination);
    }
    destination.clips.push({
      id: uid(),
      assetId: clip.assetId,
      audioOnly: true,
      start: clip.start,
      duration: clip.duration,
      sourceIn: clip.sourceIn,
      ...(clip.speed === undefined ? {} : { speed: clip.speed }),
      volume: clip.volume,
      ...(clip.fadeIn === undefined ? {} : { fadeIn: clip.fadeIn }),
      ...(clip.fadeOut === undefined ? {} : { fadeOut: clip.fadeOut }),
      opacity: 1,
      scale: 1,
      rotation: 0,
    });
    clip.audioDetached = true;
  });
}
