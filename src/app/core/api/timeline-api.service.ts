import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api-config';
import { TimelineQuery, TimelineResponseDto } from './timeline-api.types';

@Injectable({ providedIn: 'root' })
export class TimelineApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG);

  loadTimeline(query: TimelineQuery): Observable<TimelineResponseDto> {
    const params = this.buildParams(query);
    return this.http.get<TimelineResponseDto>(`${this.baseUrl()}/api/timeline`, {
      params,
    });
  }

  loadTemplateTimeline(templateId: string, query: TimelineQuery): Observable<TimelineResponseDto> {
    const params = this.buildParams(query);
    return this.http.get<TimelineResponseDto>(
      `${this.baseUrl()}/api/templates/${encodeURIComponent(templateId)}/timeline`,
      { params },
    );
  }

  private buildParams(query: TimelineQuery): HttpParams {
    let params = new HttpParams().set('from', query.from).set('to', query.to);
    if (query.stage) {
      params = params.set('stage', query.stage);
    }
    if (query.lod) {
      params = params.set('lod', query.lod);
    }
    if (query.resourceIds?.length) {
      params = params.set('resourceIds', query.resourceIds.join(','));
    }
    return params;
  }

  private baseUrl(): string {
    return this.config.baseUrl.replace(/\/$/, '');
  }
}
