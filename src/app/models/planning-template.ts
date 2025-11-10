export interface PlanWeekTemplate {
  id: string;
  label: string;
  description?: string;
  /** ISO-Date on which the reference week starts (typically a Monday). */
  baseWeekStartIso: string;
  /** Optional tag to differentiate multiple variants (z. B. Ferienfahrplan). */
  variant?: string;
  services: PlanWeekServiceDefinition[];
  createdAtIso: string;
  updatedAtIso: string;
  version: string;
}

export interface PlanWeekServiceDefinition {
  id: string;
  templateId: string;
  label: string;
  description?: string;
  /** Resource placeholder such as vehicle-service or personnel-service. */
  resourceKind: 'vehicle-service' | 'personnel-service';
  /** Offset in minutes relative to `baseWeekStartIso`. */
  startOffsetMinutes: number;
  endOffsetMinutes: number;
  attributes?: Record<string, unknown>;
}

export interface PlanWeekValidity {
  id: string;
  templateId: string;
  /** Inclusive ISO date of the first week this template covers. */
  validFromIso: string;
  /** Inclusive ISO date of the last week (typically the Sunday). */
  validToIso: string;
  /** Optional list of week numbers explicitly included/excluded. */
  includeWeekNumbers?: number[];
  excludeWeekNumbers?: number[];
  /** Whether rollout has been completed for this validity interval. */
  status: 'draft' | 'approved' | 'rolled-out';
}

export interface WeekInstance {
  id: string;
  templateId: string;
  /** Start date (ISO) of the individual calendar week. */
  weekStartIso: string;
  /** Copy of the template version used when creating the instance. */
  templateVersion: string;
  services: ScheduledService[];
  assignments: ServiceAssignment[];
  status: 'planned' | 'released' | 'in-progress' | 'archived';
}

export interface ScheduledService {
  id: string;
  instanceId: string;
  templateServiceId: string;
  startIso: string;
  endIso: string;
  attributes?: Record<string, unknown>;
}

export interface ServiceAssignment {
  id: string;
  scheduledServiceId: string;
  /** Real resource IDs from the operations/dispatch pool. */
  resourceId: string;
  resourceKind: 'vehicle' | 'personnel';
  assignedAtIso: string;
  assignedBy?: string;
}

export interface PlanWeekRolloutRequest {
  templateId: string;
  version: string;
  /** Inclusive ISO date (Monday) of the first week to roll out. */
  weekStartIso: string;
  /** Number of consecutive weeks to generate. */
  weekCount: number;
  /** Optional list of ISO week codes to skip. */
  skipWeekCodes?: string[];
}

export interface PlanWeekRolloutResponse {
  createdInstances: WeekInstanceSummary[];
}

export interface WeekInstanceSummary {
  id: string;
  weekStartIso: string;
  status: WeekInstance['status'];
}
