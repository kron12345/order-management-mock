import { computed, signal } from '@angular/core';
import { ZoomLevel } from '../../models/time-scale';
import { clampDate, differenceInMs, MS_IN_DAY, MS_IN_HOUR } from '../utils/time-math';

export interface TimeViewportOptions {
  timelineStart: Date;
  timelineEnd: Date;
  initialZoom?: ZoomLevel;
  initialCenter?: Date;
}

export interface TimeViewport {
  readonly viewStart: () => Date;
  readonly viewEnd: () => Date;
  readonly zoomLevel: () => ZoomLevel;
  readonly scrollX: () => number;
  readonly rangeMs: () => number;
  readonly pixelsPerMs: () => number;
  setPixelsPerMs(pxPerMs: number): void;
  zoomIn(center?: Date): void;
  zoomOut(center?: Date): void;
  setZoom(level: ZoomLevel, center?: Date): void;
  scrollBy(px: number): void;
  setScrollPx(px: number): void;
  goto(time: Date): void;
  gotoToday(): void;
  viewCenter(): Date;
}

const ZOOM_ORDER: ZoomLevel[] = [
  'quarter',
  '2month',
  'month',
  '2week',
  'week',
  '3day',
  'day',
  '12hour',
  '6hour',
  '3hour',
  'hour',
  '30min',
  '15min',
  '10min',
  '5min',
];

const ZOOM_RANGE_MS: Record<ZoomLevel, number> = {
  quarter: 150 * MS_IN_DAY,
  '2month': 75 * MS_IN_DAY,
  month: 40 * MS_IN_DAY,
  '2week': 18 * MS_IN_DAY,
  week: 10 * MS_IN_DAY,
  '3day': 4 * MS_IN_DAY,
  day: 2 * MS_IN_DAY,
  '12hour': 30 * MS_IN_HOUR,
  '6hour': 24 * MS_IN_HOUR,
  '3hour': 12 * MS_IN_HOUR,
  hour: 8 * MS_IN_HOUR,
  '30min': 6 * MS_IN_HOUR,
  '15min': 4 * MS_IN_HOUR,
  '10min': 3 * MS_IN_HOUR,
  '5min': 2 * MS_IN_HOUR,
};

export function createTimeViewport(options: TimeViewportOptions): TimeViewport {
  const timelineStart = new Date(options.timelineStart);
  const timelineEnd = new Date(options.timelineEnd);
  const timelineDuration = Math.max(
    differenceInMs(timelineEnd, timelineStart),
    MS_IN_DAY,
  );

  const initialZoom = options.initialZoom ?? 'week';
  const zoomLevel = signal<ZoomLevel>(initialZoom);
  const rangeMs = computed(() => ZOOM_RANGE_MS[zoomLevel()]);

  const initialCenter = options.initialCenter ?? new Date();
  const initialStart = clampToTimeline(
    new Date(initialCenter.getTime() - rangeMs() / 2),
    timelineStart,
    timelineEnd,
    rangeMs(),
  );

  const viewStart = signal<Date>(initialStart);
  const viewEnd = computed(() => new Date(viewStart().getTime() + rangeMs()));
  const scrollX = computed(() => {
    const pxPerMs = pixelsPerMs();
    const startTime = viewStart().getTime();
    const baseTime = timelineStart.getTime();
    return Math.max(0, (startTime - baseTime) * pxPerMs);
  });
  const pixelsPerMs = signal<number>(1 / MS_IN_HOUR);

  function setPixelsPerMs(pxPerMs: number) {
    pixelsPerMs.set(pxPerMs);
  }

  function setZoom(level: ZoomLevel, center?: Date) {
    if (zoomLevel() === level) {
      maintainCenter(center);
      return;
    }
    zoomLevel.set(level);
    maintainCenter(center);
  }

  function zoomIn(center?: Date) {
    const index = ZOOM_ORDER.indexOf(zoomLevel());
    if (index === -1 || index >= ZOOM_ORDER.length - 1) {
      return;
    }
    setZoom(ZOOM_ORDER[index + 1], center);
  }

  function zoomOut(center?: Date) {
    const index = ZOOM_ORDER.indexOf(zoomLevel());
    if (index <= 0) {
      return;
    }
    setZoom(ZOOM_ORDER[index - 1], center);
  }

  function maintainCenter(center?: Date) {
    const target = center ?? viewCenter();
    const halfRange = rangeMs() / 2;
    const nextStart = new Date(target.getTime() - halfRange);
    const clamped = clampToTimeline(nextStart, timelineStart, timelineEnd, rangeMs());
    viewStart.set(clamped);
  }

  function viewCenter(): Date {
    return new Date(viewStart().getTime() + rangeMs() / 2);
  }

  function scrollBy(px: number) {
    const pxPerMs = pixelsPerMs();
    if (!pxPerMs) {
      return;
    }
    const deltaMs = px / pxPerMs;
    shiftBy(deltaMs);
  }

  function setScrollPx(px: number) {
    const pxPerMs = pixelsPerMs();
    if (!pxPerMs) {
      return;
    }
    const nextStartTime = timelineStart.getTime() + px / pxPerMs;
    const nextStart = new Date(nextStartTime);
    const clamped = clampToTimeline(nextStart, timelineStart, timelineEnd, rangeMs());
    viewStart.set(clamped);
  }

  function goto(time: Date) {
    maintainCenter(time);
  }

  function gotoToday() {
    goto(new Date());
  }

  function shiftBy(deltaMs: number) {
    const currentStart = viewStart();
    const nextStart = new Date(currentStart.getTime() + deltaMs);
    const clamped = clampToTimeline(nextStart, timelineStart, timelineEnd, rangeMs());
    viewStart.set(clamped);
  }

  return {
    viewStart: () => viewStart(),
    viewEnd: () => viewEnd(),
    zoomLevel: () => zoomLevel(),
    scrollX: () => scrollX(),
    rangeMs: () => rangeMs(),
    pixelsPerMs: () => pixelsPerMs(),
    setPixelsPerMs,
    zoomIn,
    zoomOut,
    setZoom,
    scrollBy,
    setScrollPx,
    goto,
    gotoToday,
    viewCenter,
  };

  function clampToTimeline(
    start: Date,
    timelineStartDate: Date,
    timelineEndDate: Date,
    currentRange: number,
  ): Date {
    // Prevent the viewport from scrolling beyond the available data interval.
    const min = timelineStartDate;
    const max = new Date(timelineEndDate.getTime() - currentRange);
    if (max.getTime() <= min.getTime()) {
      return new Date(timelineStartDate);
    }
    return clampDate(start, min, max);
  }
}
