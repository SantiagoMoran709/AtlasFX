import type {Project} from '@corte/core';

type SaveStatus = 'Guardado' | 'Guardando…' | 'Sin guardar';

export class ProjectSave {
  private latest?: Project;
  private committed?: Project;
  private timer?: ReturnType<typeof setTimeout>;
  private writing?: Promise<void>;

  constructor(
    private write: (project: Project) => Promise<void>,
    private status: (value: SaveStatus, error?: unknown) => void,
  ) {}

  get dirty() { return !!this.writing || this.latest !== this.committed; }

  reset(project?: Project) {
    clearTimeout(this.timer);
    this.latest = this.committed = project;
    this.status('Guardado');
  }

  schedule(project: Project) {
    this.latest = project;
    clearTimeout(this.timer);
    if (!this.dirty) {
      this.status('Guardado');
      return;
    }
    this.status('Guardando…');
    this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, 600);
  }

  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.writing) return this.writing.then(() => this.flush());
    if (!this.dirty) return Promise.resolve();
    this.status('Guardando…');
    this.writing = this.drain().finally(() => { this.writing = undefined; });
    return this.writing;
  }

  private async drain() {
    try {
      while (this.latest && this.latest !== this.committed) {
        const snapshot = this.latest;
        await this.write(snapshot);
        this.committed = snapshot;
      }
      this.status('Guardado');
    } catch (error) {
      this.status('Sin guardar', error);
      throw error;
    }
  }
}
