import { describe, it, expect } from 'vitest';
import {
  createProject,
  edit,
  uid,
  seconds,
  addClip,
  splitClip,
  moveClip,
  trimClip,
  deleteClip,
  validateProject,
  parseProject,
  serialize,
  history,
  commit,
  undo,
  redo,
  snap,
  type Project,
} from './index';
function fixture(): Project {
  const p = createProject();
  const assetId = uid();
  return edit(p, (d) => {
    d.assets[assetId] = {
      id: assetId,
      name: 'video.mp4',
      kind: 'video',
      duration: seconds(10),
      mime: 'video/mp4',
    };
  });
}
function placed() {
  const p = fixture();
  return addClip(p, Object.keys(p.assets)[0], p.tracks[0].id);
}
describe('edición no destructiva', () => {
  it('añade y divide manteniendo referencias y tiempos de origen', () => {
    const p = placed();
    const id = p.tracks[0].clips[0].id;
    const n = splitClip(p, id, seconds(4));
    expect(p.tracks[0].clips).toHaveLength(1);
    expect(
      n.tracks[0].clips.map((c) => [c.start, c.duration, c.sourceIn]),
    ).toEqual([
      [0, seconds(4), 0],
      [seconds(4), seconds(6), seconds(4)],
    ]);
    validateProject(n);
  });
  it('rechaza solapes sin modificar el proyecto', () => {
    const p = placed();
    const n = splitClip(p, p.tracks[0].clips[0].id, seconds(5));
    const id = n.tracks[0].clips[1].id;
    expect(() => moveClip(n, id, seconds(4))).toThrow('solaparse');
    expect(n.tracks[0].clips[1].start).toBe(seconds(5));
  });
  it('limita el recorte al archivo y rechaza longitudes vacías', () => {
    const p = placed();
    const c = p.tracks[0].clips[0];
    const next = trimClip(p, c.id, seconds(1), seconds(10));
    expect(next.tracks[0].clips[0]).toMatchObject({
      sourceIn: seconds(1),
      duration: seconds(9),
    });
    validateProject(next);
    expect(() => trimClip(p, c.id, 0, 0)).toThrow();
    expect(() => splitClip(p, c.id, 0)).toThrow();
    expect(() => splitClip(p, c.id, seconds(10))).toThrow();
  });
  it('conserva el medio original al borrar un clip', () => {
    const p = placed();
    const c = p.tracks[0].clips[0];
    const n = deleteClip(p, c.id);
    expect(n.tracks[0].clips).toHaveLength(0);
    expect(n.assets[c.assetId]).toEqual(p.assets[c.assetId]);
  });
  it('impide editar pistas bloqueadas', () => {
    let p = placed();
    p = edit(p, (d) => {
      d.tracks[0].locked = true;
    });
    expect(() => deleteClip(p, p.tracks[0].clips[0].id)).toThrow('bloqueada');
  });
  it('rechaza un medio inexistente, IDs duplicados y valores NaN', () => {
    const p = placed();
    const c = p.tracks[0].clips[0];
    expect(() =>
      edit(p, (d) => {
        delete d.assets[c.assetId];
      }),
    ).toThrow();
    expect(() =>
      edit(p, (d) => {
        d.tracks[1].id = d.tracks[0].id;
      }),
    ).toThrow();
    expect(() =>
      edit(p, (d) => {
        d.tracks[0].clips[0].duration = NaN;
      }),
    ).toThrow();
  });
  it('rechaza audio en una pista de video', () => {
    const p = fixture();
    const id = Object.keys(p.assets)[0];
    const n = edit(p, (d) => {
      d.assets[id].kind = 'audio';
    });
    expect(() => addClip(n, id, p.tracks[0].id)).toThrow('tipo de medio');
  });
});
describe('historial y persistencia', () => {
  it('deshace, rehace y elimina la rama futura tras otra edición', () => {
    const p = placed();
    const n = splitClip(p, p.tracks[0].clips[0].id, seconds(4));
    let h = commit(history(p), n);
    h = undo(h);
    expect(h.present).toEqual(p);
    expect(redo(h).present).toEqual(n);
    h = commit(h, deleteClip(p, p.tracks[0].clips[0].id));
    expect(h.future).toHaveLength(0);
  });
  it('guarda y abre un proyecto validado', () => {
    const p = placed();
    expect(parseProject(serialize(p))).toEqual(p);
    expect(() => parseProject('{"version":5}')).toThrow('Versión');
    expect(() => parseProject('{}')).toThrow();
  });
  it('imán selecciona el punto más cercano dentro del umbral', () => {
    expect(snap(990, [0, 1000, 1010], 20)).toBe(1000);
    expect(snap(900, [1000], 20)).toBe(900);
  });
});
