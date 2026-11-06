import {useState} from 'react';
import {addSubtitles, findClip, SECOND, type Clip, type Project} from '@corte/core';
import type {MediaResource} from './media';
import {useEditor} from './store';

type Language = 'spanish' | 'english' | 'auto';
type SpeechChunk = {text: string; timestamp: [number, number | null]};

declare global {
  interface Window {
    atlasfxSpeech?: {
      transcribe(audio: Float32Array, language: Language): Promise<SpeechChunk[]>;
    };
  }
}

async function decodeClip(blob: Blob, clip: Clip) {
  const sampleRate = 16000;
  const length = Math.max(1, Math.floor(clip.duration / SECOND * sampleRate));
  const context = new OfflineAudioContext(1, length, sampleRate);
  const source = context.createBufferSource();
  try {
    source.buffer = await context.decodeAudioData(await blob.arrayBuffer());
  } catch {
    throw new Error('No se pudo decodificar el audio del clip.');
  }
  source.playbackRate.value = clip.speed ?? 1;
  source.connect(context.destination);
  source.start(0, clip.sourceIn / SECOND);
  const audio = (await context.startRendering()).getChannelData(0);
  if (!audio.some(sample => Math.abs(sample) > .001)) throw new Error('El clip no contiene audio audible.');
  return audio;
}

export function SubtitleDialog({project, clip, resource, onClose, onGenerated}: {
  project: Project;
  clip: Clip;
  resource: MediaResource;
  onClose: () => void;
  onGenerated: (count: number) => void;
}) {
  const [language, setLanguage] = useState<Language>('spanish');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const {apply} = useEditor();

  async function generate() {
    if (!window.atlasfxSpeech || status) return;
    setError('');
    setStatus('Preparando el audio…');
    try {
      const audio = await decodeClip(resource.blob, clip);
      setStatus('Transcribiendo. La primera vez puede tardar mientras se descarga el modelo…');
      const chunks = await window.atlasfxSpeech.transcribe(audio, language);
      const cues: Parameters<typeof addSubtitles>[1] = [];
      let previousEnd = 0;
      for (const {text, timestamp: [from, to]} of chunks) {
        const caption = text.trim().slice(0, 1000);
        const start = Math.max(previousEnd, Math.round(from * SECOND));
        const end = Math.min(clip.duration, to === null ? clip.duration : Math.round(to * SECOND));
        if (!caption || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
        cues.push({text: caption, start: clip.start + start, duration: end - start});
        previousEnd = end;
      }
      if (!cues.length) throw new Error('No se encontraron frases para subtitular.');
      const current = useEditor.getState().h.present;
      const source = findClip(current, clip.id);
      if (current.id !== project.id || source?.start !== clip.start ||
          source.duration !== clip.duration || source.sourceIn !== clip.sourceIn || source.speed !== clip.speed) {
        throw new Error('El clip cambió durante la transcripción. Volvé a generarla.');
      }
      const next = addSubtitles(current, cues);
      apply(() => next);
      onGenerated(cues.length);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setStatus('');
    }
  }

  return <div className="modal-backdrop">
    <form className="modal workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="subtitle-heading"
      onSubmit={event => {event.preventDefault(); void generate();}}
      onKeyDown={event => {if (event.key === 'Escape' && !status) onClose();}}>
      <h2 id="subtitle-heading">Subtítulos automáticos</h2>
      <p className="hint">{project.assets[clip.assetId].name}</p>
      <label className="dialog-field">Idioma del audio
        <select autoFocus disabled={!!status} value={language} onChange={event => setLanguage(event.target.value as Language)}>
          <option value="spanish">Español</option>
          <option value="english">Inglés</option>
          <option value="auto">Detectar automáticamente</option>
        </select>
      </label>
      <p className="hint">La primera vez se descarga el modelo. El audio se procesa en este equipo.</p>
      {status && <p className="hint" role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="button secondary" disabled={!!status} onClick={onClose}>Cerrar</button>
        <button type="submit" className="button primary" disabled={!!status}>Generar subtítulos</button>
      </div>
    </form>
  </div>;
}
