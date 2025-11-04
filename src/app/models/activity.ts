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
  title: string;
  start: string; // ISO
  end: string; // ISO
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
  meta?: Record<string, unknown>;
}
