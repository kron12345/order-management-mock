import { Injectable, Signal, computed, signal } from '@angular/core';
import { Resource } from '../../models/resource';
import { Activity } from '../../models/activity';
import { DEMO_MASTER_DATA } from '../../data/demo-master-data';
import { PlanningResourceCategory, PlanningStageId } from './planning-stage.model';
import { TemporalValue, VehicleType } from '../../models/master-data';
import { addDays, addMinutes, startOfDay, startOfWeek } from '../../core/utils/time-math';

export interface PlanningTimelineRange {
  start: Date;
  end: Date;
}

interface PlanningStageData {
  resources: Resource[];
  activities: Activity[];
  timelineRange: PlanningTimelineRange;
}

function cloneResources(resources: Resource[]): Resource[] {
  return resources.map((resource) => ({
    ...resource,
    attributes: resource.attributes ? { ...resource.attributes } : undefined,
  }));
}

function cloneActivities(activities: Activity[]): Activity[] {
  return activities.map((activity) => ({ ...activity }));
}

function cloneTimelineRange(range: PlanningTimelineRange): PlanningTimelineRange {
  return {
    start: new Date(range.start),
    end: new Date(range.end),
  };
}

function cloneStageData(stage: PlanningStageData): PlanningStageData {
  return {
    resources: cloneResources(stage.resources),
    activities: cloneActivities(stage.activities),
    timelineRange: cloneTimelineRange(stage.timelineRange),
  };
}

function createAttributes(
  category: PlanningResourceCategory,
  extras: Record<string, unknown | undefined>,
): Record<string, unknown> {
  const attributes: Record<string, unknown> = { category };
  Object.entries(extras).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      attributes[key] = value;
    }
  });
  return attributes;
}

const dayFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
});

const timePattern = /^\d{1,2}:\d{2}$/;

function formatDateKey(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

function formatDisplayDate(date: Date): string {
  return dayFormatter.format(date);
}

function withTime(base: Date, timeValue: unknown, fallback: string): Date {
  const target = new Date(base.getTime());
  const source =
    typeof timeValue === 'string' && timePattern.test(timeValue) ? timeValue : fallback;
  const [hourPart, minutePart] = source.split(':');
  const hours = Number.parseInt(hourPart ?? '0', 10);
  const minutes = Number.parseInt(minutePart ?? '0', 10);
  target.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return target;
}

function ensureEndAfter(start: Date, candidate: Date): Date {
  if (candidate.getTime() <= start.getTime()) {
    return addDays(candidate, 1);
  }
  return candidate;
}

function toIsoString(date: Date): string {
  return new Date(date.getTime()).toISOString();
}

function getServiceIds(resource: Resource): string[] {
  const raw = resource.attributes?.['serviceIds'];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

interface ServiceDefinition {
  id: string;
  name: string;
  startTime?: string | null;
  endTime?: string | null;
  description?: string | null;
  route?: string | null;
}

function generateAssignmentActivities(
  resources: Resource[],
  definitions: Map<string, ServiceDefinition>,
  start: Date,
  totalDays: number,
  stageKey: string,
): Activity[] {
  const activities: Activity[] = [];
  resources.forEach((resource, resourceIndex) => {
    const serviceIds = getServiceIds(resource);
    if (serviceIds.length === 0) {
      return;
    }
    for (let day = 0; day < totalDays; day++) {
      const dayBase = addDays(start, day);
      const dayKey = formatDateKey(dayBase);
      const displayDate = formatDisplayDate(dayBase);
      const serviceId = serviceIds[(resourceIndex + day) % serviceIds.length];
      const definition = definitions.get(serviceId);
      const startLabel = definition?.startTime ?? '06:00';
      const endLabel = definition?.endTime ?? '14:00';
      const activityStart = withTime(dayBase, startLabel, '06:00');
      const activityEnd = ensureEndAfter(activityStart, withTime(dayBase, endLabel, '14:00'));
      const titleParts = [definition?.name ?? serviceId];
      if (definition?.route) {
        titleParts.push(definition.route);
      }
      const title = `${titleParts.filter(Boolean).join(' · ')} · ${displayDate}`;
      const meta =
        definition?.description && definition.description.length > 0
          ? { description: definition.description }
          : undefined;
      activities.push({
        id: `${stageKey}-${resource.id}-${dayKey}-${serviceId}`,
        resourceId: resource.id,
        title,
        start: toIsoString(activityStart),
        end: toIsoString(activityEnd),
        type: 'service',
        serviceId: `${serviceId}-${dayKey}`,
        serviceRole: 'segment',
        meta,
      });
    }
  });
  return activities;
}

function generateServiceActivities(
  resources: Resource[],
  start: Date,
  totalDays: number,
  stageKey: string,
  segmentsPerDay = 1,
): Activity[] {
  const activities: Activity[] = [];
  resources.forEach((resource) => {
    const attributes = resource.attributes ?? {};
    const resourceStart = attributes['startTime'];
    const resourceEnd = attributes['endTime'];
    const baseServiceId =
      typeof attributes['serviceId'] === 'string' ? (attributes['serviceId'] as string) : resource.id;
    for (let day = 0; day < totalDays; day++) {
      const dayBase = addDays(start, day);
      const dayKey = formatDateKey(dayBase);
      const displayDate = formatDisplayDate(dayBase);
      const activityStart = withTime(dayBase, resourceStart, '06:00');
      const activityEnd = ensureEndAfter(activityStart, withTime(dayBase, resourceEnd, '14:00'));

      if (segmentsPerDay <= 1) {
        activities.push({
          id: `${stageKey}-${resource.id}-${dayKey}`,
          resourceId: resource.id,
          title: `${resource.name} · ${displayDate}`,
          start: toIsoString(activityStart),
          end: toIsoString(activityEnd),
          type: 'service',
          serviceId: `${baseServiceId}-${dayKey}`,
          serviceRole: 'segment',
        });
        continue;
      }

      const totalDuration = activityEnd.getTime() - activityStart.getTime();
      const segmentDuration = totalDuration / segmentsPerDay;

      for (let segment = 0; segment < segmentsPerDay; segment++) {
        const segmentStart = new Date(activityStart.getTime() + segmentDuration * segment);
        const segmentEnd =
          segment === segmentsPerDay - 1
            ? activityEnd
            : new Date(activityStart.getTime() + segmentDuration * (segment + 1));
        let role: Activity['serviceRole'] = 'segment';
        if (segment === 0) {
          role = 'start';
        } else if (segment === segmentsPerDay - 1) {
          role = 'end';
        }
        activities.push({
          id: `${stageKey}-${resource.id}-${dayKey}-seg${segment}`,
          resourceId: resource.id,
          title: `${resource.name} · ${displayDate} (${segment + 1}/${segmentsPerDay})`,
          start: toIsoString(segmentStart),
          end: toIsoString(segmentEnd),
          type: 'service',
          serviceId: `${baseServiceId}-${dayKey}`,
          serviceRole: role,
        });
      }
    }
  });
  return activities;
}

function generateShiftActivities(
  resources: Resource[],
  start: Date,
  totalDays: number,
  stageKey: string,
  shortShifts = false,
): Activity[] {
  const activities: Activity[] = [];
  resources.forEach((resource, resourceIndex) => {
    for (let day = 0; day < totalDays; day++) {
      const baseDate = addDays(start, day);
      const dayKey = formatDateKey(baseDate);
      const displayDate = formatDisplayDate(baseDate);
      const isEarly = (resourceIndex + day) % 2 === 0;

      const shiftStart = withTime(baseDate, isEarly ? '04:45' : '13:30', isEarly ? '05:00' : '14:00');
      const shiftEndCandidate = withTime(
        baseDate,
        isEarly ? (shortShifts ? '10:30' : '12:45') : shortShifts ? '18:45' : '21:30',
        isEarly ? '12:45' : '21:30',
      );
      const shiftEnd = ensureEndAfter(shiftStart, shiftEndCandidate);

      activities.push({
        id: `${stageKey}-${resource.id}-${dayKey}`,
        resourceId: resource.id,
        title: `${shortShifts ? 'Disposition' : 'Einsatz'} ${displayDate} (${isEarly ? 'Früh' : 'Spät'})`,
        start: toIsoString(shiftStart),
        end: toIsoString(shiftEnd),
        type: 'service',
        serviceId: `${resource.id}-${dayKey}`,
        serviceRole: 'segment',
      });

      if (!shortShifts) {
        const prepStart = addMinutes(shiftStart, -30);
        const prepEnd = addMinutes(shiftStart, -5);
        activities.push({
          id: `${stageKey}-${resource.id}-${dayKey}-prep`,
          resourceId: resource.id,
          title: `Bereitstellung ${displayDate}`,
          start: toIsoString(prepStart),
          end: toIsoString(prepEnd),
          type: 'travel',
          serviceId: `${resource.id}-${dayKey}-prep`,
          serviceRole: 'start',
        });

        const wrapStart = addMinutes(shiftEnd, 5);
        const wrapEnd = addMinutes(shiftEnd, 35);
        activities.push({
          id: `${stageKey}-${resource.id}-${dayKey}-wrap`,
          resourceId: resource.id,
          title: `Abstellung ${displayDate}`,
          start: toIsoString(wrapStart),
          end: toIsoString(wrapEnd),
          type: 'other',
          serviceId: `${resource.id}-${dayKey}-wrap`,
          serviceRole: 'end',
        });
      }
    }
  });
  return activities;
}

function resolveTemporalString(value: string | TemporalValue<string>[] | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  const latest = [...value]
    .filter((entry): entry is TemporalValue<string> => !!entry && !!entry.value)
    .sort(
      (a, b) => new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime(),
    )[0];
  return latest?.value ?? value[value.length - 1]?.value;
}

function createStageData(): Record<PlanningStageId, PlanningStageData> {
  const {
    vehicleServices,
    personnelServices,
    vehicles,
    personnel,
    vehicleTypes,
    vehicleServicePools,
    personnelServicePools,
    vehiclePools,
    personnelPools,
  } = DEMO_MASTER_DATA;

  const vehicleTypeMap = new Map<string, VehicleType>(
    vehicleTypes.map((type) => [type.id, type]),
  );

  const vehicleServicePoolMap = new Map(vehicleServicePools.map((pool) => [pool.id, pool]));
  const personnelServicePoolMap = new Map(personnelServicePools.map((pool) => [pool.id, pool]));
  const vehiclePoolMap = new Map(vehiclePools.map((pool) => [pool.id, pool]));
  const personnelPoolMap = new Map(personnelPools.map((pool) => [pool.id, pool]));

  const vehicleServiceDefinitionMap = new Map<string, ServiceDefinition>(
    vehicleServices.map((service) => [
      service.id,
      {
        id: service.id,
        name: service.name,
        startTime: service.startTime,
        endTime: service.endTime,
        description: service.description,
        route: service.primaryRoute,
      },
    ]),
  );

  const personnelServiceDefinitionMap = new Map<string, ServiceDefinition>(
    personnelServices.map((service) => [
      service.id,
      {
        id: service.id,
        name: service.name,
        startTime: service.startTime,
        endTime: service.endTime,
        description: service.description,
      },
    ]),
  );

  const vehicleServiceResources: Resource[] = vehicleServices.map((service) => ({
    id: `vehicle-service-${service.id}`,
    name: service.name,
    attributes: createAttributes('vehicle-service', {
      serviceId: service.id,
      poolName: vehicleServicePoolMap.get(service.poolId ?? '')?.name,
      description: service.description,
      poolId: service.poolId,
      primaryRoute: service.primaryRoute,
      requiredVehicleTypeIds: service.requiredVehicleTypeIds,
      startTime: service.startTime,
      endTime: service.endTime,
      isOvernight: service.isOvernight,
    }),
  }));

  const personnelServiceResources: Resource[] = personnelServices.map((service) => ({
    id: `personnel-service-${service.id}`,
    name: service.name,
    attributes: createAttributes('personnel-service', {
      serviceId: service.id,
      poolName: personnelServicePoolMap.get(service.poolId ?? '')?.name,
      description: service.description,
      poolId: service.poolId,
      requiredQualifications: service.requiredQualifications,
      startTime: service.startTime,
      endTime: service.endTime,
      isNightService: service.isNightService,
    }),
  }));

  const vehicleResources: Resource[] = vehicles.map((vehicle) => {
    const type = vehicleTypeMap.get(vehicle.typeId);
    const labelParts = [vehicle.vehicleNumber];
    if (type?.label) {
      labelParts.push(type.label);
    }
    return {
      id: `vehicle-${vehicle.id}`,
      name: labelParts.filter(Boolean).join(' · '),
      attributes: createAttributes('vehicle', {
        vehicleId: vehicle.id,
        vehicleNumber: vehicle.vehicleNumber,
        typeId: vehicle.typeId,
        typeLabel: type?.label,
        depot: vehicle.depot,
        poolId: vehicle.poolId,
        poolName: vehicle.poolId ? vehiclePoolMap.get(vehicle.poolId)?.name : undefined,
        fleetStatus: vehicle.fleetStatus,
        hasWifi: vehicle.hasWifi,
        rangeKm: vehicle.rangeKm,
        seatReservation: vehicle.seatReservation,
        lastInspectionDate: vehicle.lastInspectionDate,
        serviceIds: vehicle.serviceIds,
      }),
    };
  });

  const personnelResources: Resource[] = personnel.map((person) => {
    const firstName = resolveTemporalString(person.firstName);
    const preferredName = resolveTemporalString(person.preferredName);
    const displayName = preferredName ?? firstName;
    const fullName = [displayName ?? firstName, person.lastName]
      .filter(Boolean)
      .join(' ');
    return {
      id: `personnel-${person.id}`,
      name: fullName || person.id,
      attributes: createAttributes('personnel', {
        personnelId: person.id,
        preferredName,
        firstName,
        lastName: person.lastName,
        poolId: person.poolId,
        poolName: person.poolId ? personnelPoolMap.get(person.poolId)?.name : undefined,
        homeStation: person.homeStation,
        availabilityStatus: person.availabilityStatus,
        qualificationExpires: person.qualificationExpires,
        isReserve: person.isReserve,
        qualifications: person.qualifications,
        serviceIds: person.serviceIds,
      }),
    };
  });

  const today = new Date();
  const baseStart = startOfWeek(today);
  const operationsStart = new Date(baseStart.getFullYear(), 0, 1);
  const dispatchStart = startOfDay(today);

  const baseActivities = [
    ...generateServiceActivities(vehicleServiceResources, baseStart, 7, 'base', 2),
    ...generateServiceActivities(personnelServiceResources, baseStart, 7, 'base', 2),
  ];

  const operationsActivities = [
    ...generateServiceActivities(vehicleServiceResources, operationsStart, 28, 'operations', 2),
    ...generateServiceActivities(personnelServiceResources, operationsStart, 28, 'operations', 2),
    ...generateAssignmentActivities(vehicleResources, vehicleServiceDefinitionMap, operationsStart, 42, 'operations-vehicle'),
    ...generateAssignmentActivities(personnelResources, personnelServiceDefinitionMap, operationsStart, 42, 'operations-personnel'),
  ];

  const dispatchActivities = [
    ...generateAssignmentActivities(vehicleResources, vehicleServiceDefinitionMap, dispatchStart, 14, 'dispatch-vehicle'),
    ...generateAssignmentActivities(personnelResources, personnelServiceDefinitionMap, dispatchStart, 14, 'dispatch-personnel'),
    ...generateShiftActivities(vehicleResources, dispatchStart, 14, 'dispatch-vehicle-shift', true),
    ...generateShiftActivities(personnelResources, dispatchStart, 14, 'dispatch-personnel-shift', true),
  ];

  return {
    base: {
      resources: [...vehicleServiceResources, ...personnelServiceResources],
      activities: baseActivities,
      timelineRange: {
        start: baseStart,
        end: addDays(baseStart, 7),
      },
    },
    operations: {
      resources: [
        ...vehicleServiceResources,
        ...personnelServiceResources,
        ...vehicleResources,
        ...personnelResources,
      ],
      activities: operationsActivities,
      timelineRange: {
        start: operationsStart,
        end: addDays(operationsStart, 365),
      },
    },
    dispatch: {
      resources: [...vehicleResources, ...personnelResources],
      activities: dispatchActivities,
      timelineRange: {
        start: dispatchStart,
        end: addDays(dispatchStart, 14),
      },
    },
  };
}

@Injectable({ providedIn: 'root' })
export class PlanningDataService {
  private readonly stageDataSignal = signal<Record<PlanningStageId, PlanningStageData>>(
    createStageData(),
  );

  stageResources(stage: PlanningStageId): Signal<Resource[]> {
    return computed(() => cloneResources(this.stageDataSignal()[stage].resources));
  }

  stageActivities(stage: PlanningStageId): Signal<Activity[]> {
    return computed(() => cloneActivities(this.stageDataSignal()[stage].activities));
  }

  stageTimelineRange(stage: PlanningStageId): Signal<PlanningTimelineRange> {
    return computed(() => cloneTimelineRange(this.stageDataSignal()[stage].timelineRange));
  }

  updateStageData(stage: PlanningStageId, updater: (data: PlanningStageData) => PlanningStageData) {
    const current = this.stageDataSignal();
    const next = {
      ...current,
      [stage]: cloneStageData(updater(cloneStageData(current[stage]))),
    };
    this.stageDataSignal.set(next);
  }
}
