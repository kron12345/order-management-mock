import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { EMPTY, Observable } from 'rxjs';
import { catchError, take, tap } from 'rxjs/operators';
import { Activity } from '../../models/activity';
import { Resource } from '../../models/resource';
import { addDays } from '../../core/utils/time-math';
import { ActivityApiService } from '../../core/api/activity-api.service';
import {
  ActivityBatchMutationRequest,
  ActivityBatchMutationResponse,
  ActivityValidationRequest,
  ActivityValidationResponse,
  PlanningStageSnapshotDto,
} from '../../core/api/activity-api.types';
import { PlanningStageId } from './planning-stage.model';

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
    participantResourceIds: activity.participantResourceIds
      ? [...activity.participantResourceIds]
      : undefined,
    requiredQualifications: activity.requiredQualifications
      ? [...activity.requiredQualifications]
      : undefined,
    assignedQualifications: activity.assignedQualifications
      ? [...activity.assignedQualifications]
      : undefined,
    workRuleTags: activity.workRuleTags ? [...activity.workRuleTags] : undefined,
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
    activities: cloneActivities(stage.activities),
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

@Injectable({ providedIn: 'root' })
export class PlanningDataService {
  private readonly api = inject(ActivityApiService);

  private readonly stageDataSignal = signal<Record<PlanningStageId, PlanningStageData>>(
    STAGE_IDS.reduce((record, stage) => {
      record[stage] = createEmptyStageData();
      return record;
    }, {} as Record<PlanningStageId, PlanningStageData>),
  );

  constructor() {
    STAGE_IDS.forEach((stage) => this.refreshStage(stage));
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
    const diff = diffActivities(previousStage.activities, nextStage.activities);
    this.syncActivities(stage, diff);
  }

  private applyStageSnapshot(stage: PlanningStageId, snapshot: PlanningStageSnapshotDto): void {
    const timeline = normalizeTimelineRange(
      this.createTimelineFromSnapshot(snapshot.timelineRange),
    );
    const data: PlanningStageData = {
      resources: cloneResources(snapshot.resources ?? []),
      activities: cloneActivities(snapshot.activities ?? []),
      timelineRange: timeline,
      version: snapshot.version ?? null,
    };
    this.stageDataSignal.update((record) => ({
      ...record,
      [stage]: data,
    }));
  }

  private createTimelineFromSnapshot(range?: PlanningStageSnapshotDto['timelineRange']): PlanningTimelineRange {
    if (!range) {
      return defaultTimeline();
    }
    const start = range.start ? new Date(range.start) : new Date();
    const end = range.end ? new Date(range.end) : addDays(start, 7);
    return { start, end };
  }

  private syncActivities(stage: PlanningStageId, diff: ActivityDiff): void {
    if (!diff.hasChanges) {
      return;
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

function activitiesEqual(a: Activity, b: Activity): boolean {
  const normalizedA = normalizeActivityForComparison(a);
  const normalizedB = normalizeActivityForComparison(b);
  return JSON.stringify(normalizedA) === JSON.stringify(normalizedB);
}

function normalizeActivityForComparison(activity: Activity): Record<string, unknown> {
  return {
    ...activity,
    participantResourceIds: activity.participantResourceIds
      ? [...activity.participantResourceIds].sort()
      : undefined,
    requiredQualifications: activity.requiredQualifications
      ? [...activity.requiredQualifications].sort()
      : undefined,
    assignedQualifications: activity.assignedQualifications
      ? [...activity.assignedQualifications].sort()
      : undefined,
    workRuleTags: activity.workRuleTags ? [...activity.workRuleTags].sort() : undefined,
  };
}
