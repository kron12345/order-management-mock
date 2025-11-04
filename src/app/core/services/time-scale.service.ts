import { Injectable, Signal, computed, signal } from '@angular/core';
import { Tick, ZoomLevel } from '../../models/time-scale';
import {
  MS_IN_DAY,
  MS_IN_HOUR,
  MS_IN_MINUTE,
  ceilToStep,
  differenceInMs,
  floorToStep,
  isSameDay,
  isWeekend,
} from '../utils/time-math';

interface ZoomConfig {
  pxPerMs: number;
  stepMs: number;
  majorStepMs: number;
  label: (date: Date) => string;
  majorLabel?: (date: Date) => string;
  minorLabel?: (date: Date) => string;
}

const format = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('de-DE', options);

const monthLabel = format({ month: 'long', year: 'numeric' });
const weekdayWithDateLabel = format({ weekday: 'short', day: '2-digit', month: '2-digit' });
const weekdayShortLabel = format({ weekday: 'short' });
const dayNumberLabel = format({ day: '2-digit' });
const hourLabel = format({ hour: '2-digit' });
const hourMinuteLabel = format({ hour: '2-digit', minute: '2-digit' });

const zoomConfigs: Record<ZoomLevel, ZoomConfig> = {
  quarter: {
    pxPerMs: 90 / MS_IN_DAY,
    stepMs: MS_IN_DAY,
    majorStepMs: 7 * MS_IN_DAY,
    label: (date) => dayNumberLabel.format(date),
    majorLabel: (date) => monthLabel.format(date),
    minorLabel: (date) => `${weekdayShortLabel.format(date)} ${dayNumberLabel.format(date)}`,
  },
  '2month': {
    pxPerMs: 120 / MS_IN_DAY,
    stepMs: MS_IN_DAY,
    majorStepMs: 7 * MS_IN_DAY,
    label: (date) => dayNumberLabel.format(date),
    majorLabel: (date) => monthLabel.format(date),
    minorLabel: (date) => `${weekdayShortLabel.format(date)} ${dayNumberLabel.format(date)}`,
  },
  month: {
    pxPerMs: 180 / MS_IN_DAY,
    stepMs: MS_IN_DAY,
    majorStepMs: 7 * MS_IN_DAY,
    label: (date) => dayNumberLabel.format(date),
    majorLabel: (date) => monthLabel.format(date),
    minorLabel: (date) => `${weekdayShortLabel.format(date)} ${dayNumberLabel.format(date)}`,
  },
  '2week': {
    pxPerMs: 24 / MS_IN_HOUR,
    stepMs: 12 * MS_IN_HOUR,
    majorStepMs: MS_IN_DAY,
    label: (date) => `${weekdayShortLabel.format(date)} ${dayNumberLabel.format(date)}`,
    majorLabel: (date) => monthLabel.format(date),
  },
  week: {
    pxPerMs: 36 / MS_IN_HOUR,
    stepMs: 6 * MS_IN_HOUR,
    majorStepMs: MS_IN_DAY,
    label: (date) => hourMinuteLabel.format(date),
    majorLabel: (date) => weekdayWithDateLabel.format(date),
  },
  '3day': {
    pxPerMs: 64 / MS_IN_HOUR,
    stepMs: 6 * MS_IN_HOUR,
    majorStepMs: MS_IN_DAY,
    label: (date) => hourLabel.format(date),
    majorLabel: (date) => weekdayWithDateLabel.format(date),
  },
  day: {
    pxPerMs: 96 / MS_IN_HOUR,
    stepMs: MS_IN_HOUR,
    majorStepMs: 3 * MS_IN_HOUR,
    label: (date) => hourLabel.format(date),
    majorLabel: (date) => weekdayWithDateLabel.format(date),
  },
  '12hour': {
    pxPerMs: 128 / MS_IN_HOUR,
    stepMs: 30 * MS_IN_MINUTE,
    majorStepMs: 2 * MS_IN_HOUR,
    label: (date) => hourMinuteLabel.format(date),
    majorLabel: (date) => weekdayWithDateLabel.format(date),
  },
  '6hour': {
    pxPerMs: 160 / MS_IN_HOUR,
    stepMs: MS_IN_HOUR,
    majorStepMs: 6 * MS_IN_HOUR,
    label: (date) => hourLabel.format(date),
    majorLabel: (date) => weekdayWithDateLabel.format(date),
  },
  '3hour': {
    pxPerMs: 220 / MS_IN_HOUR,
    stepMs: 10 * MS_IN_MINUTE,
    majorStepMs: MS_IN_HOUR,
    label: (date) => hourMinuteLabel.format(date),
    majorLabel: (date) => weekdayWithDateLabel.format(date),
  },
  hour: {
    pxPerMs: 320 / MS_IN_HOUR,
    stepMs: 15 * MS_IN_MINUTE,
    majorStepMs: MS_IN_HOUR,
    label: (date) => hourMinuteLabel.format(date),
    majorLabel: (date) => weekdayWithDateLabel.format(date),
  },
  '30min': {
    pxPerMs: 480 / MS_IN_HOUR,
    stepMs: 30 * MS_IN_MINUTE,
    majorStepMs: MS_IN_HOUR,
    label: (date) => hourMinuteLabel.format(date),
    majorLabel: (date) => weekdayWithDateLabel.format(date),
  },
  '15min': {
    pxPerMs: 12 / MS_IN_MINUTE,
    stepMs: 5 * MS_IN_MINUTE,
    majorStepMs: 15 * MS_IN_MINUTE,
    label: (date) => hourMinuteLabel.format(date),
    majorLabel: (date) => weekdayWithDateLabel.format(date),
  },
  '10min': {
    pxPerMs: 16 / MS_IN_MINUTE,
    stepMs: 2 * MS_IN_MINUTE,
    majorStepMs: 10 * MS_IN_MINUTE,
    label: (date) => hourMinuteLabel.format(date),
    majorLabel: (date) => weekdayWithDateLabel.format(date),
  },
  '5min': {
    pxPerMs: 20 / MS_IN_MINUTE,
    stepMs: MS_IN_MINUTE,
    majorStepMs: 5 * MS_IN_MINUTE,
    label: (date) => hourMinuteLabel.format(date),
    majorLabel: (date) => weekdayWithDateLabel.format(date),
  },
};

@Injectable({ providedIn: 'root' })
export class TimeScaleService {
  private readonly timelineStart = signal<Date>(new Date());
  private readonly timelineEnd = signal<Date>(new Date());
  private readonly zoomLevelSignal = signal<ZoomLevel>('week');
  private readonly contentWidthSignal: Signal<number>;

  constructor() {
    // Keep the virtual canvas width proportional to the selected zoom level.
    this.contentWidthSignal = computed(() => {
      const cfg = zoomConfigs[this.zoomLevelSignal()];
      const duration = Math.max(
        differenceInMs(this.timelineEnd(), this.timelineStart()),
        MS_IN_DAY,
      );
      return duration * cfg.pxPerMs;
    });
  }

  setTimelineRange(start: Date, end: Date): void {
    if (end.getTime() <= start.getTime()) {
      throw new Error('Timeline end must be after timeline start.');
    }
    this.timelineStart.set(new Date(start));
    this.timelineEnd.set(new Date(end));
  }

  setZoomLevel(level: ZoomLevel): void {
    this.zoomLevelSignal.set(level);
  }

  zoomLevel(): ZoomLevel {
    return this.zoomLevelSignal();
  }

  contentWidth(): number {
    return Math.max(1, Math.round(this.contentWidthSignal()));
  }

  pixelsPerMs(): number {
    return zoomConfigs[this.zoomLevelSignal()].pxPerMs;
  }

  timeToPx(date: Date | number): number {
    if (!this.hasTimelineRange()) {
      return 0;
    }
    const timeValue = typeof date === 'number' ? date : date.getTime();
    const clampedTime = Math.min(
      Math.max(timeValue, this.timelineStart().getTime()),
      this.timelineEnd().getTime(),
    );
    return (clampedTime - this.timelineStart().getTime()) * this.pixelsPerMs();
  }

  pxToTime(px: number): Date {
    if (!this.hasTimelineRange()) {
      return new Date(this.timelineStart().getTime());
    }
    const base = this.timelineStart().getTime();
    const time = base + px / this.pixelsPerMs();
    return new Date(time);
  }

  getTicks(viewStart: Date, viewEnd: Date): Tick[] {
    const cfg = zoomConfigs[this.zoomLevelSignal()];
    const start = floorToStep(viewStart, cfg.stepMs);
    const end = ceilToStep(viewEnd, cfg.stepMs);
    const timelineStartMs = this.timelineStart().getTime();
    const timelineEndMs = this.timelineEnd().getTime();
    const ticks: Tick[] = [];
    const now = new Date();

    // Generate visible ticks only for the current viewport to keep rendering light.
    for (let ts = start.getTime(); ts <= end.getTime(); ts += cfg.stepMs) {
      const stepStartMs = ts;
      const stepEndMs = ts + cfg.stepMs;
      const clampedStartMs = Math.max(stepStartMs, timelineStartMs);
      const clampedEndMs = Math.min(stepEndMs, timelineEndMs);
      if (clampedEndMs <= clampedStartMs) {
        continue;
      }

      const widthPx = Math.max(0, (clampedEndMs - clampedStartMs) * cfg.pxPerMs);
      if (widthPx <= 0) {
        continue;
      }
      const offsetPx = (clampedStartMs - timelineStartMs) * cfg.pxPerMs;
      const offset = clampedStartMs - timelineStartMs;
      const index = Math.floor(offset / cfg.stepMs);
      const date = new Date(clampedStartMs);
      const bucketIndex = Math.floor(offset / cfg.majorStepMs);
      const bucketStartMs = timelineStartMs + bucketIndex * cfg.majorStepMs;
      const bucketDate = new Date(bucketStartMs);
      const isMajor = ((clampedStartMs - timelineStartMs) % cfg.majorStepMs + cfg.majorStepMs) % cfg.majorStepMs === 0;
      const baseLabel = cfg.label(date);
      const majorLabel = cfg.majorLabel?.(bucketDate);
      const minorLabel = cfg.minorLabel?.(date);

      ticks.push({
        time: date,
        label: baseLabel,
        majorLabel,
        minorLabel,
        widthPx,
        offsetPx,
        index,
        isMajor,
        isWeekend: isWeekend(date),
        isNow:
          (cfg.stepMs >= MS_IN_DAY && isSameDay(date, now)) ||
          Math.abs(ts - now.getTime()) < cfg.stepMs,
      });
    }

    return ticks;
  }

  hasTimelineRange(): boolean {
    return this.timelineEnd().getTime() > this.timelineStart().getTime();
  }
}
