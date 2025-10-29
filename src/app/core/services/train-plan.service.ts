import { Injectable, computed, signal } from '@angular/core';
import {
  TrainPlan,
  TrainPlanSourceType,
  TrainPlanStatus,
} from '../models/train-plan.model';
import { MOCK_TRAIN_PLANS } from '../mock/mock-train-plans.mock';
import { ScheduleTemplateService, CreateScheduleTemplateStopPayload } from './schedule-template.service';
import { ScheduleTemplateStop } from '../models/schedule-template.model';
import { TrafficPeriodService } from './traffic-period.service';

export interface TrainPlanFilters {
  search: string;
  status: TrainPlanStatus | 'all';
  source: TrainPlanSourceType | 'all';
  responsibleRu: string | 'all';
}

export interface TrainPlanSort {
  field: 'updatedAt' | 'trainNumber' | 'status' | 'title';
  direction: 'asc' | 'desc';
}

export interface CreatePlansFromTemplatePayload {
  templateId: string;
  trafficPeriodId: string;
  startTime: string; // HH:mm
  intervalMinutes: number;
  count: number;
  responsibleRu?: string;
}

export interface CreateManualPlanPayload {
  title: string;
  trainNumber: string;
  responsibleRu: string;
  departure: string; // ISO datetime
  stops: (CreateScheduleTemplateStopPayload | ScheduleTemplateStop)[];
  sourceName?: string;
  notes?: string;
  templateId?: string;
}

@Injectable({ providedIn: 'root' })
export class TrainPlanService {
  private readonly _plans = signal<TrainPlan[]>(MOCK_TRAIN_PLANS);
  private readonly _filters = signal<TrainPlanFilters>({
    search: '',
    status: 'all',
    source: 'all',
    responsibleRu: 'all',
  });
  private readonly _sort = signal<TrainPlanSort>({
    field: 'updatedAt',
    direction: 'desc',
  });

  readonly plans = computed(() => this._plans());
  readonly filters = computed(() => this._filters());
  readonly sort = computed(() => this._sort());

  readonly responsibleRus = computed(() =>
    Array.from(
      new Set(this._plans().map((plan) => plan.responsibleRu)),
    ).sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' })),
  );

  readonly filteredPlans = computed(() => {
    const filters = this._filters();
    const sort = this._sort();
    const search = filters.search.toLowerCase();

    return this._plans()
      .filter((plan) => {
        if (search) {
          const haystack = `${plan.title} ${plan.trainNumber} ${plan.responsibleRu} ${
            plan.source.name
          } ${plan.notes ?? ''}`.toLowerCase();
          if (!haystack.includes(search)) {
            return false;
          }
        }
        if (filters.status !== 'all' && plan.status !== filters.status) {
          return false;
        }
        if (filters.source !== 'all' && plan.source.type !== filters.source) {
          return false;
        }
        if (
          filters.responsibleRu !== 'all' &&
          plan.responsibleRu !== filters.responsibleRu
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => this.sortPlans(a, b, sort));
  });

  constructor(
    private readonly scheduleTemplateService: ScheduleTemplateService,
    private readonly trafficPeriodService: TrafficPeriodService,
  ) {}

  setFilters(patch: Partial<TrainPlanFilters>) {
    this._filters.update((current) => ({ ...current, ...patch }));
  }

  resetFilters() {
    this._filters.set({
      search: '',
      status: 'all',
      source: 'all',
      responsibleRu: 'all',
    });
  }

  setSort(sort: TrainPlanSort) {
    this._sort.set(sort);
  }

  linkOrderItem(planId: string, itemId: string) {
    this._plans.update((plans) =>
      plans.map((plan) =>
        plan.id === planId ? { ...plan, linkedOrderItemId: itemId } : plan,
      ),
    );
  }

  unlinkOrderItem(planId: string) {
    this._plans.update((plans) =>
      plans.map((plan) =>
        plan.id === planId ? { ...plan, linkedOrderItemId: undefined } : plan,
      ),
    );
  }

  createPlansFromTemplate(
    payload: CreatePlansFromTemplatePayload,
  ): TrainPlan[] {
    const template = this.scheduleTemplateService.getById(payload.templateId);
    if (!template) {
      throw new Error('Vorlage nicht gefunden');
    }
    const templateEntity = template as NonNullable<
      ReturnType<ScheduleTemplateService['getById']>
    >;

    const period = this.trafficPeriodService.getById(payload.trafficPeriodId);
    if (!period) {
      throw new Error('Verkehrsperiode nicht gefunden');
    }

    const dates = Array.from(
      new Set(
        period.rules.flatMap((rule) => rule.includesDates ?? []),
      ),
    ).sort();

    if (!dates.length) {
      throw new Error('Verkehrsperiode enthält keine aktiven Tage');
    }

    const startMinutes = this.parseTimeToMinutes(payload.startTime);
    if (startMinutes === undefined) {
      throw new Error('Ungültige Startzeit');
    }

    const interval = Math.max(1, payload.intervalMinutes);
    const count = Math.max(1, payload.count);

    const nowIso = new Date().toISOString();
    const plans: TrainPlan[] = [];
    let dateIndex = 0;
    let minutesWithinDay = startMinutes;

    for (let i = 0; i < count; i++) {
      if (dateIndex >= dates.length) {
        break;
      }

      const currentDate = dates[dateIndex];
      const departureDate = this.buildDateTime(currentDate, minutesWithinDay);
      const plan = this.buildPlanFromTemplate(
        templateEntity,
        period.id,
        departureDate,
        i,
        payload.responsibleRu ?? template.responsibleRu,
        nowIso,
      );

      plans.push(plan);

      minutesWithinDay += interval;
      if (minutesWithinDay >= 24 * 60) {
        minutesWithinDay = minutesWithinDay % (24 * 60);
        dateIndex++;
      }
    }

    if (!plans.length) {
      throw new Error('Keine Fahrpläne konnten erzeugt werden');
    }

    this._plans.update((existing) => [...plans, ...existing]);
    return plans;
  }

  createManualPlan(payload: CreateManualPlanPayload): TrainPlan {
    const departureDate = new Date(payload.departure);
    if (Number.isNaN(departureDate.getTime())) {
      throw new Error('Ungültige Abfahrtszeit für den Fahrplan.');
    }

    const templateId = payload.templateId ?? `TMP-${Date.now().toString(36).toUpperCase()}`;
    const stops = payload.stops.map((stop, index) =>
      this.toTemplateStop(templateId, index, stop),
    );

    if (!stops.length) {
      throw new Error('Der Fahrplan benötigt mindestens einen Halt.');
    }

    const planStops = this.buildStops(stops, departureDate);
    if (!planStops.length) {
      throw new Error('Die Haltestellen enthalten keine gültigen Zeiten.');
    }

    const planId = this.generatePlanId();
    const timestamp = new Date().toISOString();

    const plan: TrainPlan = {
      id: planId,
      title: payload.title,
      trainNumber: payload.trainNumber,
      pathRequestId: `PR-${planId}`,
      pathId: undefined,
      caseReferenceId: undefined,
      status: 'not_ordered',
      responsibleRu: payload.responsibleRu,
      calendar: {
        validFrom: departureDate.toISOString().slice(0, 10),
        validTo: departureDate.toISOString().slice(0, 10),
        daysBitmap: '1111111',
      },
      stops: planStops,
      technical: {
        trainType: 'Passenger',
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      source: {
        type: 'external',
        name: payload.sourceName ?? payload.title,
        templateId,
      },
      linkedOrderItemId: undefined,
      notes: payload.notes,
    } satisfies TrainPlan;

    this._plans.update((plans) => [plan, ...plans]);
    return plan;
  }

  getById(id: string): TrainPlan | undefined {
    return this._plans().find((plan) => plan.id === id);
  }

  private sortPlans(a: TrainPlan, b: TrainPlan, sort: TrainPlanSort) {
    const direction = sort.direction === 'asc' ? 1 : -1;
    switch (sort.field) {
      case 'updatedAt':
        return (
          (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) *
          direction
        );
      case 'trainNumber':
        return (
          a.trainNumber.localeCompare(b.trainNumber, 'de', {
            sensitivity: 'base',
          }) * direction
        );
      case 'status': {
        const order: Record<TrainPlanStatus, number> = {
          not_ordered: 0,
          requested: 1,
          offered: 2,
          confirmed: 3,
          operating: 4,
          canceled: 5,
        };
        return (order[a.status] - order[b.status]) * direction;
      }
      case 'title':
      default:
        return (
          a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }) *
          direction
        );
    }
  }

  private buildPlanFromTemplate(
    template: NonNullable<ReturnType<ScheduleTemplateService['getById']>>,
    trafficPeriodId: string,
    departureDate: Date,
    sequence: number,
    responsibleRu: string,
    timestamp: string,
  ): TrainPlan {
    const planId = this.generatePlanId();
    const trainNumber = this.generateTrainNumber(template.trainNumber, sequence);
    const stops = this.buildStops(template.stops, departureDate);
    const firstStop = stops[0];
    const lastStop = stops[stops.length - 1];
    const calendarDate = departureDate.toISOString().slice(0, 10);

    return {
      id: planId,
      title: `${template.title} ${calendarDate} ${this.formatTimeLabel(departureDate)}`,
      trainNumber,
      pathRequestId: `PR-${planId}`,
      pathId: undefined,
      caseReferenceId: undefined,
      status: 'not_ordered',
      responsibleRu,
      calendar: {
        validFrom: calendarDate,
        validTo: calendarDate,
        daysBitmap: '1111111',
      },
      stops,
      technical: {
        trainType: 'Passenger',
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      source: {
        type: 'rollout',
        name: template.title,
        templateId: template.id,
      },
      linkedOrderItemId: undefined,
      notes: undefined,
    } satisfies TrainPlan;
  }

  private toTemplateStop(
    templateId: string,
    index: number,
    stop: CreateScheduleTemplateStopPayload | ScheduleTemplateStop,
  ): ScheduleTemplateStop {
    if ('id' in stop && 'sequence' in stop) {
      return stop as ScheduleTemplateStop;
    }

    const payload = stop as CreateScheduleTemplateStopPayload;
    return {
      id: `${templateId}-ST-${String(index + 1).padStart(3, '0')}`,
      sequence: index + 1,
      type: payload.type,
      locationCode: payload.locationCode,
      locationName: payload.locationName,
      countryCode: payload.countryCode,
      arrival:
        payload.arrivalEarliest || payload.arrivalLatest
          ? {
              earliest: payload.arrivalEarliest,
              latest: payload.arrivalLatest,
            }
          : undefined,
      departure:
        payload.departureEarliest || payload.departureLatest
          ? {
              earliest: payload.departureEarliest,
              latest: payload.departureLatest,
            }
          : undefined,
      offsetDays: payload.offsetDays,
      dwellMinutes: payload.dwellMinutes,
      activities:
        payload.activities && payload.activities.length
          ? payload.activities
          : ['0001'],
      platformWish: payload.platformWish,
      notes: payload.notes,
    } satisfies ScheduleTemplateStop;
  }

  private buildStops(stops: ScheduleTemplateStop[], departureDate: Date) {
    const baseMinutes = this.extractReferenceMinutes(stops) ?? 0;
    return stops.map((stop) => {
      const arrivalMinutes = this.extractTime(stop.arrival?.earliest ?? stop.arrival?.latest);
      const departureMinutes = this.extractTime(
        stop.departure?.earliest ?? stop.departure?.latest,
      );

      const arrival =
        arrivalMinutes !== undefined
          ? this.addMinutes(departureDate, arrivalMinutes - baseMinutes)
          : undefined;
      const departure =
        departureMinutes !== undefined
          ? this.addMinutes(departureDate, departureMinutes - baseMinutes)
          : undefined;

      return {
        id: this.generateStopId(stop, arrival ?? departure ?? departureDate),
        sequence: stop.sequence,
        type: stop.type,
        locationCode: stop.locationCode,
        locationName: stop.locationName,
        countryCode: stop.countryCode,
        arrivalTime: arrival ? arrival.toISOString() : undefined,
        departureTime: departure ? departure.toISOString() : undefined,
        arrivalOffsetDays: arrival ? this.offsetDays(departureDate, arrival) : undefined,
        departureOffsetDays: departure
          ? this.offsetDays(departureDate, departure)
          : undefined,
        dwellMinutes: stop.dwellMinutes,
        activities: stop.activities,
        platform: stop.platformWish,
        notes: stop.notes,
      } satisfies TrainPlan['stops'][number];
    });
  }

  private extractReferenceMinutes(stops: ScheduleTemplateStop[]): number | undefined {
    for (const stop of stops) {
      const time = this.extractTime(stop.departure?.earliest ?? stop.arrival?.earliest);
      if (time !== undefined) {
        return time;
      }
    }
    return undefined;
  }

  private extractTime(time: string | undefined): number | undefined {
    if (!time) {
      return undefined;
    }
    return this.parseTimeToMinutes(time);
  }

  private parseTimeToMinutes(time: string): number | undefined {
    const match = /^([0-9]{1,2}):([0-9]{2})$/.exec(time);
    if (!match) {
      return undefined;
    }
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    return hours * 60 + minutes;
  }

  private buildDateTime(dateIso: string, minutes: number): Date {
    const [year, month, day] = dateIso.split('-').map(Number);
    const result = new Date(year, month - 1, day, 0, 0, 0, 0);
    result.setMinutes(minutes);
    return result;
  }

  private addMinutes(reference: Date, delta: number): Date {
    const result = new Date(reference.getTime());
    result.setMinutes(result.getMinutes() + delta);
    return result;
  }

  private offsetDays(base: Date, target: Date): number | undefined {
    const diff = target.getTime() - base.getTime();
    const days = Math.round(diff / 86400000);
    return days === 0 ? undefined : days;
  }

  private generatePlanId(): string {
    return `TP-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
  }

  private generateTrainNumber(base: string, sequence: number): string {
    const suffix = (sequence + 1).toString().padStart(3, '0');
    return `${base}-${suffix}`;
  }

  private generateStopId(stop: ScheduleTemplateStop, date: Date): string {
    return `${stop.locationCode}-${date.getTime()}`;
  }

  private formatTimeLabel(date: Date): string {
    return date.toTimeString().slice(0, 5);
  }
}
