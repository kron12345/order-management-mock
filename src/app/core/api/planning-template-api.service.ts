import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { API_CONFIG } from '../../core/config/api-config';
import {
  PlanWeekTemplate,
  PlanWeekValidity,
  WeekInstance,
  PlanWeekRolloutRequest,
  PlanWeekRolloutResponse,
} from '../../models/planning-template';

interface ListResponse<T> {
  items: T[];
}

@Injectable({ providedIn: 'root' })
export class PlanningTemplateApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG);

  // Basisplanung / Templates
  listTemplates(): Observable<PlanWeekTemplate[]> {
    return this.http
      .get<ListResponse<PlanWeekTemplate>>(this.url('/planning/base/templates'))
      .pipe(map((response) => response?.items ?? []));
  }

  upsertTemplate(template: PlanWeekTemplate): Observable<PlanWeekTemplate> {
    return this.http.put<PlanWeekTemplate>(
      this.url(`/planning/base/templates/${encodeURIComponent(template.id)}`),
      template,
    );
  }

  deleteTemplate(templateId: string): Observable<void> {
    return this.http.delete<void>(this.url(`/planning/base/templates/${encodeURIComponent(templateId)}`));
  }

  listValidities(templateId: string): Observable<PlanWeekValidity[]> {
    return this.http
      .get<ListResponse<PlanWeekValidity>>(
        this.url(`/planning/base/templates/${encodeURIComponent(templateId)}/validities`),
      )
      .pipe(map((response) => response?.items ?? []));
  }

  upsertValidity(templateId: string, validity: PlanWeekValidity): Observable<PlanWeekValidity> {
    return this.http.put<PlanWeekValidity>(
      this.url(
        `/planning/base/templates/${encodeURIComponent(templateId)}/validities/${encodeURIComponent(validity.id)}`,
      ),
      validity,
    );
  }

  deleteValidity(templateId: string, validityId: string): Observable<void> {
    return this.http.delete<void>(
      this.url(
        `/planning/base/templates/${encodeURIComponent(templateId)}/validities/${encodeURIComponent(validityId)}`,
      ),
    );
  }

  rolloutTemplate(payload: PlanWeekRolloutRequest): Observable<PlanWeekRolloutResponse> {
    return this.http.post<PlanWeekRolloutResponse>(this.url('/planning/base/templates:rollout'), payload);
  }

  // Betriebsplanung / Week instances
  listWeekInstances(params: { fromIso: string; toIso: string }): Observable<WeekInstance[]> {
    const query = new URLSearchParams({ from: params.fromIso, to: params.toIso }).toString();
    return this.http
      .get<ListResponse<WeekInstance>>(this.url(`/planning/operations/weeks?${query}`))
      .pipe(map((response) => response?.items ?? []));
  }

  getWeekInstance(id: string): Observable<WeekInstance> {
    return this.http.get<WeekInstance>(this.url(`/planning/operations/weeks/${encodeURIComponent(id)}`));
  }

  upsertWeekInstance(instance: WeekInstance): Observable<WeekInstance> {
    return this.http.put<WeekInstance>(
      this.url(`/planning/operations/weeks/${encodeURIComponent(instance.id)}`),
      instance,
    );
  }

  deleteWeekInstance(id: string): Observable<void> {
    return this.http.delete<void>(this.url(`/planning/operations/weeks/${encodeURIComponent(id)}`));
  }

  private url(path: string): string {
    const base = this.config.baseUrl.replace(/\/$/, '');
    return `${base}${path}`;
  }
}
