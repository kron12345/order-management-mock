import { DestroyRef, Injectable, Signal, computed, inject, signal } from '@angular/core';
import { EMPTY, Observable } from 'rxjs';
import { catchError, take, tap } from 'rxjs/operators';
import { Activity, ActivityParticipant } from '../../models/activity';
import { Resource } from '../../models/resource';
import { addDays } from '../../core/utils/time-math';
import { ActivityApiService } from '../../core/api/activity-api.service';
import {
  ActivityBatchMutationRequest,
  ActivityBatchMutationResponse,
  ActivityValidationRequest,
  ActivityValidationResponse,
  PlanningStageSnapshotDto,
  ResourceBatchMutationRequest,
  ResourceBatchMutationResponse,
} from '../../core/api/activity-api.types';
import { PlanningStageId } from './planning-stage.model';
import { PlanningRealtimeEvent, PlanningRealtimeService } from './planning-realtime.service';
import { ClientIdentityService } from '../../core/services/client-identity.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TimetableYearService } from '../../core/services/timetable-year.service';

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
  private readonly realtime = inject(PlanningRealtimeService);
  private readonly identity = inject(ClientIdentityService);
  private readonly timetableYear = inject(TimetableYearService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly userId = this.identity.userId();
  private readonly connectionId = this.identity.connectionId();

  private readonly stageDataSignal = signal<Record<PlanningStageId, PlanningStageData>>(
    STAGE_IDS.reduce((record, stage) => {
      record[stage] = createEmptyStageData();
      return record;
    }, {} as Record<PlanningStageId, PlanningStageData>),
  );

  constructor() {
    STAGE_IDS.forEach((stage) => this.refreshStage(stage));
    STAGE_IDS.forEach((stage) =>
      this.realtime
        .events(stage)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((event) => this.handleRealtimeEvent(event)),
    );
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
    this.api
      .fetchStageSnapshot(stage)
      .pipe(
        take(1),
        tap((snapshot) => this.applyStageSnapshot(stage, snapshot)),
        catchError((error) => {
          console.warn(`[PlanningDataService] Failed to load stage ${stage}`, error);
          return EMPTY;
        }),
      )
      .subscribe();
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

  private applyStageSnapshot(stage: PlanningStageId, snapshot: PlanningStageSnapshotDto): void {
    const timeline = normalizeTimelineRange(
      this.createTimelineFromSnapshot(snapshot.timelineRange),
    );
    const resources = cloneResources(snapshot.resources ?? []);
    const activities = normalizeActivityParticipants(
      cloneActivities(snapshot.activities ?? []),
      resources,
    );
    const data: PlanningStageData = {
      resources,
      activities,
      timelineRange: timeline,
      version: snapshot.version ?? null,
    };
    this.stageDataSignal.update((record) => ({
      ...record,
      [stage]: data,
    }));
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

  private createTimelineFromSnapshot(range?: PlanningStageSnapshotDto['timelineRange']): PlanningTimelineRange {
    if (!range) {
      const yearInfo = this.timetableYear.getYearBounds(new Date());
      return { start: new Date(yearInfo.start), end: new Date(yearInfo.end) };
    }
    const start = range.start ? new Date(range.start) : new Date();
    const yearInfo = this.timetableYear.getYearBounds(start);
    return {
      start: new Date(yearInfo.start),
      end: new Date(yearInfo.end),
    };
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
