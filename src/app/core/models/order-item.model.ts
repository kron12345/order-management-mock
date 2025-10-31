export interface OrderItemValiditySegment {
  startDate: string; // ISO date (YYYY-MM-DD)
  endDate: string; // ISO date (YYYY-MM-DD)
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
}
