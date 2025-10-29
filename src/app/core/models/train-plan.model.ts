export type TrainPlanStatus =
  | 'not_ordered'
  | 'requested'
  | 'offered'
  | 'confirmed'
  | 'operating'
  | 'canceled';

export type TrainPlanSourceType = 'rollout' | 'ttt' | 'external';

export interface TrainPlanSource {
  type: TrainPlanSourceType;
  name: string;
  templateId?: string;
  systemId?: string;
}

export interface TrainPlanCalendar {
  validFrom: string; // ISO date
  validTo?: string; // ISO date
  daysBitmap: string;
}

export interface TrainPlanStop {
  id: string;
  sequence: number;
  type: 'origin' | 'intermediate' | 'destination';
  locationCode: string;
  locationName: string;
  countryCode?: string;
  arrivalTime?: string; // PLA
  departureTime?: string; // PLD
  arrivalOffsetDays?: number;
  departureOffsetDays?: number;
  dwellMinutes?: number;
  activities: string[];
  platform?: string;
  notes?: string;
}

export interface TrainPlanTechnicalData {
  trainType: string;
  maxSpeed?: number;
  weightTons?: number;
  lengthMeters?: number;
  traction?: string;
}

export interface TrainPlan {
  id: string;
  title: string;
  trainNumber: string;
  pathRequestId: string;
  pathId?: string;
  caseReferenceId?: string;
  status: TrainPlanStatus;
  responsibleRu: string;
  calendar: TrainPlanCalendar;
  stops: TrainPlanStop[];
  technical: TrainPlanTechnicalData;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  source: TrainPlanSource;
  linkedOrderItemId?: string;
  notes?: string;
}
