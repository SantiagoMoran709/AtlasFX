import { describe, it, expect } from 'vitest';
import {
  createProject,
  edit,
  uid,
  seconds,
  addClip,
  splitClip,
  copyClip,
  pasteClip,
  duplicateClip,
  rippleDelete,
  closeGaps,
  trimAt,
  joinNext,
  insertGap,
  validateProject,
  fadeEnvelope,
  setClipProps,
  serialize,
  parseProject,
} from './index';
function fixture() {
  let p = createProject();
  const id = uid();
  p = edit(p, (d) => {
    d.assets[id] = {
      id,
      name: 'test.mp4',
      kind: 'video',
      duration: seconds(10),
      mime: 'video/mp4',
    };
  });
  return addClip(p, id, p.tracks[0].id);
}
describe('comandos de edición de los menús', () => {
  it('insertar dentro de un clip conserva ambos segmentos y desplaza el resto', () => {
    const p = fixture(),
      data = copyClip(p, p.tracks[0].clips[0].id);
    data.clip.duration = seconds(2);
    const next = pasteClip(p, data, seconds(4));
    expect(
      next.tracks[0].clips.map((c) => [c.start, c.duration, c.sourceIn]),
    ).toEqual([
      [0, seconds(4), 0],
      [seconds(4), seconds(2), 0],
      [seconds(6), seconds(6), seconds(4)],
    ]);
    validateProject(next);
  });
  it('sobrescribir conserva las partes fuera del intervalo', () => {
    const p = fixture(),
      data = copyClip(p, p.tracks[0].clips[0].id);
    data.clip.duration = seconds(2);
    const next = pasteClip(p, data, seconds(4), 'overwrite');
    expect(
      next.tracks[0].clips.map((c) => [c.start, c.duration, c.sourceIn]),
    ).toEqual([
      [0, seconds(4), 0],
      [seconds(4), seconds(2), 0],
      [seconds(6), seconds(4), seconds(6)],
    ]);
  });
  it('pegar como superposición crea una pista y respeta las existentes', () => {
    const p = fixture();
    const next = pasteClip(
      p,
      copyClip(p, p.tracks[0].clips[0].id),
      0,
      'overlay',
    );
    expect(next.tracks).toHaveLength(3);
    expect(p.tracks).toHaveLength(2);
    expect(next.tracks[0].clips).toHaveLength(1);
    validateProject(next);
  });
  it('duplicar e insertar desplaza el clip siguiente', () => {
    let p = fixture();
    p = splitClip(p, p.tracks[0].clips[0].id, seconds(4));
    const next = duplicateClip(p, p.tracks[0].clips[0].id);
    expect(next.tracks[0].clips.map((c) => [c.start, c.duration])).toEqual([
      [0, seconds(4)],
      [seconds(4), seconds(4)],
      [seconds(8), seconds(6)],
    ]);
  });
  it('eliminar y cerrar espacio solo desplaza clips posteriores en esa pista', () => {
    let p = fixture();
    p = splitClip(p, p.tracks[0].clips[0].id, seconds(4));
    const next = rippleDelete(p, p.tracks[0].clips[0].id);
    expect(next.tracks[0].clips[0].start).toBe(0);
    expect(next.tracks[0].clips[0].sourceIn).toBe(seconds(4));
  });
  it('cerrar huecos omite pistas bloqueadas', () => {
    const p = edit(fixture(), (d) => {
      d.tracks[0].clips[0].start = seconds(3);
    });
    expect(closeGaps(p).tracks[0].clips[0].start).toBe(0);
    const locked = edit(p, (d) => {
      d.tracks[0].locked = true;
    });
    expect(closeGaps(locked).tracks[0].clips[0].start).toBe(seconds(3));
  });
  it('recortar el inicio actualiza la entrada al archivo', () => {
    const p = fixture(),
      id = p.tracks[0].clips[0].id;
    const next = trimAt(p, id, seconds(3), 'start');
    expect(next.tracks[0].clips[0]).toMatchObject({
      start: seconds(3),
      sourceIn: seconds(3),
      duration: seconds(7),
    });
    expect(() => trimAt(p, id, 0, 'end')).toThrow();
  });
  it('unir reconstruye dos cortes contiguos del mismo medio', () => {
    let p = fixture();
    const id = p.tracks[0].clips[0].id;
    p = splitClip(p, id, seconds(4));
    expect(joinNext(p, id).tracks[0].clips[0].duration).toBe(seconds(10));
    const changed = setClipProps(p, p.tracks[0].clips[1].id, { opacity: 0.5 });
    expect(() => joinNext(changed, id)).toThrow('mismas propiedades');
  });
  it('insertar un espacio divide el material bajo el cursor', () => {
    const p = fixture();
    const next = insertGap(p, seconds(4), seconds(2));
    expect(
      next.tracks[0].clips.map((c) => [c.start, c.duration, c.sourceIn]),
    ).toEqual([
      [0, seconds(4), 0],
      [seconds(6), seconds(6), seconds(4)],
    ]);
    expect(() => insertGap(p, 0, 0)).toThrow();
  });
  it('un clip copiado no se puede pegar si su medio no existe en otro proyecto', () => {
    const p = fixture();
    expect(() =>
      pasteClip(createProject(), copyClip(p, p.tracks[0].clips[0].id), 0),
    ).toThrow('no pertenece');
  });
});
describe('mezcla, fundidos y color', () => {
  it('la envolvente vale cero fuera del clip y respeta entrada y salida', () => {
    const c = {
      ...fixture().tracks[0].clips[0],
      fadeIn: seconds(2),
      fadeOut: seconds(2),
    };
    expect(fadeEnvelope(c, -1)).toBe(0);
    expect(fadeEnvelope(c, seconds(1))).toBe(0.5);
    expect(fadeEnvelope(c, seconds(5))).toBe(1);
    expect(fadeEnvelope(c, seconds(9))).toBe(0.5);
    expect(fadeEnvelope(c, seconds(10))).toBe(0);
  });
  it('dividir mantiene solo los fundidos exteriores y limita sus duraciones', () => {
    let p = fixture();
    const id = p.tracks[0].clips[0].id;
    p = setClipProps(p, id, { fadeIn: seconds(5), fadeOut: seconds(3) });
    const next = splitClip(p, id, seconds(4));
    expect(next.tracks[0].clips[0]).toMatchObject({
      fadeIn: seconds(4),
      fadeOut: 0,
    });
    expect(next.tracks[0].clips[1]).toMatchObject({
      fadeIn: 0,
      fadeOut: seconds(3),
    });
    validateProject(next);
  });
  it('guarda ganancias, color, notas y marcadores sin perderlos al abrir', () => {
    const p = edit(fixture(), (d) => {
      d.settings.masterVolume = 0.5;
      d.tracks[0].volume = 0.25;
      d.notes = 'Notas';
      d.markers = [{ id: uid(), time: seconds(2), name: 'Inicio' }];
      d.tracks[0].clips[0].color = {
        exposure: 0.5,
        contrast: 1.2,
        saturation: 0.7,
        hue: -20,
      };
    });
    expect(parseProject(serialize(p))).toEqual(p);
  });
  it('rechaza ganancias, fundidos y parámetros de color fuera de rango', () => {
    const p = fixture(),
      id = p.tracks[0].clips[0].id;
    expect(() =>
      edit(p, (d) => {
        d.tracks[0].volume = 3;
      }),
    ).toThrow();
    expect(() =>
      edit(p, (d) => {
        d.settings.masterVolume = -1;
      }),
    ).toThrow();
    expect(() => setClipProps(p, id, { fadeIn: seconds(11) })).toThrow();
    expect(() =>
      setClipProps(p, id, {
        color: { exposure: NaN, contrast: 1, saturation: 1, hue: 0 },
      }),
    ).toThrow();
  });
});
