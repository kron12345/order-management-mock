import { TrainPlanCalendar } from './train-plan.model';

export type TimetablePhase =
  | 'bedarf'
  | 'path_request'
  | 'offer'
  | 'contract'
  | 'operational'
  | 'archived';

export type TimetableSourceType =
  | 'ttt_path_request'
  | 'framework_agreement'
  | 'manual'
  | 'imported';

export type TimetableMilestoneStatus =
  | 'open'
  | 'in_progress'
  | 'completed'
  | 'blocked';

export interface TimetableSourceInfo {
  type: TimetableSourceType;
  pathRequestId?: string;
  frameworkAgreementId?: string;
  externalSystem?: string;
  lastMessage?: string;
  referenceDocumentId?: string;
}

export interface TimetableMilestone {
  id: string;
  label: string;
  status: TimetableMilestoneStatus;
  dueDate?: string;
  completedAt?: string;
  relatedProcess?: 'anmeldung' | 'offer' | 'contract' | 'operation';
  notes?: string;
}

export interface TimetableStopTiming {
  arrivalTime?: string;
  departureTime?: string;
  arrivalOffsetDays?: number;
  departureOffsetDays?: number;
  dwellMinutes?: number;
  remarks?: string;
}

export interface TimetableStop {
  id: string;
  sequence: number;
  type: 'origin' | 'intermediate' | 'destination';
  locationCode: string;
  locationName: string;
  countryCode?: string;
  activities: string[];
  platform?: string;
  commercial: TimetableStopTiming;
  operational: TimetableStopTiming;
  notes?: string;
}

export interface Timetable {
  refTrainId: string;
  opn: string;
  title: string;
  trainNumber: string;
  responsibleRu: string;
  calendar: TrainPlanCalendar;
  status: TimetablePhase;
  source: TimetableSourceInfo;
  milestones: TimetableMilestone[];
  stops: TimetableStop[];
  createdAt: string;
  updatedAt: string;
  linkedOrderItemId?: string;
  notes?: string;
}
