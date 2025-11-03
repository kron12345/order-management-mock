import { TimetablePhase } from './timetable.model';

export interface OrderItemValiditySegment {
  startDate: string; // ISO date (YYYY-MM-DD)
  endDate: string; // ISO date (YYYY-MM-DD)
}

export interface OrderItemTimetableSnapshotStop {
  sequence: number;
  locationName: string;
  arrivalTime?: string;
  departureTime?: string;
}

export interface OrderItemTimetableSnapshot {
  refTrainId: string;
  title: string;
  trainNumber: string;
  calendar: {
    validFrom: string;
    validTo?: string;
    daysBitmap: string;
  };
  stops: OrderItemTimetableSnapshotStop[];
}

export interface OrderItem {
  id: string;
  name: string;
  type: 'Leistung' | 'Fahrplan';
  start?: string; // ISO
  end?: string; // ISO
  responsible?: string;
  deviation?: string;
  linkedBusinessIds?: string[];
  linkedTemplateId?: string;
  linkedTrainPlanId?: string;
  trafficPeriodId?: string;
  serviceType?: string;
  fromLocation?: string;
  toLocation?: string;
  validity?: OrderItemValiditySegment[];
  parentItemId?: string;
  childItemIds?: string[];
  versionPath?: number[];
  generatedTimetableRefId?: string;
  timetablePhase?: TimetablePhase;
  originalTimetable?: OrderItemTimetableSnapshot;
}
