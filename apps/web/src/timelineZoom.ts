export const DEFAULT_TIMELINE_ZOOM = 50;
export const MIN_TIMELINE_ZOOM = 0.05;
export const MAX_TIMELINE_ZOOM = 150;

const zoomRange = MAX_TIMELINE_ZOOM / MIN_TIMELINE_ZOOM;
const tickSteps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800];

export function clampTimelineZoom(zoom: number) {
  return Math.min(MAX_TIMELINE_ZOOM, Math.max(MIN_TIMELINE_ZOOM, zoom));
}

export function stepTimelineZoom(zoom: number, direction: number) {
  return clampTimelineZoom(zoom * 1.25 ** direction);
}

export function zoomToSlider(zoom: number) {
  return Math.round(1000 * Math.log(zoom / MIN_TIMELINE_ZOOM) / Math.log(zoomRange));
}

export function sliderToZoom(value: number) {
  return clampTimelineZoom(MIN_TIMELINE_ZOOM * zoomRange ** (value / 1000));
}

export function timelineZoomLabel(zoom: number) {
  return `${Number((100 * zoom / DEFAULT_TIMELINE_ZOOM).toFixed(1))}%`;
}

export function timelineTickStep(zoom: number) {
  return tickSteps.find(step => step * zoom >= 58) ?? tickSteps[tickSteps.length - 1];
}

export function timelineTickLabel(seconds: number, step: number) {
  const minutes = Math.floor(seconds / 60);
  return step >= 60 ? `${minutes} min` : `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
