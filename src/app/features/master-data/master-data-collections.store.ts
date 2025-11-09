import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, EMPTY, Observable, of, take, tap } from 'rxjs';
import { DEMO_MASTER_DATA } from '../../data/demo-master-data';
import {
  PersonnelPool,
  PersonnelServicePool,
  VehicleComposition,
  VehiclePool,
  VehicleServicePool,
  VehicleType,
} from '../../models/master-data';
import { MasterDataApiService } from './master-data-api.service';

type CollectionKey =
  | 'personnelServicePools'
  | 'personnelPools'
  | 'vehicleServicePools'
  | 'vehiclePools'
  | 'vehicleTypes'
  | 'vehicleCompositions';

interface MasterDataCollectionsState {
  personnelServicePools: PersonnelServicePool[];
  personnelPools: PersonnelPool[];
  vehicleServicePools: VehicleServicePool[];
  vehiclePools: VehiclePool[];
  vehicleTypes: VehicleType[];
  vehicleCompositions: VehicleComposition[];
}

const INITIAL_STATE: MasterDataCollectionsState = {
  personnelServicePools: DEMO_MASTER_DATA.personnelServicePools,
  personnelPools: DEMO_MASTER_DATA.personnelPools,
  vehicleServicePools: DEMO_MASTER_DATA.vehicleServicePools,
  vehiclePools: DEMO_MASTER_DATA.vehiclePools,
  vehicleTypes: DEMO_MASTER_DATA.vehicleTypes,
  vehicleCompositions: DEMO_MASTER_DATA.vehicleCompositions,
};

@Injectable({ providedIn: 'root' })
export class MasterDataCollectionsStoreService {
  private readonly api = inject(MasterDataApiService);
  private readonly state = signal<MasterDataCollectionsState>({ ...INITIAL_STATE });

  readonly personnelServicePools = computed(() => this.state().personnelServicePools);
  readonly personnelPools = computed(() => this.state().personnelPools);
  readonly vehicleServicePools = computed(() => this.state().vehicleServicePools);
  readonly vehiclePools = computed(() => this.state().vehiclePools);
  readonly vehicleTypes = computed(() => this.state().vehicleTypes);
  readonly vehicleCompositions = computed(() => this.state().vehicleCompositions);

  constructor() {
    this.refreshAll();
  }

  refreshAll(): void {
    this.refreshPersonnelServicePools();
    this.refreshPersonnelPools();
    this.refreshVehicleServicePools();
    this.refreshVehiclePools();
    this.refreshVehicleTypes();
    this.refreshVehicleCompositions();
  }

  refreshPersonnelServicePools(): void {
    this.loadList('personnelServicePools', this.api.listPersonnelServicePools(), INITIAL_STATE.personnelServicePools);
  }

  refreshPersonnelPools(): void {
    this.loadList('personnelPools', this.api.listPersonnelPools(), INITIAL_STATE.personnelPools);
  }

  refreshVehicleServicePools(): void {
    this.loadList('vehicleServicePools', this.api.listVehicleServicePools(), INITIAL_STATE.vehicleServicePools);
  }

  refreshVehiclePools(): void {
    this.loadList('vehiclePools', this.api.listVehiclePools(), INITIAL_STATE.vehiclePools);
  }

  refreshVehicleTypes(): void {
    this.loadList('vehicleTypes', this.api.listVehicleTypes(), INITIAL_STATE.vehicleTypes);
  }

  refreshVehicleCompositions(): void {
    this.loadList('vehicleCompositions', this.api.listVehicleCompositions(), INITIAL_STATE.vehicleCompositions);
  }

  syncPersonnelServicePools(entries: PersonnelServicePool[]): void {
    this.saveList(
      'personnelServicePools',
      entries,
      (payload) => this.api.savePersonnelServicePools(payload),
      () => this.refreshPersonnelServicePools(),
    );
  }

  syncPersonnelPools(entries: PersonnelPool[]): void {
    this.saveList(
      'personnelPools',
      entries,
      (payload) => this.api.savePersonnelPools(payload),
      () => this.refreshPersonnelPools(),
    );
  }

  syncVehicleServicePools(entries: VehicleServicePool[]): void {
    this.saveList(
      'vehicleServicePools',
      entries,
      (payload) => this.api.saveVehicleServicePools(payload),
      () => this.refreshVehicleServicePools(),
    );
  }

  syncVehiclePools(entries: VehiclePool[]): void {
    this.saveList(
      'vehiclePools',
      entries,
      (payload) => this.api.saveVehiclePools(payload),
      () => this.refreshVehiclePools(),
    );
  }

  syncVehicleTypes(entries: VehicleType[]): void {
    this.saveList(
      'vehicleTypes',
      entries,
      (payload) => this.api.saveVehicleTypes(payload),
      () => this.refreshVehicleTypes(),
    );
  }

  syncVehicleCompositions(entries: VehicleComposition[]): void {
    this.saveList(
      'vehicleCompositions',
      entries,
      (payload) => this.api.saveVehicleCompositions(payload),
      () => this.refreshVehicleCompositions(),
    );
  }

  private loadList<K extends CollectionKey>(
    key: K,
    request$: Observable<MasterDataCollectionsState[K]>,
    fallback: MasterDataCollectionsState[K],
  ): void {
    request$
      .pipe(
        take(1),
        tap((items) => this.patchState(key, items)),
        catchError((error) => {
          console.warn(`[MasterDataCollectionsStore] Failed to load ${key}`, error);
          this.patchState(key, fallback);
          return of(fallback);
        }),
      )
      .subscribe();
  }

  private saveList<K extends CollectionKey>(
    key: K,
    entries: MasterDataCollectionsState[K],
    requestFactory: (payload: MasterDataCollectionsState[K]) => Observable<MasterDataCollectionsState[K]>,
    onError: () => void,
  ): void {
    const payload = this.clone(entries);
    this.patchState(key, payload);
    requestFactory(payload)
      .pipe(
        take(1),
        tap((items) => this.patchState(key, items)),
        catchError((error) => {
          console.error(`[MasterDataCollectionsStore] Failed to save ${key}`, error);
          onError();
          return EMPTY;
        }),
      )
      .subscribe();
  }

  private patchState<K extends CollectionKey>(key: K, items: MasterDataCollectionsState[K]): void {
    this.state.update((current) => ({
      ...current,
      [key]: this.clone(items),
    }));
  }

  private clone<T>(value: T): T {
    if (value === undefined || value === null) {
      return value;
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
