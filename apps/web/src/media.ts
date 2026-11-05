import { seconds, uid, type Asset, type Kind } from '@corte/core';
import { readMp4Metadata } from './mp4Metadata';

export interface MediaResource {
  url: string;
  thumbnail?: string;
  hasAudio?: boolean;
  blob: Blob;
}

export function waitMedia(
  el: HTMLMediaElement,
  event = 'loadedmetadata',
  timeoutMs = 15_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => finish(new Error('El medio tardó demasiado en cargar.')),
      timeoutMs,
    );
    function finish(error?: Error) {
      clearTimeout(timeout);
      el.removeEventListener(event, ready);
      el.removeEventListener('error', failed);
      if (error) reject(error);
      else resolve();
    }
    const ready = () => finish();
    const failed = () =>
      finish(
        new Error(
          'No se pudo decodificar el archivo. Comprueba el códec y que el archivo esté completo.',
        ),
      );
    el.addEventListener(event, ready, { once: true });
    el.addEventListener('error', failed, { once: true });
  });
}

function thumbnail(frame: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = Math.max(1, Math.round((240 * height) / width));
  canvas.getContext('2d')!.drawImage(frame, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.7);
}

export async function importMedia(
  file: File,
): Promise<{ asset: Asset; resource: MediaResource }> {
  const name = file.name;
  const kind: Kind =
    file.type.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(name)
      ? 'image'
      : file.type.startsWith('audio/') ||
          /\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(name)
        ? 'audio'
        : 'video';
  if (
    !/^(video|audio|image)\//.test(file.type) &&
    !/\.(mp4|mov|mkv|webm|m4v|mp3|wav|m4a|ogg|aac|flac|png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(
      name,
    )
  ) {
    throw new Error('Elige un video, audio o imagen.');
  }
  const metadata =
    kind !== 'image' &&
    (/\.(mp4|mov|m4v|m4a)$/i.test(name) ||
      /^(video|audio)\/(mp4|quicktime)$/.test(file.type))
      ? await readMp4Metadata(file).catch(() => undefined)
      : undefined;
  const url = URL.createObjectURL(file);
  try {
    const asset: Asset = {
      id: uid(),
      name,
      kind,
      duration: seconds(5),
      mime: file.type,
    };
    if (metadata) asset.metadata = metadata;
    let preview: string | undefined;
    if (asset.kind === 'image') {
      const image = new Image();
      image.src = url;
      await image.decode();
      asset.width = image.naturalWidth;
      asset.height = image.naturalHeight;
      preview = thumbnail(image, asset.width, asset.height);
    } else {
      const el = document.createElement(
        asset.kind === 'audio' ? 'audio' : 'video',
      );
      try {
        el.preload = 'auto';
        const ready = waitMedia(el, 'loadeddata');
        el.src = url;
        await ready;
        if (!Number.isFinite(el.duration) || el.duration <= 0) {
          throw new Error('No se pudo leer la duración del archivo.');
        }
        asset.duration = Math.max(1, seconds(el.duration));
        if (el instanceof HTMLVideoElement && el.videoWidth && el.videoHeight) {
          asset.width = el.videoWidth;
          asset.height = el.videoHeight;
          preview = thumbnail(el, asset.width, asset.height);
          if (el.duration >= 0.5) {
            const target = waitMedia(el, 'seeked', 2000);
            el.currentTime = el.duration * 0.1;
            try {
              await target;
              preview = thumbnail(el, asset.width, asset.height);
            } catch {
              // Keep the first frame if the thumbnail seek cannot finish.
            }
          }
        }
      } finally {
        el.removeAttribute('src');
        el.load();
      }
    }
    return {
      asset,
      resource: {
        url,
        thumbnail: preview,
        blob: file,
        hasAudio: metadata?.hasAudio,
      },
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
