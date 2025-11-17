import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { API_CONFIG } from '../core/config/api-config';
import {
  OpReplacementStopLink,
  OperationalPoint,
  PersonnelSite,
  ReplacementEdge,
  ReplacementRoute,
  ReplacementStop,
  SectionOfLine,
  TransferEdge,
} from '../shared/planning-types';

type ListPayload<T> = { items: T[] };

@Injectable({ providedIn: 'root' })
export class TopologyApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG);

  listOperationalPoints(): Observable<OperationalPoint[]> {
    return this.getList('/planning/topology/operational-points', [] as OperationalPoint[]);
  }

  saveOperationalPoints(items: OperationalPoint[]): Observable<OperationalPoint[]> {
    return this.putList('/planning/topology/operational-points', items);
  }

  listSectionsOfLine(): Observable<SectionOfLine[]> {
    return this.getList('/planning/topology/sections-of-line', [] as SectionOfLine[]);
  }

  saveSectionsOfLine(items: SectionOfLine[]): Observable<SectionOfLine[]> {
    return this.putList('/planning/topology/sections-of-line', items);
  }

  listPersonnelSites(): Observable<PersonnelSite[]> {
    return this.getList('/planning/topology/personnel-sites', [] as PersonnelSite[]);
  }

  savePersonnelSites(items: PersonnelSite[]): Observable<PersonnelSite[]> {
    return this.putList('/planning/topology/personnel-sites', items);
  }

  listReplacementStops(): Observable<ReplacementStop[]> {
    return this.getList('/planning/topology/replacement-stops', [] as ReplacementStop[]);
  }

  saveReplacementStops(items: ReplacementStop[]): Observable<ReplacementStop[]> {
    return this.putList('/planning/topology/replacement-stops', items);
  }

  listReplacementRoutes(): Observable<ReplacementRoute[]> {
    return this.getList('/planning/topology/replacement-routes', [] as ReplacementRoute[]);
  }

  saveReplacementRoutes(items: ReplacementRoute[]): Observable<ReplacementRoute[]> {
    return this.putList('/planning/topology/replacement-routes', items);
  }

  listReplacementEdges(): Observable<ReplacementEdge[]> {
    return this.getList('/planning/topology/replacement-edges', [] as ReplacementEdge[]);
  }

  saveReplacementEdges(items: ReplacementEdge[]): Observable<ReplacementEdge[]> {
    return this.putList('/planning/topology/replacement-edges', items);
  }

  listOpReplacementStopLinks(): Observable<OpReplacementStopLink[]> {
    return this.getList('/planning/topology/op-replacement-links', [] as OpReplacementStopLink[]);
  }

  saveOpReplacementStopLinks(items: OpReplacementStopLink[]): Observable<OpReplacementStopLink[]> {
    return this.putList('/planning/topology/op-replacement-links', items);
  }

  listTransferEdges(): Observable<TransferEdge[]> {
    return this.getList('/planning/topology/transfer-edges', [] as TransferEdge[]);
  }

  saveTransferEdges(items: TransferEdge[]): Observable<TransferEdge[]> {
    return this.putList('/planning/topology/transfer-edges', items);
  }

  importOperationalPoints(): Observable<string[]> {
    return this.http
      .post<unknown>(this.url('/planning/topology/operational-points/import'), {})
      .pipe(map((response) => this.normalizeLogs(response, 'Operational-Point-Import abgeschlossen.')));
  }

  importSectionsOfLine(): Observable<string[]> {
    return this.http
      .post<unknown>(this.url('/planning/topology/sections-of-line/import'), {})
      .pipe(map((response) => this.normalizeLogs(response, 'Section-of-Line-Import abgeschlossen.')));
  }

  private getList<T>(path: string, fallback: T[]): Observable<T[]> {
    return this.http
      .get<unknown>(this.url(path))
      .pipe(map((response) => this.normalizeListResponse(response, fallback)));
  }

  private putList<T>(path: string, items: T[]): Observable<T[]> {
    return this.http
      .put<unknown>(this.url(path), this.buildPayload(items))
      .pipe(map((response) => this.normalizeListResponse(response, items)));
  }

  private buildPayload<T>(items: T[]): ListPayload<T> {
    return { items };
  }

  private url(path: string): string {
    const base = this.config.baseUrl.replace(/\/$/, '');
    return `${base}${path}`;
  }

  private normalizeListResponse<T>(response: unknown, fallback: T[]): T[] {
    if (Array.isArray(response)) {
      return response as T[];
    }
    if (response && typeof response === 'object') {
      const value = (response as { items?: unknown }).items;
      if (Array.isArray(value)) {
        return value as T[];
      }
    }
    return fallback;
  }

  private normalizeLogs(response: unknown, fallback: string): string[] {
    if (Array.isArray(response)) {
      return response.map((line) => String(line));
    }
    if (response && typeof response === 'object') {
      const maybeLogs = (response as { logs?: unknown; message?: string }).logs;
      if (Array.isArray(maybeLogs)) {
        return maybeLogs.map((line) => String(line));
      }
      const message = (response as { message?: string }).message;
      if (typeof message === 'string') {
        return [message];
      }
    }
    if (typeof response === 'string') {
      return response
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    }
    return [fallback];
  }
}
