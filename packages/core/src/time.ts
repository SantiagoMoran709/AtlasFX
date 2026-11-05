export type Time = number;

export const SECOND = 1_000_000;
export const secToTime = (seconds: number): Time =>
  Math.round(seconds * SECOND);
export const timeToFrame = (time: Time, fps: number): number =>
  Math.round((time * fps) / SECOND);
export const frameToTime = (frame: number, fps: number): Time =>
  Math.round((frame * SECOND) / fps);

export const sourceSpan = (duration: Time, rate = 1): Time =>
  Math.floor(duration * rate);
