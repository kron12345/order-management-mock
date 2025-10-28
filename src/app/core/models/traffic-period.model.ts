export type TrafficPeriodType = 'standard' | 'special' | 'construction';

export interface TrafficPeriodRule {
  id: string;
  name: string;
  description?: string;
  daysBitmap: string; // 7-char string Mo-So
  validityStart: string; // ISO date
  validityEnd?: string; // ISO date
  includesHolidays?: boolean;
  excludesDates?: string[]; // ISO dates
  includesDates?: string[]; // ISO dates
}

export interface TrafficPeriod {
  id: string;
  name: string;
  type: TrafficPeriodType;
  description?: string;
  responsible?: string;
  createdAt: string;
  updatedAt: string;
  rules: TrafficPeriodRule[];
  tags?: string[];
}
