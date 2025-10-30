import { Resource } from './resource';

export type ActivityType =
  | 'service'
  | 'service-start'
  | 'service-end'
  | 'break'
  | 'travel'
  | 'transfer'
  | 'other';

export type ServiceRole = 'start' | 'segment' | 'end';

export interface Activity {
  id: string;
  resourceId: Resource['id'];
  title: string;
  start: string; // ISO
  end: string; // ISO
  type?: ActivityType;
  from?: string | null;
  to?: string | null;
  serviceId?: string | null;
  serviceRole?: ServiceRole | null;
  meta?: Record<string, unknown>;
}
