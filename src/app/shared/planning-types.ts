import { WritableSignal } from '@angular/core';

export type UUID = string;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface AuditInfo {
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

export type OpType = 'STATION' | 'JUNCTION' | 'BORDER_POINT' | 'SIDING_AREA';

export interface OperationalPoint extends AuditInfo {
  opId: UUID;
  uniqueOpId: string;
  countryCode: string;
  name: string;
  opType: OpType;
  position: LatLng;
}

export type SolNature = 'REGULAR' | 'LINK';

export interface SectionOfLine extends AuditInfo {
  solId: UUID;
  startUniqueOpId: string;
  endUniqueOpId: string;
  lengthKm?: number;
  nature: SolNature;
  polyline?: LatLng[];
}

export type OpTrackRole = 'RUNNING' | 'SIDING';

export interface OpTrack {
  opTrackId: UUID;
  uniqueOpId: string;
  role: OpTrackRole;
  name?: string;
  polyline?: LatLng[];
}

export type PersonnelSiteType = 'MELDESTELLE' | 'PAUSENRAUM' | 'BEREITSCHAFT' | 'BÜRO';

export interface PersonnelSite extends AuditInfo {
  siteId: UUID;
  siteType: PersonnelSiteType;
  name: string;
  uniqueOpId?: string;
  position: LatLng;
  openingHoursJson?: string;
}

export interface ReplacementStop extends AuditInfo {
  replacementStopId: UUID;
  name: string;
  stopCode?: string;
  position: LatLng;
  nearestUniqueOpId?: string;
}

export interface ReplacementRoute extends AuditInfo {
  replacementRouteId: UUID;
  name: string;
  operator?: string;
}

export interface ReplacementEdge extends AuditInfo {
  replacementEdgeId: UUID;
  replacementRouteId: UUID;
  fromStopId: UUID;
  toStopId: UUID;
  seq: number;
  avgDurationSec?: number;
  distanceM?: number;
  polyline?: LatLng[];
}

export type OpReplRelation = 'PRIMARY_SEV_STOP' | 'ALTERNATIVE' | 'TEMPORARY';

export interface OpReplacementStopLink extends AuditInfo {
  linkId: UUID;
  uniqueOpId: string;
  replacementStopId: UUID;
  relationType: OpReplRelation;
  walkingTimeSec?: number;
  distanceM?: number;
}

export type TransferMode = 'WALK' | 'SHUTTLE' | 'INTERNAL';

export type TransferNode =
  | { kind: 'OP'; uniqueOpId: string }
  | { kind: 'PERSONNEL_SITE'; siteId: UUID }
  | { kind: 'REPLACEMENT_STOP'; replacementStopId: UUID };

export interface TransferEdge extends AuditInfo {
  transferId: UUID;
  from: TransferNode;
  to: TransferNode;
  mode: TransferMode;
  avgDurationSec?: number;
  distanceM?: number;
  bidirectional: boolean;
}

export interface PlanningEntitySignals {
  operationalPoints: WritableSignal<OperationalPoint[]>;
  sectionsOfLine: WritableSignal<SectionOfLine[]>;
  personnelSites: WritableSignal<PersonnelSite[]>;
  replacementStops: WritableSignal<ReplacementStop[]>;
  replacementRoutes: WritableSignal<ReplacementRoute[]>;
  replacementEdges: WritableSignal<ReplacementEdge[]>;
  opReplacementStopLinks: WritableSignal<OpReplacementStopLink[]>;
  transferEdges: WritableSignal<TransferEdge[]>;
}

