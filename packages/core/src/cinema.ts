export const CINEMA_RATIOS = [1.85, 2, 2.35, 2.39] as const;
export const CINEMA_LOOKS = ['neutral', 'warm', 'cool', 'mono', 'vintage', 'clean',
  'teal', 'bleach', 'faded', 'golden', 'blueNight', 'sciFi', 'cyberpunk', 'horror', 'goldenHour', 'bloodbath', 'portra', 'velvia', 'fineArt'] as const;

export type CinemaRGB = [number, number, number];
export interface CinemaGrade {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  lift: CinemaRGB;
  gamma: CinemaRGB;
  gain: CinemaRGB;
}

export const DEFAULT_GRADE: CinemaGrade = {
  exposure: 0, contrast: 1, saturation: 1, temperature: 0, tint: 0,
  lift: [0,0,0], gamma: [1,1,1], gain: [1,1,1],
};

export interface CinemaSettings {
  ratio: (typeof CINEMA_RATIOS)[number] | 0;
  framing: 'bars' | 'crop';
  look: (typeof CINEMA_LOOKS)[number];
  intensity: number;
  grain: number;
  vignette: number;
  lightLeak: number;
  grade?: CinemaGrade;
  bloom?: number;
}

export const DEFAULT_CINEMA: CinemaSettings = {
  ratio: 0, framing: 'bars', look: 'neutral', intensity: 1,
  grain: 0, vignette: 0, lightLeak: 0,
};

export function cinemaHeight(width: number, height: number, ratio: CinemaSettings['ratio']) {
  if (!ratio) return height;
  return Math.min(height, Math.max(2, Math.round(width / ratio / 2) * 2));
}

export function validCinema(settings: CinemaSettings) {
  return !!settings &&
    (settings.ratio === 0 || CINEMA_RATIOS.includes(settings.ratio)) &&
    (settings.framing === 'bars' || settings.framing === 'crop') &&
    CINEMA_LOOKS.includes(settings.look) &&
    [settings.intensity, settings.grain, settings.vignette, settings.lightLeak]
      .every(value => inRange(value,0,1)) &&
    (settings.bloom === undefined || inRange(settings.bloom,0,1)) &&
    (settings.grade === undefined || validGrade(settings.grade));
}

function inRange(value: number, min: number, max: number) {
  return Number.isFinite(value) && value>=min && value<=max;
}

function validGrade(grade: CinemaGrade) {
  const channels=(values:CinemaRGB,min:number,max:number)=>
    Array.isArray(values) && values.length===3 && values.every(value=>inRange(value,min,max));
  return !!grade &&
    inRange(grade.exposure,-3,3) && inRange(grade.contrast,.5,1.5) &&
    inRange(grade.saturation,0,2) && inRange(grade.temperature,-100,100) &&
    inRange(grade.tint,-100,100) && channels(grade.lift,-.1,.1) &&
    channels(grade.gamma,.8,1.2) && channels(grade.gain,.8,1.2);
}
