import { DestroyRef, Injectable, Signal, computed, inject, signal } from '@angular/core';
import { EMPTY, Observable } from 'rxjs';
import { catchError, take, tap } from 'rxjs/operators';
import { Activity, ActivityParticipant, ServiceRole } from '../../models/activity';
import { Resource } from '../../models/resource';
import { addDays } from '../../core/utils/time-math';
import { ActivityApiService } from '../../core/api/activity-api.service';
import {
  ActivityBatchMutationRequest,
  ActivityBatchMutationResponse,
  ActivityValidationRequest,
  ActivityValidationResponse,
  ResourceBatchMutationRequest,
  ResourceBatchMutationResponse,
} from '../../core/api/activity-api.types';
import { PlanningStageId } from './planning-stage.model';
import { PlanningRealtimeEvent, PlanningRealtimeService } from './planning-realtime.service';
import { ClientIdentityService } from '../../core/services/client-identity.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TimetableYearService } from '../../core/services/timetable-year.service';
import { TimelineApiService } from '../../core/api/timeline-api.service';
import { TimelineActivityDto } from '../../core/api/timeline-api.types';
import { PlanningResourceApiService, ResourceSnapshotDto } from '../../core/api/planning-resource-api.service';
import { TemporalValue } from '../../models/master-data';

export interface PlanningTimelineRange {
  start: Date;
  end: Date;
}

interface PlanningStageData {
  resources: Resource[];
  activities: Activity[];
  timelineRange: PlanningTimelineRange;
  /** Backend data version (e.g. for optimistic locking). */
  version: string | null;
}

interface ActivityDiff extends ActivityBatchMutationRequest {
  hasChanges: boolean;
}

interface ResourceDiff extends ResourceBatchMutationRequest {
  hasChanges: boolean;
}

const STAGE_IDS: PlanningStageId[] = ['base', 'operations', 'dispatch'];

function defaultTimeline(): PlanningTimelineRange {
  const start = new Date();
  const end = addDays(start, 7);
  return { start, end };
}

function createEmptyStageData(): PlanningStageData {
  return {
    resources: [],
    activities: [],
    timelineRange: defaultTimeline(),
    version: null,
  };
}

function cloneResources(resources: Resource[]): Resource[] {
  return resources.map((resource) => ({
    ...resource,
    attributes: resource.attributes ? { ...resource.attributes } : undefined,
  }));
}

function cloneActivities(activities: Activity[]): Activity[] {
  return activities.map((activity) => ({
    ...activity,
    participants: activity.participants
      ? activity.participants.map((participant) => ({ ...participant }))
      : undefined,
    requiredQualifications: activity.requiredQualifications
      ? [...activity.requiredQualifications]
      : undefined,
    assignedQualifications: activity.assignedQualifications
      ? [...activity.assignedQualifications]
      : undefined,
    workRuleTags: activity.workRuleTags ? [...activity.workRuleTags] : undefined,
    attributes: activity.attributes ? { ...activity.attributes } : undefined,
    meta: activity.meta ? { ...activity.meta } : undefined,
  }));
}

function cloneTimelineRange(range: PlanningTimelineRange): PlanningTimelineRange {
  return {
    start: new Date(range.start),
    end: new Date(range.end),
  };
}

function cloneResourceSnapshot(snapshot: ResourceSnapshotDto): ResourceSnapshotDto {
  return JSON.parse(JSON.stringify(snapshot)) as ResourceSnapshotDto;
}

function cloneStageData(stage: PlanningStageData): PlanningStageData {
  return {
    resources: cloneResources(stage.resources),
    activities: cloneActivities(
      normalizeActivityParticipants(stage.activities, stage.resources),
    ),
    timelineRange: cloneTimelineRange(stage.timelineRange),
    version: stage.version,
  };
}

function normalizeTimelineRange(range: PlanningTimelineRange): PlanningTimelineRange {
  if (range.end.getTime() <= range.start.getTime()) {
    return {
      start: range.start,
      end: addDays(range.start, 1),
    };
  }
  return range;
}

function normalizeActivityParticipants(
  activities: Activity[],
  resources: Resource[],
): Activity[] {
  if (!activities.length) {
    return activities;
  }
  const resourceKindMap = new Map<string, Resource['kind']>();
  resources.forEach((resource) => resourceKindMap.set(resource.id, resource.kind));

  const ensureKind = (
    resourceId: string,
    fallbackKind: Resource['kind'] = 'personnel',
  ): Resource['kind'] => {
    return resourceKindMap.get(resourceId) ?? fallbackKind;
  };

  return activities.map((activity) => {
    const participantsMap = new Map<string, ActivityParticipant>();
    const existing = activity.participants ?? [];
    existing.forEach((participant) => {
      if (!participant?.resourceId) {
        return;
      }
      participantsMap.set(participant.resourceId, {
        ...participant,
        kind: participant.kind ?? ensureKind(participant.resourceId),
      });
    });

    const participants = Array.from(participantsMap.values());
    return {
      ...activity,
      participants,
    };
  });
}

@Injectable({ providedIn: 'root' })
export class PlanningDataService {
  private readonly api = inject(ActivityApiService);
  private readonly timelineApi = inject(TimelineApiService);
  private readonly resourceApi = inject(PlanningResourceApiService);
  private readonly realtime = inject(PlanningRealtimeService);
  private readonly identity = inject(ClientIdentityService);
  private readonly timetableYear = inject(TimetableYearService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly userId = this.identity.userId();
  private readonly connectionId = this.identity.connectionId();
  private baseTemplateId: string | null = null;
  private baseTimelineRange: PlanningTimelineRange | null = null;
  private readonly resourceSnapshotSignal = signal<ResourceSnapshotDto | null>(null);

  private readonly stageDataSignal = signal<Record<PlanningStageId, PlanningStageData>>(
    STAGE_IDS.reduce((record, stage) => {
      record[stage] = createEmptyStageData();
      return record;
    }, {} as Record<PlanningStageId, PlanningStageData>),
  );

  constructor() {
    this.loadResourceSnapshot();
    STAGE_IDS.forEach((stage) => this.refreshStage(stage));
    STAGE_IDS.forEach((stage) =>
      this.realtime
        .events(stage)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((event) => this.handleRealtimeEvent(event)),
    );
  }

  private loadResourceSnapshot(): void {
    this.resourceApi
      .fetchSnapshot()
      .pipe(
        take(1),
        tap((snapshot) => {
          const clone = cloneResourceSnapshot(snapshot);
          this.resourceSnapshotSignal.set(cloneResourceSnapshot(clone));
          this.applyResourceSnapshot(clone);
        }),
        catchError((error) => {
          console.warn('[PlanningDataService] Failed to load resource snapshot', error);
          return EMPTY;
        }),
      )
      .subscribe();
  }

  updateResourceSnapshot(updater: (snapshot: ResourceSnapshotDto) => ResourceSnapshotDto): void {
    const current = this.resourceSnapshotSignal();
    if (!current) {
      return;
    }
    const previous = cloneResourceSnapshot(current);
    const next = updater(cloneResourceSnapshot(current));
    this.resourceSnapshotSignal.set(cloneResourceSnapshot(next));
    this.applyResourceSnapshot(next);
    this.resourceApi
      .replaceSnapshot(next)
      .pipe(
        take(1),
        catchError((error) => {
          console.warn('[PlanningDataService] Failed to persist resource snapshot', error);
          this.resourceSnapshotSignal.set(previous);
          this.applyResourceSnapshot(previous);
          return EMPTY;
        }),
      )
      .subscribe();
  }

  private applyResourceSnapshot(snapshot: ResourceSnapshotDto): void {
    const resources = this.flattenResourceSnapshot(snapshot);
    this.stageDataSignal.update((record) => {
      const next = { ...record };
      STAGE_IDS.forEach((stage) => {
        next[stage] = {
          ...next[stage],
          resources: cloneResources(resources),
        };
      });
      return next;
    });
  }

  private flattenResourceSnapshot(snapshot: ResourceSnapshotDto): Resource[] {
    const resources: Resource[] = [];
    const personnelPoolNames = this.buildPoolNameMap(snapshot.personnelPools);
    const personnelServicePoolNames = this.buildPoolNameMap(snapshot.personnelServicePools);
    const vehiclePoolNames = this.buildPoolNameMap(snapshot.vehiclePools);
    const vehicleServicePoolNames = this.buildPoolNameMap(snapshot.vehicleServicePools);

    snapshot.personnelServices.forEach((service) =>
      resources.push(this.personnelServiceToResource(service, personnelServicePoolNames)),
    );
    snapshot.vehicleServices.forEach((service) =>
      resources.push(this.vehicleServiceToResource(service, vehicleServicePoolNames)),
    );
    snapshot.personnel.forEach((person) =>
      resources.push(this.personnelToResource(person, personnelPoolNames)),
    );
    snapshot.vehicles.forEach((vehicle) => resources.push(this.vehicleToResource(vehicle, vehiclePoolNames)));

    return resources;
  }

  private buildPoolNameMap<T extends { id: string; name: string | undefined | null }>(entries: T[]): Map<string, string> {
    const map = new Map<string, string>();
    entries.forEach((entry) => {
      if (entry.id) {
        map.set(entry.id, entry.name?.toString() ?? '');
      }
    });
    return map;
  }

  private personnelServiceToResource(
    service: ResourceSnapshotDto['personnelServices'][number],
    poolNames: Map<string, string>,
  ): Resource {
    const poolName = this.resolvePoolName(poolNames, service.poolId);
    return {
      id: service.id,
      name: service.name?.trim().length ? service.name : service.id,
      kind: 'personnel-service',
      dailyServiceCapacity: service.maxDailyInstances ?? undefined,
      attributes: this.buildResourceAttributes(service, 'personnel-service', poolName),
    };
  }

  private vehicleServiceToResource(
    service: ResourceSnapshotDto['vehicleServices'][number],
    poolNames: Map<string, string>,
  ): Resource {
    const poolName = this.resolvePoolName(poolNames, service.poolId);
    return {
      id: service.id,
      name: service.name?.trim().length ? service.name : service.id,
      kind: 'vehicle-service',
      dailyServiceCapacity: service.maxDailyInstances ?? undefined,
      attributes: this.buildResourceAttributes(service, 'vehicle-service', poolName),
    };
  }

  private personnelToResource(
    person: ResourceSnapshotDto['personnel'][number],
    poolNames: Map<string, string>,
  ): Resource {
    const poolName = this.resolvePoolName(poolNames, person.poolId);
    return {
      id: person.id,
      name: this.formatPersonnelName(person),
      kind: 'personnel',
      attributes: this.buildResourceAttributes(person, 'personnel', poolName),
    };
  }

  private vehicleToResource(
    vehicle: ResourceSnapshotDto['vehicles'][number],
    poolNames: Map<string, string>,
  ): Resource {
    const poolName = this.resolvePoolName(poolNames, vehicle.poolId);
    const displayName = vehicle.vehicleNumber?.trim().length ? vehicle.vehicleNumber : vehicle.id;
    return {
      id: vehicle.id,
      name: displayName ?? vehicle.id,
      kind: 'vehicle',
      attributes: this.buildResourceAttributes(vehicle, 'vehicle', poolName),
    };
  }

  private resolvePoolName(
    poolNames: Map<string, string>,
    poolId: string | null | undefined,
  ): string | undefined {
    if (!poolId) {
      return undefined;
    }
    const name = poolNames.get(poolId);
    return name && name.trim().length ? name : undefined;
  }

  private buildResourceAttributes<T extends object>(
    source: T,
    category: string,
    poolName?: string,
  ): Record<string, unknown> {
    const attrs: Record<string, unknown> = {
      ...(source as Record<string, unknown>),
      category,
    };
    if (poolName) {
      attrs['poolName'] = poolName;
    }
    return attrs;
  }

  private formatPersonnelName(person: ResourceSnapshotDto['personnel'][number]): string {
    const preferred = this.resolveTemporalValue(person.preferredName);
    const first = this.resolveTemporalValue(person.firstName);
    const last = typeof person.lastName === 'string' ? person.lastName : '';
    if (preferred) {
      const fallback = [first, last].filter(Boolean).join(' ').trim();
      return fallback ? `${preferred} (${fallback})` : preferred;
    }
    const combined = [first, last].filter(Boolean).join(' ').trim();
    return combined || person.id;
  }

  private resolveTemporalValue(value: string | TemporalValue<string>[] | undefined): string {
    if (Array.isArray(value)) {
      return value[0]?.value ?? '';
    }
    return value ?? '';
  }

  stageResources(stage: PlanningStageId): Signal<Resource[]> {
    return computed(() => cloneResources(this.stageDataSignal()[stage].resources));
  }

  stageActivities(stage: PlanningStageId): Signal<Activity[]> {
    return computed(() => cloneActivities(this.stageDataSignal()[stage].activities));
  }

  stageTimelineRange(stage: PlanningStageId): Signal<PlanningTimelineRange> {
    return computed(() => cloneTimelineRange(this.stageDataSignal()[stage].timelineRange));
  }

  resourceSnapshot(): Signal<ResourceSnapshotDto | null> {
    return computed(() => {
      const snapshot = this.resourceSnapshotSignal();
      return snapshot ? cloneResourceSnapshot(snapshot) : null;
    });
  }

  setBaseTemplateContext(templateId: string | null): void {
    if (this.baseTemplateId === templateId) {
      return;
    }
    this.baseTemplateId = templateId;
    if (!templateId) {
      this.stageDataSignal.update((record) => ({
        ...record,
        base: {
          ...record.base,
          activities: [],
        },
      }));
    }
  }

  setBaseTimelineRange(range: PlanningTimelineRange | null): void {
    this.baseTimelineRange = range;
    if (!range) {
      return;
    }
    this.stageDataSignal.update((record) => ({
      ...record,
      base: {
        ...record.base,
        timelineRange: cloneTimelineRange(range),
      },
    }));
  }

  reloadBaseTimeline(): void {
    if (!this.baseTemplateId || !this.baseTimelineRange) {
      return;
    }
    this.timelineApi
      .loadTemplateTimeline(this.baseTemplateId, {
        from: this.baseTimelineRange.start.toISOString(),
        to: this.baseTimelineRange.end.toISOString(),
        stage: 'base',
        lod: 'activity',
      })
      .pipe(
        take(1),
        tap((response) => this.applyTimelineActivities('base', response.activities ?? [])),
        catchError((error) => {
          console.warn('[PlanningDataService] Failed to load base timeline', error);
          return EMPTY;
        }),
      )
      .subscribe();
  }

  requestActivityValidation(
    stage: PlanningStageId,
    payload?: ActivityValidationRequest,
  ): Observable<ActivityValidationResponse> {
    const current = this.stageDataSignal()[stage];
    const defaultPayload: ActivityValidationRequest = payload ?? {
      activityIds: current.activities.map((activity) => activity.id),
    };
    return this.api.validateActivities(stage, defaultPayload);
  }

  refreshStage(stage: PlanningStageId): void {
    if (stage === 'base') {
      this.reloadBaseTimeline();
      return;
    }
    const sourceStage: PlanningStageId = stage === 'dispatch' ? 'operations' : stage;
    if (sourceStage !== 'operations') {
      return;
    }
    const range = this.stageDataSignal()[stage].timelineRange;
    this.timelineApi
      .loadTimeline({
        from: range.start.toISOString(),
        to: range.end.toISOString(),
        stage: sourceStage,
        lod: 'activity',
      })
      .pipe(
        take(1),
        tap((response) => this.applyTimelineActivities(stage, response.activities ?? [])),
        catchError((error) => {
          console.warn(`[PlanningDataService] Failed to load timeline for stage ${stage}`, error);
          return EMPTY;
        }),
      )
      .subscribe();
  }

  private applyTimelineActivities(stage: PlanningStageId, entries: TimelineActivityDto[]): void {
    const baseActivities = this.mapTimelineActivities(entries);
    const normalized = normalizeActivityParticipants(baseActivities, this.stageDataSignal()[stage].resources);
    this.stageDataSignal.update((record) => ({
      ...record,
      [stage]: {
        ...record[stage],
        activities: normalized,
      },
    }));
  }

  private mapTimelineActivities(entries: TimelineActivityDto[]): Activity[] {
    return entries.map((entry) => ({
      id: entry.id,
      title: entry.label?.trim().length ? entry.label : entry.type ?? entry.id,
      start: entry.start,
      end: entry.end ?? null,
      type: entry.type,
      from: entry.from ?? undefined,
      to: entry.to ?? undefined,
      remark: entry.remark ?? undefined,
      serviceId: entry.serviceId ?? undefined,
      serviceRole: (entry.serviceRole ?? undefined) as ServiceRole | undefined,
      attributes: entry.attributes ?? undefined,
      participants: entry.resourceAssignments.map((assignment) => ({
        resourceId: assignment.resourceId,
        kind: assignment.resourceType,
        role: (assignment.role ?? undefined) as ActivityParticipant['role'],
      })),
    }));
  }

  updateStageData(stage: PlanningStageId, updater: (data: PlanningStageData) => PlanningStageData) {
    const current = this.stageDataSignal();
    const previousStage = cloneStageData(current[stage]);
    const nextStage = normalizeStage(updater(previousStage));
    this.stageDataSignal.set({
      ...current,
      [stage]: nextStage,
    });
    const activityDiff = diffActivities(previousStage.activities, nextStage.activities);
    const resourceDiff = diffResources(previousStage.resources, nextStage.resources);
    activityDiff.clientRequestId = this.decorateClientRequestId(activityDiff.clientRequestId);
    resourceDiff.clientRequestId = this.decorateClientRequestId(resourceDiff.clientRequestId);
    this.syncResources(stage, resourceDiff);
    this.syncActivities(stage, activityDiff);
  }

  private handleRealtimeEvent(event: PlanningRealtimeEvent): void {
    if (!event) {
      return;
    }
    if (event.sourceConnectionId && event.sourceConnectionId === this.connectionId) {
      return;
    }
    if (!event.sourceConnectionId && event.sourceClientId === this.userId) {
      return;
    }
    const { stageId } = event;
    if (!STAGE_IDS.includes(stageId)) {
      return;
    }
    if (event.scope === 'resources') {
      this.applyIncomingResources(stageId, (event.upserts as Resource[]) ?? [], event.deleteIds ?? [], event.version);
      return;
    }
    if (event.scope === 'activities') {
      this.applyIncomingActivities(stageId, (event.upserts as Activity[]) ?? [], event.deleteIds ?? [], event.version);
      return;
    }
    if (event.scope === 'timeline' && event.timelineRange) {
      this.applyIncomingTimeline(stageId, event.timelineRange, event.version);
    }
  }

  private applyIncomingResources(
    stageId: PlanningStageId,
    upserts: Resource[],
    deleteIds: string[],
    version?: string | null,
  ): void {
    if (upserts.length === 0 && deleteIds.length === 0) {
      return;
    }
    this.stageDataSignal.update((record) => {
      const stage = record[stageId];
      if (!stage) {
        return record;
      }
      const merged = mergeResourceList(stage.resources, upserts, deleteIds);
      if (merged === stage.resources) {
        return record;
      }
      return {
        ...record,
        [stageId]: {
          ...stage,
          resources: merged,
          version: version ?? stage.version,
        },
      };
    });
  }

  private applyIncomingActivities(
    stageId: PlanningStageId,
    upserts: Activity[],
    deleteIds: string[],
    version?: string | null,
  ): void {
    if (upserts.length === 0 && deleteIds.length === 0) {
      return;
    }
    this.stageDataSignal.update((record) => {
      const stage = record[stageId];
      if (!stage) {
        return record;
      }
      const normalizedUpserts = normalizeActivityParticipants(upserts, stage.resources);
      const merged = mergeActivityList(stage.activities, normalizedUpserts, deleteIds);
      if (merged === stage.activities) {
        return record;
      }
      return {
        ...record,
        [stageId]: {
          ...stage,
          activities: merged,
          version: version ?? stage.version,
        },
      };
    });
  }

  private applyIncomingTimeline(
    stageId: PlanningStageId,
    range: PlanningTimelineRange | { start: string | Date; end: string | Date },
    version?: string | null,
  ): void {
    const normalizedRange = convertIncomingTimelineRange(range);
    this.stageDataSignal.update((record) => {
      const stage = record[stageId];
      if (!stage) {
        return record;
      }
      return {
        ...record,
        [stageId]: {
          ...stage,
          timelineRange: normalizeTimelineRange(normalizedRange),
          version: version ?? stage.version,
        },
      };
    });
  }

  private decorateClientRequestId(value?: string): string {
    const base = value && value.length > 0 ? value : `client-sync-${Date.now().toString(36)}`;
    return `${this.userId}|${this.connectionId}|${base}`;
  }

  private syncActivities(stage: PlanningStageId, diff: ActivityDiff): void {
    if (!diff.hasChanges) {
      return;
    }
    const stageData = this.stageDataSignal()[stage];
    if (diff.upserts && stageData) {
      diff.upserts = normalizeActivityParticipants(diff.upserts, stageData.resources);
    }
    this.api
      .batchMutateActivities(stage, {
        upserts: diff.upserts,
        deleteIds: diff.deleteIds,
        clientRequestId: diff.clientRequestId,
      })
      .pipe(
        take(1),
        tap((response) => this.applyMutationResponse(stage, response)),
        catchError((error) => {
          console.error(`[PlanningDataService] Failed to sync activities for ${stage}`, error);
          this.refreshStage(stage);
          return EMPTY;
        }),
      )
      .subscribe();
  }

  private applyMutationResponse(stage: PlanningStageId, response: ActivityBatchMutationResponse): void {
    if (!response.version) {
      return;
    }
    this.stageDataSignal.update((record) => ({
      ...record,
      [stage]: {
        ...record[stage],
        version: response.version ?? record[stage].version,
      },
    }));
  }

  private syncResources(stage: PlanningStageId, diff: ResourceDiff): void {
    if (!diff.hasChanges) {
      return;
    }
    this.api
      .batchMutateResources(stage, {
        upserts: diff.upserts,
        deleteIds: diff.deleteIds,
        clientRequestId: diff.clientRequestId,
      })
      .pipe(
        take(1),
        catchError((error) => {
          console.error(`[PlanningDataService] Failed to sync resources for ${stage}`, error);
          this.refreshStage(stage);
          return EMPTY;
        }),
      )
      .subscribe();
  }
}

function normalizeStage(stage: PlanningStageData): PlanningStageData {
  return {
    ...stage,
    resources: cloneResources(stage.resources),
    activities: cloneActivities(stage.activities),
    timelineRange: normalizeTimelineRange(cloneTimelineRange(stage.timelineRange)),
  };
}

function diffActivities(previous: Activity[], next: Activity[]): ActivityDiff {
  const previousMap = new Map(previous.map((activity) => [activity.id, activity]));
  const nextMap = new Map(next.map((activity) => [activity.id, activity]));
  const upserts: Activity[] = [];
  const deleteIds: string[] = [];

  next.forEach((activity) => {
    const before = previousMap.get(activity.id);
    if (!before || !activitiesEqual(before, activity)) {
      upserts.push(activity);
    }
  });

  previous.forEach((activity) => {
    if (!nextMap.has(activity.id)) {
      deleteIds.push(activity.id);
    }
  });

  return {
    upserts: upserts.length > 0 ? upserts : undefined,
    deleteIds: deleteIds.length > 0 ? deleteIds : undefined,
    clientRequestId: `activity-sync-${Date.now().toString(36)}`,
    hasChanges: upserts.length > 0 || deleteIds.length > 0,
  };
}

function diffResources(previous: Resource[], next: Resource[]): ResourceDiff {
  const previousMap = new Map(previous.map((resource) => [resource.id, resource]));
  const nextMap = new Map(next.map((resource) => [resource.id, resource]));
  const upserts: Resource[] = [];
  const deleteIds: string[] = [];

  next.forEach((resource) => {
    const before = previousMap.get(resource.id);
    if (!before || !resourcesEqual(before, resource)) {
      upserts.push(resource);
    }
  });

  previous.forEach((resource) => {
    if (!nextMap.has(resource.id)) {
      deleteIds.push(resource.id);
    }
  });

  return {
    upserts: upserts.length > 0 ? upserts : undefined,
    deleteIds: deleteIds.length > 0 ? deleteIds : undefined,
    clientRequestId: `resource-sync-${Date.now().toString(36)}`,
    hasChanges: upserts.length > 0 || deleteIds.length > 0,
  };
}

function resourcesEqual(a: Resource, b: Resource): boolean {
  const normalizedA = normalizeResourceForComparison(a);
  const normalizedB = normalizeResourceForComparison(b);
  return JSON.stringify(normalizedA) === JSON.stringify(normalizedB);
}

function normalizeResourceForComparison(resource: Resource): Record<string, unknown> {
  return {
    id: resource.id,
    name: resource.name,
    kind: resource.kind,
    dailyServiceCapacity: resource.dailyServiceCapacity ?? null,
    attributes: sortObject(resource.attributes ?? null),
  };
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortObject(entry));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const sorted: Record<string, unknown> = {};
    entries.forEach(([key, val]) => {
      sorted[key] = sortObject(val);
    });
    return sorted;
  }
  return value;
}

function activitiesEqual(a: Activity, b: Activity): boolean {
  const normalizedA = normalizeActivityForComparison(a);
  const normalizedB = normalizeActivityForComparison(b);
  return JSON.stringify(normalizedA) === JSON.stringify(normalizedB);
}

function normalizeActivityForComparison(activity: Activity): Record<string, unknown> {
  return {
    ...activity,
    requiredQualifications: activity.requiredQualifications
      ? [...activity.requiredQualifications].sort()
      : undefined,
    assignedQualifications: activity.assignedQualifications
      ? [...activity.assignedQualifications].sort()
      : undefined,
    workRuleTags: activity.workRuleTags ? [...activity.workRuleTags].sort() : undefined,
    participants: activity.participants
      ? [...activity.participants].sort((a, b) => a.resourceId.localeCompare(b.resourceId))
      : undefined,
    attributes: sortObject(activity.attributes ?? null),
    meta: sortObject(activity.meta ?? null),
  };
}

function mergeResourceList(existing: Resource[], upserts: Resource[], deleteIds: string[]): Resource[] {
  if (upserts.length === 0 && deleteIds.length === 0) {
    return existing;
  }
  const map = new Map(existing.map((resource) => [resource.id, resource]));
  let mutated = false;

  deleteIds.forEach((id) => {
    if (map.delete(id)) {
      mutated = true;
    }
  });

  const clonedUpserts = cloneResources(upserts);
  clonedUpserts.forEach((resource) => {
    const before = map.get(resource.id);
    if (!before || !resourcesEqual(before, resource)) {
      map.set(resource.id, resource);
      mutated = true;
    }
  });

  return mutated ? Array.from(map.values()) : existing;
}

function mergeActivityList(existing: Activity[], upserts: Activity[], deleteIds: string[]): Activity[] {
  if (upserts.length === 0 && deleteIds.length === 0) {
    return existing;
  }
  const map = new Map(existing.map((activity) => [activity.id, activity]));
  let mutated = false;

  deleteIds.forEach((id) => {
    if (map.delete(id)) {
      mutated = true;
    }
  });

  const clonedUpserts = cloneActivities(upserts);
  clonedUpserts.forEach((activity) => {
    const before = map.get(activity.id);
    if (!before || !activitiesEqual(before, activity)) {
      map.set(activity.id, activity);
      mutated = true;
    }
  });

  return mutated ? Array.from(map.values()) : existing;
}

function convertIncomingTimelineRange(
  range: PlanningTimelineRange | { start: string | Date; end: string | Date },
): PlanningTimelineRange {
  const start = range.start instanceof Date ? range.start : new Date(range.start);
  const end = range.end instanceof Date ? range.end : new Date(range.end);
  return { start, end };
}
