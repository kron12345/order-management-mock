import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { PlanningStageId } from '../../features/planning/planning-stage.model';
import { API_CONFIG } from '../config/api-config';
import {
  ActivityBatchMutationRequest,
  ActivityBatchMutationResponse,
  ActivityValidationRequest,
  ActivityValidationResponse,
  PlanningStageSnapshotDto,
  ResourceBatchMutationRequest,
  ResourceBatchMutationResponse,
} from './activity-api.types';

export interface ActivityListQuery {
  from?: string;
  to?: string;
  resourceIds?: string[];
}

@Injectable({ providedIn: 'root' })
export class ActivityApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG);

  fetchStageSnapshot(stageId: PlanningStageId): Observable<PlanningStageSnapshotDto> {
    return this.http.get<PlanningStageSnapshotDto>(this.stageUrl(stageId));
  }

  listActivities(stageId: PlanningStageId, query: ActivityListQuery = {}): Observable<PlanningStageSnapshotDto['activities']> {
    let params = new HttpParams();
    if (query.from) {
      params = params.set('from', query.from);
    }
    if (query.to) {
      params = params.set('to', query.to);
    }
    if (query.resourceIds && query.resourceIds.length > 0) {
      params = params.set('resourceIds', query.resourceIds.join(','));
    }
    return this.http.get<PlanningStageSnapshotDto['activities']>(`${this.stageUrl(stageId)}/activities`, {
      params,
    });
  }

  batchMutateActivities(
    stageId: PlanningStageId,
    payload: ActivityBatchMutationRequest,
  ): Observable<ActivityBatchMutationResponse> {
    return this.http.put<ActivityBatchMutationResponse>(`${this.stageUrl(stageId)}/activities`, payload);
  }

  batchMutateResources(
    stageId: PlanningStageId,
    payload: ResourceBatchMutationRequest,
  ): Observable<ResourceBatchMutationResponse> {
    return this.http.put<ResourceBatchMutationResponse>(`${this.stageUrl(stageId)}/resources`, payload);
  }

  listResources(stageId: PlanningStageId): Observable<PlanningStageSnapshotDto['resources']> {
    return this.http.get<PlanningStageSnapshotDto['resources']>(`${this.stageUrl(stageId)}/resources`);
  }

  validateActivities(
    stageId: PlanningStageId,
    payload: ActivityValidationRequest,
  ): Observable<ActivityValidationResponse> {
    return this.http.post<ActivityValidationResponse>(`${this.stageUrl(stageId)}/activities:validate`, payload);
  }

  private stageUrl(stageId: PlanningStageId): string {
    const base = this.config.baseUrl.replace(/\/$/, '');
    return `${base}/planning/stages/${stageId}`;
  }
}
