import {
  DEFAULT_CHROMA_KEY,
  findClip,
  setClipProps,
  type ChromaKey,
  type Clip,
} from '@corte/core';
import { Parameter } from './Controls';
import { useEditor } from './store';

export function ChromaControls({
  clip,
  disabled,
  onImport,
}: {
  clip?: Clip;
  disabled: boolean;
  onImport: () => void;
}) {
  const { apply } = useEditor();
  const key = clip?.chromaKey ?? DEFAULT_CHROMA_KEY;

  function update(change: Partial<ChromaKey>) {
    if (!clip) return;
    apply((project) => {
      const current = findClip(project, clip.id);
      if (!current) return project;
      return setClipProps(project, clip.id, {
        chromaKey: { ...DEFAULT_CHROMA_KEY, ...current.chromaKey, ...change },
      });
    });
  }

  return (
    <section className="chroma-controls" aria-labelledby="chroma-title">
      <div className="chroma-heading">
        <h3 id="chroma-title">Chroma key</h3>
        <button
          className="button secondary"
          type="button"
          disabled={disabled}
          onClick={onImport}
        >
          Importar medio
        </button>
      </div>
      {clip ? (
        <fieldset disabled={disabled}>
          <label className="chroma-toggle">
            <input
              type="checkbox"
              checked={key.enabled}
              onChange={(event) => update({ enabled: event.target.checked })}
            />
            Quitar fondo por color
          </label>
          {key.enabled && (
            <>
              <label className="property-field">
                Color del fondo
                <input
                  type="color"
                  value={key.color}
                  onChange={(event) => update({ color: event.target.value })}
                />
              </label>
              <Parameter
                label="Tolerancia"
                min={0}
                max={100}
                value={Math.round(key.tolerance * 100)}
                unit=" %"
                onCommit={(value) => update({ tolerance: value / 100 })}
              />
              <Parameter
                label="Suavizado del borde"
                min={0}
                max={100}
                value={Math.round(key.softness * 100)}
                unit=" %"
                onCommit={(value) => update({ softness: value / 100 })}
              />
              <Parameter
                label="Reducir reflejo del fondo"
                min={0}
                max={100}
                value={Math.round(key.spill * 100)}
                unit=" %"
                onCommit={(value) => update({ spill: value / 100 })}
              />
            </>
          )}
        </fieldset>
      ) : (
        <p className="hint">
          Colocá el clip de pantalla verde en una pista superior y seleccionalo.
        </p>
      )}
    </section>
  );
}
