import { Injectable, computed, inject } from '@angular/core';
import { PlanningDataService } from '../planning/planning-data.service';
import { PlanningStageId } from '../planning/planning-stage.model';
import { Resource } from '../../models/resource';
import {
  Personnel,
  PersonnelService,
  TemporalValue,
  Vehicle,
  VehicleService,
} from '../../models/master-data';
import { MasterDataCollectionsStoreService } from './master-data-collections.store';

type ManagedResourceKind = 'personnel' | 'personnel-service' | 'vehicle' | 'vehicle-service';

@Injectable({ providedIn: 'root' })
export class MasterDataResourceStoreService {
  private static readonly MANAGED_KINDS: ManagedResourceKind[] = [
    'personnel',
    'personnel-service',
    'vehicle',
    'vehicle-service',
  ];

  private readonly planning = inject(PlanningDataService);
  private readonly collections = inject(MasterDataCollectionsStoreService);
  private readonly stageId: PlanningStageId = 'base';
  private readonly resourcesSignal = this.planning.stageResources(this.stageId);

  readonly personnelServices = computed<PersonnelService[]>(() =>
    this.resourcesOfKind('personnel-service').map((resource) => this.resourceToPersonnelService(resource)),
  );

  readonly personnel = computed<Personnel[]>(() =>
    this.resourcesOfKind('personnel').map((resource) => this.resourceToPersonnel(resource)),
  );

  readonly vehicleServices = computed<VehicleService[]>(() =>
    this.resourcesOfKind('vehicle-service').map((resource) => this.resourceToVehicleService(resource)),
  );

  readonly vehicles = computed<Vehicle[]>(() =>
    this.resourcesOfKind('vehicle').map((resource) => this.resourceToVehicle(resource)),
  );

  syncPersonnelServices(services: PersonnelService[]): void {
    this.persistResources(
      'personnel-service',
      services.map((service) => this.personnelServiceToResource(service)),
    );
  }

  syncPersonnel(personnel: Personnel[]): void {
    this.persistResources(
      'personnel',
      personnel.map((person) => this.personnelToResource(person)),
    );
  }

  syncVehicleServices(services: VehicleService[]): void {
    this.persistResources(
      'vehicle-service',
      services.map((service) => this.vehicleServiceToResource(service)),
    );
  }

  syncVehicles(vehicles: Vehicle[]): void {
    this.persistResources(
      'vehicle',
      vehicles.map((vehicle) => this.vehicleToResource(vehicle)),
    );
  }

  private resourcesOfKind(kind: ManagedResourceKind): Resource[] {
    return this.resourcesSignal()
      .filter((resource) => resource.kind === kind)
      .map((resource) => ({
        ...resource,
        attributes: this.clone(resource.attributes ?? {}),
      }));
  }

  private persistResources(kind: ManagedResourceKind, resources: Resource[]): void {
    const sanitized = resources.map((resource) => ({
      ...resource,
      id: resource.id,
      name: resource.name?.trim().length ? resource.name : resource.id,
      attributes: this.clone(resource.attributes ?? {}),
    }));

    this.planning.updateStageData(this.stageId, (stage) => {
      const retained = stage.resources.filter(
        (resource) => !(resource.kind === kind && MasterDataResourceStoreService.MANAGED_KINDS.includes(resource.kind as ManagedResourceKind)),
      );
      return {
        ...stage,
        resources: [...retained, ...sanitized],
      };
    });
  }

  private resourceToPersonnel(resource: Resource): Personnel {
    const attributes = this.clone(resource.attributes ?? {}) as Partial<Personnel>;
    const normalized: Personnel = {
      ...attributes,
      id: resource.id,
      firstName: attributes.firstName ?? this.extractFirstToken(resource.name),
      lastName: attributes.lastName ?? this.extractLastToken(resource.name),
      serviceIds: attributes.serviceIds ?? [],
      qualifications: attributes.qualifications ?? [],
    };
    return this.clone(normalized);
  }

  private personnelToResource(person: Personnel): Resource {
    const normalized = this.normalizeEntity(person, 'personnel') as Personnel;
    const payload: Personnel = {
      ...normalized,
      serviceIds: normalized.serviceIds ?? [],
      qualifications: normalized.qualifications ?? [],
    };
    const poolName = this.resolvePoolName('personnel', payload.poolId);
    return {
      id: payload.id,
      name: this.formatPersonnelName(payload),
      kind: 'personnel',
      attributes: this.toAttributes({
        ...payload,
        ...(poolName ? { poolName } : {}),
      }),
    };
  }

  private resourceToPersonnelService(resource: Resource): PersonnelService {
    const attributes = this.clone(resource.attributes ?? {}) as Partial<PersonnelService>;
    const normalized: PersonnelService = {
      ...attributes,
      id: resource.id,
      name: attributes.name ?? resource.name ?? resource.id,
      requiredQualifications: attributes.requiredQualifications ?? [],
    };
    return this.clone(normalized);
  }

  private personnelServiceToResource(service: PersonnelService): Resource {
    const normalized = this.normalizeEntity(service, 'personnelService') as PersonnelService;
    const payload: PersonnelService = {
      ...normalized,
      requiredQualifications: normalized.requiredQualifications ?? [],
    };
    const poolName = this.resolvePoolName('personnel-service', payload.poolId);
    return {
      id: payload.id,
      name: payload.name?.trim().length ? payload.name : payload.id,
      kind: 'personnel-service',
      attributes: this.toAttributes({
        ...payload,
        ...(poolName ? { poolName } : {}),
      }),
    };
  }

  private resourceToVehicleService(resource: Resource): VehicleService {
    const attributes = this.clone(resource.attributes ?? {}) as Partial<VehicleService>;
    const normalized: VehicleService = {
      ...attributes,
      id: resource.id,
      name: attributes.name ?? resource.name ?? resource.id,
      requiredVehicleTypeIds: attributes.requiredVehicleTypeIds ?? [],
    };
    return this.clone(normalized);
  }

  private vehicleServiceToResource(service: VehicleService): Resource {
    const normalized = this.normalizeEntity(service, 'vehicleService') as VehicleService;
    const payload: VehicleService = {
      ...normalized,
      requiredVehicleTypeIds: normalized.requiredVehicleTypeIds ?? [],
    };
    const poolName = this.resolvePoolName('vehicle-service', payload.poolId);
    return {
      id: payload.id,
      name: payload.name?.trim().length ? payload.name : payload.id,
      kind: 'vehicle-service',
      attributes: this.toAttributes({
        ...payload,
        ...(poolName ? { poolName } : {}),
      }),
    };
  }

  private resourceToVehicle(resource: Resource): Vehicle {
    const attributes = this.clone(resource.attributes ?? {}) as Partial<Vehicle>;
    const normalized: Vehicle = {
      ...attributes,
      id: resource.id,
      typeId: attributes.typeId ?? '',
      vehicleNumber: attributes.vehicleNumber ?? resource.name ?? resource.id,
      serviceIds: attributes.serviceIds ?? [],
    };
    return this.clone(normalized);
  }

  private vehicleToResource(vehicle: Vehicle): Resource {
    const normalized = this.normalizeEntity(vehicle, 'vehicle') as Vehicle;
    const payload: Vehicle = {
      ...normalized,
      serviceIds: normalized.serviceIds ?? [],
      typeId: normalized.typeId ?? '',
    };
    const displayName = payload.vehicleNumber?.trim().length
      ? payload.vehicleNumber
      : payload.id;
    const poolName = this.resolvePoolName('vehicle', payload.poolId);
    return {
      id: payload.id,
      name: displayName,
      kind: 'vehicle',
      attributes: this.toAttributes({
        ...payload,
        ...(poolName ? { poolName } : {}),
      }),
    };
  }

  private normalizeEntity<T extends { id?: string }>(entity: T, prefix: string): T & { id: string } {
    const clone = this.clone(entity);
    const id =
      clone.id && String(clone.id).trim().length > 0
        ? String(clone.id).trim()
        : this.generateId(prefix);
    return {
      ...clone,
      id,
    };
  }

  private formatPersonnelName(person: Personnel): string {
    const preferred = this.resolveTemporalValue(person.preferredName);
    const first = this.resolveTemporalValue(person.firstName);
    const last = typeof person.lastName === 'string' ? person.lastName : '';
    if (preferred) {
      const fallback = [first, last].filter(Boolean).join(' ').trim();
      return fallback ? `${preferred} (${fallback})` : preferred;
    }
    const display = [first, last].filter(Boolean).join(' ').trim();
    return display || person.id;
  }

  private resolveTemporalValue(value: string | TemporalValue<string>[] | undefined): string {
    if (Array.isArray(value)) {
      return value[0]?.value ?? '';
    }
    return value ?? '';
  }

  private extractFirstToken(name?: string): string {
    if (!name) {
      return '';
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return '';
    }
    return trimmed.split(/\s+/)[0];
  }

  private extractLastToken(name?: string): string {
    if (!name) {
      return '';
    }
    const parts = name.trim().split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }

  private generateId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private clone<T>(value: T): T {
    if (value === undefined || value === null) {
      return value;
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private toAttributes(value: unknown): Record<string, unknown> {
    if (value === undefined || value === null) {
      return {};
    }
    return this.clone(value) as Record<string, unknown>;
  }

  private resolvePoolName(kind: ManagedResourceKind, poolId?: string): string | undefined {
    if (!poolId) {
      return undefined;
    }
    const source = this.poolListForKind(kind);
    const match = source.find((pool) => pool.id === poolId);
    return match?.name;
  }

  private poolListForKind(kind: ManagedResourceKind): Array<{ id: string; name: string }> {
    switch (kind) {
      case 'personnel':
        return this.collections.personnelPools();
      case 'personnel-service':
        return this.collections.personnelServicePools();
      case 'vehicle':
        return this.collections.vehiclePools();
      case 'vehicle-service':
        return this.collections.vehicleServicePools();
      default:
        return [];
    }
  }
}
