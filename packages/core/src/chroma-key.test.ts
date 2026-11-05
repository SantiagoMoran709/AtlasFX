import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHROMA_KEY,
  addClip,
  createProject,
  edit,
  parseProject,
  seconds,
  serialize,
  setClipProps,
  splitClip,
  uid,
} from './index';

describe('chroma key', () => {
  it('conserva el efecto al dividir, guardar y abrir un clip', () => {
    const asset = {
      id: uid(),
      name: 'Pantalla verde',
      kind: 'video' as const,
      mime: 'video/mp4',
      duration: seconds(4),
    };
    const base = edit(createProject(), (p) => {
      p.assets[asset.id] = asset;
    });
    const project = addClip(base, asset.id, base.tracks[0].id);
    const id = project.tracks[0].clips[0].id;
    const chromaKey = { ...DEFAULT_CHROMA_KEY, enabled: true };
    const keyed = setClipProps(project, id, { chromaKey });
    const restored = parseProject(serialize(splitClip(keyed, id, seconds(2))));
    expect(restored.tracks[0].clips.map((clip) => clip.chromaKey)).toEqual([
      chromaKey,
      chromaKey,
    ]);
    expect(project.tracks[0].clips[0].chromaKey).toBeUndefined();
    expect(() =>
      setClipProps(project, id, {
        chromaKey: { ...chromaKey, softness: 2 },
      }),
    ).toThrow('chroma key');
  });
});
