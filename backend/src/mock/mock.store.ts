import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';

export type PlanningStageId = 'base' | 'operations';

export interface TimelineActivityResourceAssignmentDto {
  resourceId: string;
  resourceType: 'personnel' | 'vehicle' | 'personnel-service' | 'vehicle-service';
  role?: string | null;
  lineIndex?: number | null;
}

export interface TimelineActivityDto {
  id: string;
  stage: PlanningStageId;
  type: string;
  start: string;
  end?: string | null;
  isOpenEnded: boolean;
  status?: string | null;
  serviceRole?: 'start' | 'segment' | 'end' | null;
  from?: string | null;
  to?: string | null;
  remark?: string | null;
  label?: string | null;
  serviceId?: string | null;
  resourceAssignments: TimelineActivityResourceAssignmentDto[];
  attributes?: Record<string, unknown> | null;
  version?: number | null;
}

export interface TimelineResponseDto {
  lod: 'activity' | 'service';
  activities?: TimelineActivityDto[];
  services?: unknown[];
}

export interface TemplatePeriod {
  id: string;
  validFrom: string;
  validTo: string | null;
}

export interface TemplateSetDto {
  id: string;
  name: string;
  description?: string | null;
  tableName?: string;
  createdAt: string;
  updatedAt: string;
  periods?: TemplatePeriod[];
  specialDays?: string[];
  attributes?: Record<string, unknown>;
}

export interface ResourceSnapshotDto {
  personnel: unknown[];
  personnelServices: unknown[];
  personnelServicePools: unknown[];
  personnelPools: unknown[];
  vehicles: unknown[];
  vehicleServices: unknown[];
  vehicleServicePools: unknown[];
  vehiclePools: unknown[];
  vehicleTypes: unknown[];
  vehicleCompositions: unknown[];
}

@Injectable()
export class MockStore {
  private resourceSnapshot: ResourceSnapshotDto = {
    personnel: [],
    personnelServices: [],
    personnelServicePools: [],
    personnelPools: [],
    vehicles: [],
    vehicleServices: [],
    vehicleServicePools: [],
    vehiclePools: [],
    vehicleTypes: [],
    vehicleCompositions: [],
  };

  private templates = new Map<string, { meta: TemplateSetDto; activities: TimelineActivityDto[] }>();
  private stageActivities: Record<PlanningStageId, TimelineActivityDto[]> = {
    base: [],
    operations: [],
  };

  getSnapshot(): ResourceSnapshotDto {
    return this.clone(this.resourceSnapshot);
  }

  setSnapshot(snapshot: ResourceSnapshotDto): ResourceSnapshotDto {
    this.resourceSnapshot = this.clone(snapshot);
    return this.getSnapshot();
  }

  listTemplates(): TemplateSetDto[] {
    return Array.from(this.templates.values()).map((entry) => this.clone(entry.meta));
  }

  getTemplate(id: string): TemplateSetDto | null {
    const existing = this.templates.get(id);
    return existing ? this.clone(existing.meta) : null;
  }

  upsertTemplate(template: TemplateSetDto): TemplateSetDto {
    const now = new Date().toISOString();
    const current = this.templates.get(template.id);
    const meta: TemplateSetDto = {
      ...template,
      createdAt: current?.meta.createdAt ?? now,
      updatedAt: now,
    };
    this.templates.set(template.id, {
      meta,
      activities: current?.activities ?? [],
    });
    return this.clone(meta);
  }

  ensureTemplate(id: string): TemplateSetDto {
    const existing = this.getTemplate(id);
    if (existing) {
      return existing;
    }
    const now = new Date().toISOString();
    const meta: TemplateSetDto = {
      id,
      name: id,
      description: null,
      tableName: id,
      createdAt: now,
      updatedAt: now,
      periods: [],
      specialDays: [],
      attributes: {},
    };
    this.templates.set(id, { meta, activities: [] });
    return meta;
  }

  templateActivities(templateId: string): TimelineActivityDto[] {
    const tpl = this.templates.get(templateId);
    return tpl ? this.clone(tpl.activities) : [];
  }

  upsertTemplateActivity(templateId: string, activity: TimelineActivityDto): TimelineActivityDto {
    this.ensureTemplate(templateId);
    const tpl = this.templates.get(templateId)!;
    const normalized = {
      ...activity,
      id: activity.id?.trim().length ? activity.id : uuid(),
      stage: 'base' as const,
      resourceAssignments: activity.resourceAssignments ?? [],
      isOpenEnded: activity.isOpenEnded ?? false,
    };
    const filtered = tpl.activities.filter((entry) => entry.id !== normalized.id);
    tpl.activities = [...filtered, normalized];
    tpl.meta.updatedAt = new Date().toISOString();
    this.templates.set(templateId, tpl);
    return this.clone(normalized);
  }

  deleteTemplateActivity(templateId: string, activityId: string): void {
    const tpl = this.templates.get(templateId);
    if (!tpl) {
      return;
    }
    tpl.activities = tpl.activities.filter((entry) => entry.id !== activityId);
    tpl.meta.updatedAt = new Date().toISOString();
    this.templates.set(templateId, tpl);
  }

  timeline(stage: PlanningStageId): TimelineResponseDto {
    const list = this.stageActivities[stage] ?? [];
    return { lod: 'activity', activities: this.clone(list) };
  }

  setTimeline(stage: PlanningStageId, activities: TimelineActivityDto[]): void {
    this.stageActivities[stage] = this.clone(activities);
  }

  private clone<T>(value: T): T {
    return value === undefined || value === null ? value : (JSON.parse(JSON.stringify(value)) as T);
  }
}
