import { Injectable, computed, signal } from '@angular/core';
import {
  TrafficPeriod,
  TrafficPeriodRule,
  TrafficPeriodType,
  TrafficPeriodVariantType,
  TrafficPeriodVariantScope,
} from '../models/traffic-period.model';
import { MOCK_TRAFFIC_PERIODS } from '../mock/mock-traffic-periods.mock';

export interface TrafficPeriodFilters {
  search: string;
  type: TrafficPeriodType | 'all';
  tag: string | 'all';
}

export interface TrafficPeriodSort {
  field: 'updatedAt' | 'name';
  direction: 'asc' | 'desc';
}

export interface TrafficPeriodCreatePayload {
  name: string;
  type: TrafficPeriodType;
  description?: string;
  responsible?: string;
  tags?: string[];
  year: number;
  selectedDates: string[];
  excludedDates?: string[];
  variantType: TrafficPeriodVariantType;
  variantNumber: string;
  appliesTo: TrafficPeriodVariantScope;
  reason?: string;
}

export interface RailMlTrafficPeriodPayload {
  sourceId: string;
  name: string;
  description?: string;
  daysBitmap: string;
  validityStart: string;
  validityEnd: string;
  type?: TrafficPeriodType;
  scope?: TrafficPeriodVariantScope;
  reason?: string;
}

@Injectable({ providedIn: 'root' })
export class TrafficPeriodService {
  private readonly _periods = signal<TrafficPeriod[]>(MOCK_TRAFFIC_PERIODS);
  private readonly _filters = signal<TrafficPeriodFilters>({
    search: '',
    type: 'all',
    tag: 'all',
  });
  private readonly _sort = signal<TrafficPeriodSort>({
    field: 'updatedAt',
    direction: 'desc',
  });

  readonly periods = computed(() => this._periods());
  readonly filters = computed(() => this._filters());
  readonly sort = computed(() => this._sort());

  readonly tags = computed(() =>
    Array.from(
      new Set(
        this._periods().flatMap((period) => period.tags ?? []),
      ),
    ).sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' })),
  );

  readonly filteredPeriods = computed(() => {
    const filters = this._filters();
    const sort = this._sort();
    const search = filters.search.toLowerCase();

    return this._periods()
      .filter((period) => {
        if (search) {
          const haystack = `${period.name} ${period.description ?? ''} ${
            period.responsible ?? ''
          } ${period.tags?.join(' ') ?? ''}`.toLowerCase();
          if (!haystack.includes(search)) {
            return false;
          }
        }
        if (filters.type !== 'all' && period.type !== filters.type) {
          return false;
        }
        if (filters.tag !== 'all' && !(period.tags?.includes(filters.tag) ?? false)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => this.sortPeriods(a, b, sort));
  });

  setFilters(patch: Partial<TrafficPeriodFilters>) {
    this._filters.update((current) => ({ ...current, ...patch }));
  }

  resetFilters() {
    this._filters.set({ search: '', type: 'all', tag: 'all' });
  }

  setSort(sort: TrafficPeriodSort) {
    this._sort.set(sort);
  }

  getById(id: string): TrafficPeriod | undefined {
    return this._periods().find((period) => period.id === id);
  }

  private sortPeriods(
    a: TrafficPeriod,
    b: TrafficPeriod,
    sort: TrafficPeriodSort,
  ): number {
    const direction = sort.direction === 'asc' ? 1 : -1;
    switch (sort.field) {
      case 'name':
        return (
          a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }) *
          direction
        );
      case 'updatedAt':
      default:
        return (
          (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) *
          direction
        );
    }
  }

  createPeriod(payload: TrafficPeriodCreatePayload): string {
    if (!payload.selectedDates.length) {
      return '';
    }

    const sortedDates = [...new Set(payload.selectedDates)].sort();

    const now = new Date().toISOString();
    const id = this.generateId();

    const period: TrafficPeriod = {
      id,
      name: payload.name,
      type: payload.type,
      description: payload.description,
      responsible: payload.responsible,
      createdAt: now,
      updatedAt: now,
      tags: this.normalizeTags(payload.tags),
      rules: [
        {
          id: `${id}-R1`,
          name: `Kalender ${payload.year}`,
          daysBitmap: '1111111',
          validityStart: `${payload.year}-01-01`,
          validityEnd: `${payload.year}-12-31`,
          includesDates: sortedDates,
          excludesDates: payload.excludedDates?.length
            ? [...new Set(payload.excludedDates)].sort()
            : undefined,
          variantType: payload.variantType,
          appliesTo: payload.appliesTo,
          variantNumber: payload.variantNumber || '00',
          reason: payload.reason,
        },
      ],
    };

    this._periods.update((periods) => [period, ...periods]);
    return id;
  }

  updatePeriod(periodId: string, payload: TrafficPeriodCreatePayload) {
    if (!payload.selectedDates.length) {
      return;
    }

    const sortedDates = [...new Set(payload.selectedDates)].sort();

    this._periods.update((periods) =>
      periods.map((period) => {
        if (period.id !== periodId) {
          return period;
        }

        const existingRuleId = period.rules[0]?.id ?? `${periodId}-R1`;

        return {
          ...period,
          name: payload.name,
          type: payload.type,
          description: payload.description,
          responsible: payload.responsible,
          tags: this.normalizeTags(payload.tags),
          updatedAt: new Date().toISOString(),
          rules: [
            {
              id: existingRuleId,
              name: `Kalender ${payload.year}`,
              daysBitmap: '1111111',
              validityStart: `${payload.year}-01-01`,
              validityEnd: `${payload.year}-12-31`,
              includesDates: sortedDates,
              excludesDates: payload.excludedDates?.length
                ? [...new Set(payload.excludedDates)].sort()
                : undefined,
              variantType: payload.variantType,
              appliesTo: payload.appliesTo,
              variantNumber: payload.variantNumber || '00',
              reason: payload.reason,
            },
          ],
        } satisfies TrafficPeriod;
      }),
    );
  }

  ensureRailMlPeriod(payload: RailMlTrafficPeriodPayload): TrafficPeriod {
    const sourceTag = `railml:${payload.sourceId}`;
    const existing = this._periods().find((period) =>
      period.tags?.includes(sourceTag),
    );
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const id = this.generateId();
    const ruleId = `${id}-R1`;
    const normalizedBitmap = this.normalizeDaysBitmap(payload.daysBitmap);
    const rule: TrafficPeriodRule = {
      id: ruleId,
      name: `RailML ${payload.sourceId}`,
      daysBitmap: normalizedBitmap,
      validityStart: payload.validityStart,
      validityEnd: payload.validityEnd,
      includesDates: this.expandDates(
        payload.validityStart,
        payload.validityEnd,
        normalizedBitmap,
      ),
      variantType: 'series',
      appliesTo: payload.scope ?? 'commercial',
      reason: payload.reason ?? payload.description,
    };

    const period: TrafficPeriod = {
      id,
      name: payload.name,
      type: payload.type ?? 'standard',
      description: payload.description,
      responsible: 'RailML Import',
      createdAt: now,
      updatedAt: now,
      rules: [rule],
      tags: ['railml', sourceTag],
    };

    this._periods.update((periods) => [period, ...periods]);
    return period;
  }

  deletePeriod(periodId: string) {
    this._periods.update((periods) =>
      periods.filter((period) => period.id !== periodId),
    );
  }

  private generateId(): string {
    const ts = Date.now().toString(36).toUpperCase();
    return `TPER-${ts}`;
  }

  private normalizeDaysBitmap(value: string): string {
    const sanitized = value
      .padEnd(7, '1')
      .slice(0, 7)
      .split('')
      .map((char) => (char === '1' ? '1' : '0'))
      .join('');
    return sanitized.length === 7 ? sanitized : '1111111';
  }

  private expandDates(
    startIso: string,
    endIso: string,
    daysBitmap: string,
  ): string[] | undefined {
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return undefined;
    }
    const normalizedBitmap = this.normalizeDaysBitmap(daysBitmap);
    const dates: string[] = [];
    for (
      let cursor = new Date(start);
      cursor <= end && dates.length <= 1460;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      const weekday = cursor.getDay();
      const bitmapIndex = weekday === 0 ? 6 : weekday - 1;
      if (normalizedBitmap[bitmapIndex] === '1') {
        dates.push(cursor.toISOString().slice(0, 10));
      }
    }
    return dates.length ? dates : undefined;
  }

  private normalizeTags(tags?: string[]): string[] | undefined {
    if (!tags?.length) {
      return undefined;
    }
    return Array.from(new Set(tags.filter((tag) => tag.trim().length))).map((tag) =>
      tag.trim(),
    );
  }
}
