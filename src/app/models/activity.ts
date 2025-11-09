import { Resource } from './resource';

export type ActivityType = string;

export type ServiceRole = 'start' | 'segment' | 'end';

export interface Activity {
  id: string;
  resourceId: Resource['id'];
  /**
   * Additional resources that share this activity. Always includes `resourceId` when present.
   */
  participantResourceIds?: Resource['id'][];
  /** Identifier of the owning client/tenant to keep multiple frontends in sync. */
  clientId?: string | null;
  title: string;
  start: string; // ISO
  end?: string | null; // ISO
  type?: ActivityType;
  from?: string | null;
  to?: string | null;
  remark?: string | null;
  serviceId?: string | null;
  /**
   * References the service definition in master data (e.g. PS-001) that this activity belongs to.
   */
  serviceTemplateId?: string | null;
  /**
   * Normalized service date (YYYYMMDD) to ensure uniqueness per calendar day.
   */
  serviceDate?: string | null;
  /**
   * Distinguishes whether the service template is personnel- or vehicle-based.
   */
  serviceCategory?: 'personnel-service' | 'vehicle-service';
  serviceRole?: ServiceRole | null;
  /** Physical location identifier to detect spatial conflicts. */
  locationId?: string | null;
  locationLabel?: string | null;
  /** Capacity buckets (e.g. same track or maintenance slot). */
  capacityGroupId?: string | null;
  /** Required qualifications for the activity; used for validations. */
  requiredQualifications?: string[];
  /** Qualifications currently covered by assigned participants. */
  assignedQualifications?: string[];
  /** Rule tags for working-time validations (e.g. night shift, rest). */
  workRuleTags?: string[];
  /**
   * Arbitrary extension attributes stored without schema changes.
   * Preferred over the legacy `meta` bag.
   */
  attributes?: Record<string, unknown>;
  /** @deprecated Use `attributes` instead. */
  meta?: Record<string, unknown>;
}
