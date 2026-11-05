import { createFile, MP4BoxBuffer, type Movie } from 'mp4box';
import type { MediaMetadata } from '@corte/core';

const chunkSize = 1024 * 1024;
const scanBudget = 32 * chunkSize;

function describeMovie(movie: Movie): MediaMetadata {
  const video = movie.videoTracks[0];
  const audio = movie.audioTracks[0];
  const averageFps =
    video && video.samples_duration > 0
      ? (video.nb_samples * video.timescale) / video.samples_duration
      : 0;
  const matrix = video?.matrix;
  const rotation =
    matrix && (matrix[0] || matrix[1])
      ? Math.round((Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI)
      : undefined;
  return {
    hasAudio: !!audio,
    hasVideo: !!video,
    audioCodec: audio?.codec || undefined,
    videoCodec: video?.codec || undefined,
    averageFps:
      Number.isFinite(averageFps) && averageFps > 0 ? averageFps : undefined,
    rotation,
  };
}

export async function readMp4Metadata(
  blob: Blob,
): Promise<MediaMetadata | undefined> {
  const parser = createFile(false);
  let metadata: MediaMetadata | undefined;
  let invalid = false;
  parser.onReady = (movie) => {
    metadata = describeMovie(movie);
  };
  parser.onError = () => {
    invalid = true;
  };

  let offset = 0;
  let bytesRead = 0;
  while (
    !metadata &&
    !invalid &&
    offset < blob.size &&
    bytesRead < scanBudget
  ) {
    const buffer = await blob.slice(offset, offset + chunkSize).arrayBuffer();
    const next = parser.appendBuffer(
      MP4BoxBuffer.fromArrayBuffer(buffer, offset),
    );
    bytesRead += buffer.byteLength;
    // The parser can skip media payloads when the index is at the end of the file.
    offset = Math.max(
      offset + buffer.byteLength,
      Number.isSafeInteger(next) ? next : 0,
    );
  }
  return metadata;
}
