import {useState} from 'react';
import {SECOND, setTransition, transitionCut, type Project, type TransitionKind} from '@corte/core';
import {useEditor} from './store';

export function TransitionDialog({project, selected, onClose, onSeek}: {
  project: Project;
  selected: string;
  onClose: () => void;
  onSeek: (time: number) => void;
}) {
  const cut = transitionCut(project, selected);
  const existing = cut?.track.transitions?.find(t => t.from === cut.from.id && t.to === cut.to.id);
  const max = cut ? Math.min(cut.from.duration, cut.to.duration) / SECOND : 1;
  const [kind, setKind] = useState<TransitionKind>(existing?.kind ?? 'dissolve');
  const [duration, setDuration] = useState(existing ? existing.duration / SECOND : Math.min(.5, max));
  const {apply, message} = useEditor();

  function save(choice: TransitionKind | 'none') {
    try {
      const next = setTransition(project, selected, choice, Math.round(duration * SECOND));
      apply(() => next);
      if (cut) onSeek(cut.to.start);
      onClose();
    } catch (error) {
      message(error instanceof Error ? error.message : String(error));
    }
  }

  return <div className="modal-backdrop">
    <form className="modal workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="transition-heading"
      onSubmit={event => { event.preventDefault(); save(kind); }}>
      <h2 id="transition-heading">Transición de video</h2>
      {cut ? <>
        <p className="hint">{project.assets[cut.from.assetId].name} → {project.assets[cut.to.assetId].name}</p>
        <label className="dialog-field">Efecto<select autoFocus value={kind}
          onChange={event => setKind(event.target.value as TransitionKind)}>
          <option value="dissolve">Disolvencia cruzada</option>
          <option value="wipe">Barrido de izquierda a derecha</option>
        </select></label>
        <label className="dialog-field">Duración (s)<input type="number" required step="any" min={.000001} max={max}
          value={duration} onChange={event => setDuration(Number(event.target.value))}/></label>
        <p className="hint">El efecto se centra en el corte de imagen. El audio cambia en el corte original.</p>
      </> : <p className="hint">Selecciona uno de dos clips de imagen o video que se toquen en la misma pista desbloqueada.</p>}
      <div className="modal-actions">
        {existing && <button type="button" className="button danger" onClick={() => save('none')}>Quitar transición</button>}
        <button type="button" className="button secondary" onClick={onClose}>Cerrar</button>
        {cut && <button className="button primary" type="submit">Aplicar transición</button>}
      </div>
    </form>
  </div>;
}
