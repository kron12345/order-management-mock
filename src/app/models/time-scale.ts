export type ZoomLevel = 'month' | 'week' | 'day' | 'hour' | '15min';

export interface Tick {
  time: Date;
  label: string;
  majorLabel?: string;
  minorLabel?: string;
  widthPx: number;
  offsetPx: number;
  index: number;
  isMajor?: boolean;
  isWeekend?: boolean;
  isNow?: boolean;
}
