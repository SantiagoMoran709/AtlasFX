import { describe, expect, it } from 'vitest';
import {
  addClip,
  canDetachAudio,
  createProject,
  detachAudio,
  edit,
  execute,
  history,
  moveClip,
  parseProject,
  seconds,
  serialize,
  trimClip,
  uid,
  undo,
  type Asset,
} from './index';

function fixture(hasAudio = true) {
  const asset: Asset = {
    id: uid(),
    name: 'Video',
    kind: 'video',
    duration: seconds(10),
    mime: 'video/mp4',
    metadata: { hasAudio, hasVideo: true },
  };
  const project = edit(createProject(), (draft) => {
    draft.assets[asset.id] = asset;
  });
  const placed = addClip(project, asset.id, project.tracks[0].id, seconds(2));
  const clipId = placed.tracks[0].clips[0].id;
  const trimmed = trimClip(placed, clipId, seconds(1), seconds(5));
  return { asset, clipId, project: trimmed };
}

describe('separar audio', () => {
  it('conserva los tiempos y el medio, permite editar cada parte y se deshace en un paso', () => {
    const { project, asset, clipId } = fixture();
    const state = execute(history(project), (p) => detachAudio(p, clipId));
    const [video, audio] = state.present.tracks;
    expect(video.clips[0]).toMatchObject({ id: clipId, audioDetached: true });
    const sound = audio.clips[0];
    expect(sound).toMatchObject({
      assetId: asset.id,
      audioOnly: true,
      start: seconds(2),
      sourceIn: seconds(1),
      duration: seconds(5),
    });
    expect(Object.keys(state.present.assets)).toEqual([asset.id]);
    expect(parseProject(serialize(state.present))).toEqual(state.present);
    const moved = moveClip(state.present, sound.id, seconds(3));
    expect(moved.tracks[1].clips[0].start).toBe(seconds(3));
    expect(moved.tracks[0].clips[0].start).toBe(seconds(2));
    expect(undo(state).present).toBe(project);
    expect(() => detachAudio(state.present, clipId)).toThrow(
      'todavía esté unido',
    );
  });

  it('añade una pista cuando la disponible está bloqueada y conserva la ganancia', () => {
    const { project, clipId } = fixture();
    const mixed = edit(project, (draft) => {
      draft.tracks[1].locked = true;
      draft.tracks[0].volume = 0.5;
      draft.tracks[0].clips[0].volume = 0.8;
      draft.tracks[0].clips[0].fadeIn = seconds(0.5);
    });
    const detached = detachAudio(mixed, clipId);
    expect(detached.tracks).toHaveLength(3);
    expect(detached.tracks[1].clips).toHaveLength(0);
    expect(detached.tracks[2]).toMatchObject({
      kind: 'audio',
      volume: 0.5,
      clips: [{ volume: 0.8, fadeIn: seconds(0.5) }],
    });
  });

  it('rechaza videos sin audio conocido, pistas bloqueadas y una segunda separación', () => {
    const silent = fixture(false);
    expect(
      canDetachAudio(silent.project.tracks[0].clips[0], silent.asset),
    ).toBe(false);
    expect(() => detachAudio(silent.project, silent.clipId)).toThrow(
      'con audio',
    );
    const { project, clipId } = fixture();
    const locked = edit(project, (draft) => {
      draft.tracks[0].locked = true;
    });
    expect(() => detachAudio(locked, clipId)).toThrow('bloqueada');
  });
});
