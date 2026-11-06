import { describe, expect, it } from 'vitest';
import {
  activeClips,
  addSubtitles,
  addTitle,
  createClip,
  createProject,
  createTrack,
  edit,
  endTime,
  MAX_TRACKS,
  moveClip,
  parseProject,
  seconds,
  serialize,
  setClipProps,
  setTransition,
  transitionNear,
  uid,
  validateProject,
  type Asset,
} from './index';

function footage() {
  return edit(createProject(), (draft) => {
    const asset: Asset = {
      id: uid(),
      kind: 'video',
      name: 'Video',
      duration: seconds(2),
      mime: 'video/mp4',
    };
    draft.assets[asset.id] = asset;
    draft.tracks[0].clips = [0, 2, 4].map((start) =>
      createClip(asset, seconds(start)),
    );
  });
}

describe('titles', () => {
  it('keeps timed subtitles on one track and saves the chosen font', () => {
    const project = addSubtitles(footage(), [
      { start: seconds(1), duration: seconds(1), text: 'Primera frase' },
      { start: seconds(2), duration: seconds(1), text: 'Segunda frase' },
    ]);
    const first = project.tracks[0].clips[0];
    const edited = setClipProps(project, first.id, {
      title: { ...first.title!, font: 'Georgia' },
    });
    const reopened = parseProject(serialize(edited));
    expect(reopened.tracks[0].name).toBe('Subtítulos');
    expect(reopened.tracks[0].clips).toHaveLength(2);
    expect(reopened.tracks[0].clips[0]).toMatchObject({
      start: seconds(1),
      title: { text: 'Primera frase', y: 88, outline: true, font: 'Georgia' },
    });
  });

  it('stores editable title layers in the project without imported files', () => {
    const original = footage();
    const id = uid();
    const inserted = addTitle(original, seconds(1), id);
    const title = inserted.tracks[0].clips[0];
    const edited = setClipProps(inserted, id, {
      title: { ...title.title!, text: 'Primera línea\nSegunda línea' },
    });
    const reopened = parseProject(serialize(edited));
    expect(reopened.tracks[0].role).toBe('titles');
    expect(
      activeClips(reopened, seconds(1)).map((layer) => layer.clip.id),
    ).toEqual([id, original.tracks[0].clips[0].id]);
    expect(reopened.tracks[0].clips[0].title?.text).toBe(
      'Primera línea\nSegunda línea',
    );
    expect(reopened.assets[title.assetId].generated).toBe('title');
    expect(addTitle(reopened, seconds(4)).tracks).toHaveLength(3);
    expect(addTitle(reopened, seconds(2)).tracks).toHaveLength(4);
  });

  it('counts title tracks toward the shared track limit', () => {
    const project = createProject();
    while (project.tracks.length < MAX_TRACKS - 1)
      project.tracks.push(createTrack('video', 'Capa'));
    const full = addTitle(project, 0);
    expect(full.tracks).toHaveLength(100);
    expect(() => validateProject(full)).not.toThrow();
    expect(() => addTitle(full, seconds(1))).toThrow('100 pistas');
    expect(addTitle(full, seconds(3)).tracks).toHaveLength(100);
  });
});

describe('transitions', () => {
  it('centers the effect on the cut and preserves clip timings and project duration', () => {
    const project = footage();
    const [outgoing, incoming] = project.tracks[0].clips;
    const changed = setTransition(project, outgoing.id, 'dissolve', seconds(1));
    const reopened = parseProject(serialize(changed));
    expect(reopened.tracks[0].clips).toEqual(project.tracks[0].clips);
    expect(endTime(reopened)).toBe(endTime(project));
    expect(transitionNear(reopened.tracks[0], incoming.start)).toMatchObject({
      start: seconds(1.5),
      end: seconds(2.5),
      progress: 0.5,
    });
    expect(transitionNear(reopened.tracks[0], seconds(2.5))).toBeUndefined();
    expect(
      setTransition(reopened, outgoing.id, 'none', 0).tracks[0].transitions,
    ).toEqual([]);
  });

  it('prefers the current transition over lookahead and prunes cuts separated by an edit', () => {
    const project = footage();
    const [first, second, third] = project.tracks[0].clips;
    const later = setTransition(project, second.id, 'wipe', seconds(2));
    const both = setTransition(later, first.id, 'dissolve', seconds(3));
    expect(
      transitionNear(both.tracks[0], seconds(2.75), seconds(1))?.transition
        .kind,
    ).toBe('dissolve');
    const moved = moveClip(both, third.id, seconds(5));
    expect(moved.tracks[0].transitions).toEqual([
      { from: first.id, to: second.id, kind: 'dissolve', duration: seconds(2) },
    ]);
    expect(() => setTransition(moved, third.id, 'wipe', seconds(1))).toThrow(
      'misma pista',
    );
  });
});
