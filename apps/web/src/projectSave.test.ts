import {createProject} from '@corte/core';
import {describe, expect, it, vi} from 'vitest';
import {ProjectSave} from './projectSave';
import {readProjectRecords} from './storage';

describe('guardado de proyectos', () => {
  it('guarda la última edición en orden, incluso si deshacer vuelve a la revisión inicial', async () => {
    const original = createProject();
    const edited = {...original, name: 'Editado'};
    let finishFirst!: () => void;
    const first = new Promise<void>(resolve => { finishFirst = resolve; });
    const write = vi.fn().mockReturnValueOnce(first).mockResolvedValue(undefined);
    const save = new ProjectSave(write, vi.fn());
    save.reset(original);
    save.schedule(edited);
    const autoSave = save.flush();
    save.schedule(original);
    expect(save.dirty).toBe(true);
    const manualSave = save.flush();
    expect(write.mock.calls).toEqual([[edited]]);
    finishFirst();
    await Promise.all([autoSave, manualSave]);
    expect(write.mock.calls).toEqual([[edited], [original]]);
    expect(save.dirty).toBe(false);
  });

  it('mantiene pendiente la revisión más reciente si falla el guardado', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('Disco lleno')).mockResolvedValue(undefined);
    const status = vi.fn();
    const save = new ProjectSave(write, status);
    const project = createProject();
    save.schedule(project);
    await expect(save.flush()).rejects.toThrow('Disco lleno');
    expect(save.dirty).toBe(true);
    expect(status).toHaveBeenLastCalledWith('Sin guardar', expect.any(Error));
    const latest = {...project, name: 'Último cambio'};
    save.schedule(latest);
    await save.flush();
    expect(write).toHaveBeenLastCalledWith(latest);
    expect(save.dirty).toBe(false);
  });

  it('puede abrir los proyectos sanos aunque la biblioteca tenga registros inválidos', () => {
    const older = {...createProject(), updatedAt: '2025-01-01T00:00:00Z'};
    const recent = {...createProject(), updatedAt: '2025-03-01T00:00:00Z'};
    const records = [older, {...older, version: 999}, {...recent, updatedAt: null}, recent];
    expect(readProjectRecords(records)).toEqual({projects: [recent, older], skipped: 2});
    expect(records[1].version).toBe(999);
  });
});
