import { useRef, type RefObject } from 'react';
import { useViewport } from './useViewport';

export function WorkspaceDivider({ panel }: { panel: RefObject<HTMLDivElement> }) {
  const { height } = useViewport(panel);
  const drag = useRef<{ y: number; height: number }>();

  function resize(value: number) {
    const element = panel.current;
    if (!element) return;
    const style = getComputedStyle(element);
    const min = parseFloat(style.minHeight);
    const max = parseFloat(style.maxHeight);
    element.style.height = `${Math.max(min, Math.min(max, value))}px`;
  }

  return <div className="workspace-divider" role="separator" tabIndex={0}
    aria-label="Ajustar altura del panel inferior" aria-orientation="horizontal"
    aria-controls="lower-workspace" aria-valuenow={Math.round(height / window.innerHeight * 100)}
    aria-valuetext={`${height} píxeles de altura`}
    title="Arrastrá para cambiar el tamaño del visor"
    onPointerDown={event => {
      if (event.button !== 0 || !panel.current) return;
      drag.current = { y: event.clientY, height: panel.current.clientHeight };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      if (drag.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
        resize(drag.current.height + drag.current.y - event.clientY);
      }
    }}
    onLostPointerCapture={() => { drag.current = undefined; }}
    onKeyDown={event => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      event.stopPropagation();
      if (panel.current) resize(panel.current.clientHeight + (event.key === 'ArrowUp' ? 20 : -20));
    }}
  />;
}
