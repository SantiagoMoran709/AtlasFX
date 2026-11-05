import { describe, expect, it } from 'vitest';
import {
  addClip,
  batch,
  createProject,
  deleteClip,
  edit,
  execute,
  frameToTime,
  history,
  parseProject,
  redo,
  seconds,
  serialize,
  splitClip,
  timeToFrame,
  trimClip,
  uid,
  undo,
  validateProject,
} from './index';

function projectWithMedia() {
  return edit(createProject(), (project) => {
    const id = uid();
    project.assets[id] = {
      id,
      name: 'Medio',
      kind: 'video',
      duration: seconds(10),
      mime: 'video/mp4',
    };
  });
}

describe('historial de comandos', () => {
  it('restaura los 100 estados originales al deshacer y rehacer', () => {
    const initial = projectWithMedia();
    const asset = Object.keys(initial.assets)[0];
    const track = initial.tracks[0].id;
    let state = history(initial);
    const states = [initial];
    for (let index = 0; index < 100; index++) {
      state = execute(state, (p) => addClip(p, asset, track));
      validateProject(state.present);
      states.push(state.present);
    }
    for (let index = 99; index >= 0; index--) {
      state = undo(state);
      expect(state.present).toEqual(states[index]);
    }
    for (let index = 1; index <= 100; index++) {
      state = redo(state);
      expect(state.present).toEqual(states[index]);
    }
  });

  it('agrupa cambios de forma atómica y recupera el orden al deshacer un borrado', () => {
    const original = projectWithMedia();
    const asset = Object.keys(original.assets)[0];
    const track = original.tracks[0].id;
    const add = (p: typeof original) => addClip(p, asset, track);
    const inserted = execute(history(original), batch(add, add, add));
    const clips = inserted.present.tracks[0].clips;
    expect(clips).toHaveLength(3);
    expect(undo(inserted).present).toBe(original);
    expect(inserted.present.assets).toBe(original.assets);
    const deleted = execute(inserted, (p) => deleteClip(p, clips[1].id));
    expect(undo(deleted).present.tracks[0].clips).toEqual(clips);
    expect(() =>
      execute(
        inserted,
        batch(add, (p) => addClip(p, asset, track, 0)),
      ),
    ).toThrow('solaparse');
    expect(inserted.present.tracks[0].clips).toHaveLength(3);
  });
});

describe('tiempo entero y rangos de origen', () => {
  it('convierte un fotograma de una tasa fraccionaria a microsegundos y recupera el índice', () => {
    const fps = 30_000 / 1_001;
    const at = frameToTime(9127, fps);
    expect(Number.isSafeInteger(at)).toBe(true);
    expect(timeToFrame(at, fps)).toBe(9127);
  });

  it('conserva los proyectos previos y valida el origen de clips con velocidad', () => {
    const initial = projectWithMedia();
    const added = addClip(
      initial,
      Object.keys(initial.assets)[0],
      initial.tracks[0].id,
    );
    expect(parseProject(serialize(added))).toEqual(added);
    const id = added.tracks[0].clips[0].id;
    expect(() =>
      edit(added, (p) => {
        p.tracks[0].clips[0].speed = 0;
      }),
    ).toThrow('velocidad');
    expect(() =>
      edit(added, (p) => {
        p.tracks[0].clips[0].speed = 2;
      }),
    ).toThrow('duración');
    const fast = edit(trimClip(added, id, 0, seconds(5)), (p) => {
      p.tracks[0].clips[0].speed = 2;
    });
    const split = splitClip(fast, id, seconds(2));
    expect(split.tracks[0].clips[1]).toMatchObject({
      start: seconds(2),
      sourceIn: seconds(4),
      speed: 2,
    });
    expect(() =>
      splitClip(fast, id, frameToTime(1, fast.settings.fps) - 1),
    ).toThrow('fotograma');
  });
});
