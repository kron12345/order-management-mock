import { PlanningStoreService } from './planning-store.service';
import {
  OperationalPoint,
  SectionOfLine,
  PersonnelSite,
  ReplacementStop,
  ReplacementRoute,
  ReplacementEdge,
  OpReplacementStopLink,
  TransferEdge,
} from './planning-types';

const uid = () => crypto.randomUUID();

export function loadMockData(store: PlanningStoreService): void {
  store.clear();

  const opA: OperationalPoint = {
    opId: uid(),
    uniqueOpId: 'DE12345',
    countryCode: 'DE',
    name: 'Berlin Hbf',
    opType: 'STATION',
    position: { lat: 52.525, lng: 13.369 },
    createdAt: new Date().toISOString(),
  };

  const opB: OperationalPoint = {
    opId: uid(),
    uniqueOpId: 'DE67890',
    countryCode: 'DE',
    name: 'Berlin Gesundbrunnen',
    opType: 'JUNCTION',
    position: { lat: 52.548, lng: 13.388 },
    createdAt: new Date().toISOString(),
  };

  const section: SectionOfLine = {
    solId: uid(),
    startUniqueOpId: opA.uniqueOpId,
    endUniqueOpId: opB.uniqueOpId,
    lengthKm: 5.2,
    nature: 'REGULAR',
    polyline: [
      { lat: opA.position.lat, lng: opA.position.lng },
      { lat: 52.535, lng: 13.38 },
      { lat: opB.position.lat, lng: opB.position.lng },
    ],
  };

  const site: PersonnelSite = {
    siteId: uid(),
    siteType: 'MELDESTELLE',
    name: 'Crew Center Hbf',
    uniqueOpId: opA.uniqueOpId,
    position: { lat: 52.524, lng: 13.367 },
  };

  const replStopA: ReplacementStop = {
    replacementStopId: uid(),
    name: 'SEV Washingtonplatz',
    stopCode: 'SEV-HBF',
    position: { lat: 52.526, lng: 13.368 },
    nearestUniqueOpId: opA.uniqueOpId,
  };

  const replStopB: ReplacementStop = {
    replacementStopId: uid(),
    name: 'SEV Gesundbrunnen',
    stopCode: 'SEV-GB',
    position: { lat: 52.5485, lng: 13.389 },
    nearestUniqueOpId: opB.uniqueOpId,
  };

  const replRoute: ReplacementRoute = {
    replacementRouteId: uid(),
    name: 'SEV Hbf - Gesundbrunnen',
    operator: 'DemoBus GmbH',
  };

  const replEdge: ReplacementEdge = {
    replacementEdgeId: uid(),
    replacementRouteId: replRoute.replacementRouteId,
    fromStopId: replStopA.replacementStopId,
    toStopId: replStopB.replacementStopId,
    seq: 1,
    avgDurationSec: 900,
    distanceM: 4800,
  };

  const opLink: OpReplacementStopLink = {
    linkId: uid(),
    uniqueOpId: opA.uniqueOpId,
    replacementStopId: replStopA.replacementStopId,
    relationType: 'PRIMARY_SEV_STOP',
    walkingTimeSec: 180,
    distanceM: 150,
  };

  const transferEdge: TransferEdge = {
    transferId: uid(),
    from: { kind: 'OP', uniqueOpId: opA.uniqueOpId },
    to: { kind: 'PERSONNEL_SITE', siteId: site.siteId },
    mode: 'WALK',
    avgDurationSec: 120,
    distanceM: 110,
    bidirectional: true,
  };

  store.addOperationalPoint(opA);
  store.addOperationalPoint(opB);
  store.addSectionOfLine(section);
  store.addPersonnelSite(site);
  store.addReplacementStop(replStopA);
  store.addReplacementStop(replStopB);
  store.addReplacementRoute(replRoute);
  store.addReplacementEdge(replEdge);
  store.addOpReplacementStopLink(opLink);
  store.addTransferEdge(transferEdge);
}

