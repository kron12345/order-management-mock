import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { API_CONFIG } from '../../core/config/api-config';
import {
  PersonnelPool,
  PersonnelServicePool,
  VehicleComposition,
  VehiclePool,
  VehicleServicePool,
  VehicleType,
} from '../../models/master-data';

type ListRequestPayload<T> = { items: T[] };

@Injectable({ providedIn: 'root' })
export class MasterDataApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG);

  listPersonnelServicePools(): Observable<PersonnelServicePool[]> {
    return this.http
      .get<unknown>(this.url('/planning/master-data/personnel-service-pools'))
      .pipe(map((response) => this.normalizeListResponse(response, [] as PersonnelServicePool[])));
  }

  savePersonnelServicePools(items: PersonnelServicePool[]): Observable<PersonnelServicePool[]> {
    return this.http
      .put<unknown>(this.url('/planning/master-data/personnel-service-pools'), this.buildPayload(items))
      .pipe(map((response) => this.normalizeListResponse(response, items)));
  }

  listPersonnelPools(): Observable<PersonnelPool[]> {
    return this.http
      .get<unknown>(this.url('/planning/master-data/personnel-pools'))
      .pipe(map((response) => this.normalizeListResponse(response, [] as PersonnelPool[])));
  }

  savePersonnelPools(items: PersonnelPool[]): Observable<PersonnelPool[]> {
    return this.http
      .put<unknown>(this.url('/planning/master-data/personnel-pools'), this.buildPayload(items))
      .pipe(map((response) => this.normalizeListResponse(response, items)));
  }

  listVehicleServicePools(): Observable<VehicleServicePool[]> {
    return this.http
      .get<unknown>(this.url('/planning/master-data/vehicle-service-pools'))
      .pipe(map((response) => this.normalizeListResponse(response, [] as VehicleServicePool[])));
  }

  saveVehicleServicePools(items: VehicleServicePool[]): Observable<VehicleServicePool[]> {
    return this.http
      .put<unknown>(this.url('/planning/master-data/vehicle-service-pools'), this.buildPayload(items))
      .pipe(map((response) => this.normalizeListResponse(response, items)));
  }

  listVehiclePools(): Observable<VehiclePool[]> {
    return this.http
      .get<unknown>(this.url('/planning/master-data/vehicle-pools'))
      .pipe(map((response) => this.normalizeListResponse(response, [] as VehiclePool[])));
  }

  saveVehiclePools(items: VehiclePool[]): Observable<VehiclePool[]> {
    return this.http
      .put<unknown>(this.url('/planning/master-data/vehicle-pools'), this.buildPayload(items))
      .pipe(map((response) => this.normalizeListResponse(response, items)));
  }

  listVehicleTypes(): Observable<VehicleType[]> {
    return this.http
      .get<unknown>(this.url('/planning/master-data/vehicle-types'))
      .pipe(map((response) => this.normalizeListResponse(response, [] as VehicleType[])));
  }

  saveVehicleTypes(items: VehicleType[]): Observable<VehicleType[]> {
    return this.http
      .put<unknown>(this.url('/planning/master-data/vehicle-types'), this.buildPayload(items))
      .pipe(map((response) => this.normalizeListResponse(response, items)));
  }

  listVehicleCompositions(): Observable<VehicleComposition[]> {
    return this.http
      .get<unknown>(this.url('/planning/master-data/vehicle-compositions'))
      .pipe(map((response) => this.normalizeListResponse(response, [] as VehicleComposition[])));
  }

  saveVehicleCompositions(items: VehicleComposition[]): Observable<VehicleComposition[]> {
    return this.http
      .put<unknown>(this.url('/planning/master-data/vehicle-compositions'), this.buildPayload(items))
      .pipe(map((response) => this.normalizeListResponse(response, items)));
  }

  private buildPayload<T>(items: T[]): ListRequestPayload<T> {
    return {
      items,
    };
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
      const items = (response as { items?: unknown }).items;
      if (Array.isArray(items)) {
        return items as T[];
      }
    }
    return fallback;
  }
}
