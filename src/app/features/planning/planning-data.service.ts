import { Injectable, Signal, computed, signal } from '@angular/core';
import { Resource } from '../../models/resource';
import { Activity } from '../../models/activity';
import { DEMO_MASTER_DATA } from '../../data/demo-master-data';
import { PlanningResourceCategory, PlanningStageId } from './planning-stage.model';
import { TemporalValue, VehicleType } from '../../models/master-data';
import { addDays, startOfDay, startOfWeek } from '../../core/utils/time-math';

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
  const { vehicleServices, personnelServices, vehicles, personnel, vehicleTypes } = DEMO_MASTER_DATA;

  const vehicleTypeMap = new Map<string, VehicleType>(
    vehicleTypes.map((type) => [type.id, type]),
  );

  const vehicleServiceResources: Resource[] = vehicleServices.map((service) => ({
    id: `vehicle-service-${service.id}`,
    name: service.name,
    attributes: createAttributes('vehicle-service', {
      serviceId: service.id,
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
        fleetStatus: vehicle.fleetStatus,
        hasWifi: vehicle.hasWifi,
        rangeKm: vehicle.rangeKm,
        seatReservation: vehicle.seatReservation,
        lastInspectionDate: vehicle.lastInspectionDate,
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
        homeStation: person.homeStation,
        availabilityStatus: person.availabilityStatus,
        qualificationExpires: person.qualificationExpires,
        isReserve: person.isReserve,
        qualifications: person.qualifications,
      }),
    };
  });

  const today = new Date();
  const baseStart = startOfWeek(today);
  const operationsStart = new Date(baseStart.getFullYear(), 0, 1);
  const dispatchStart = startOfDay(today);

  return {
    base: {
      resources: [...vehicleServiceResources, ...personnelServiceResources],
      activities: [],
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
      activities: [],
      timelineRange: {
        start: operationsStart,
        end: addDays(operationsStart, 365),
      },
    },
    dispatch: {
      resources: [...vehicleResources, ...personnelResources],
      activities: [],
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
