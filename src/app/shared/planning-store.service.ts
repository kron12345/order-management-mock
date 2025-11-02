import { Injectable, Signal, computed, signal } from '@angular/core';
import {
  OperationalPoint,
  SectionOfLine,
  PersonnelSite,
  ReplacementStop,
  ReplacementRoute,
  ReplacementEdge,
  OpReplacementStopLink,
  TransferEdge,
  TransferNode,
  PlanningEntitySignals,
} from './planning-types';

const nowIso = () => new Date().toISOString();

@Injectable({
  providedIn: 'root',
})
export class PlanningStoreService {
  private readonly entities: PlanningEntitySignals = {
    operationalPoints: signal<OperationalPoint[]>([]),
    sectionsOfLine: signal<SectionOfLine[]>([]),
    personnelSites: signal<PersonnelSite[]>([]),
    replacementStops: signal<ReplacementStop[]>([]),
    replacementRoutes: signal<ReplacementRoute[]>([]),
    replacementEdges: signal<ReplacementEdge[]>([]),
    opReplacementStopLinks: signal<OpReplacementStopLink[]>([]),
    transferEdges: signal<TransferEdge[]>([]),
  };

  readonly operationalPoints = this.entities.operationalPoints.asReadonly();
  readonly sectionsOfLine = this.entities.sectionsOfLine.asReadonly();
  readonly personnelSites = this.entities.personnelSites.asReadonly();
  readonly replacementStops = this.entities.replacementStops.asReadonly();
  readonly replacementRoutes = this.entities.replacementRoutes.asReadonly();
  readonly replacementEdges = this.entities.replacementEdges.asReadonly();
  readonly opReplacementStopLinks = this.entities.opReplacementStopLinks.asReadonly();
  readonly transferEdges = this.entities.transferEdges.asReadonly();

  readonly operationalPointMap: Signal<Map<string, OperationalPoint>> = computed(() => {
    return new Map(this.operationalPoints().map((op) => [op.uniqueOpId, op]));
  });

  readonly replacementStopMap: Signal<Map<string, ReplacementStop>> = computed(() => {
    return new Map(this.replacementStops().map((stop) => [stop.replacementStopId, stop]));
  });

  addOperationalPoint(op: OperationalPoint): void {
    this.assertUniqueOpId(op.uniqueOpId, op.opId);
    this.entities.operationalPoints.update((list) => [
      ...list,
      this.withAudit(op, true),
    ]);
  }

  updateOperationalPoint(opId: string, patch: Partial<OperationalPoint>): void {
    this.entities.operationalPoints.update((list) =>
      list.map((item) => {
        if (item.opId !== opId) {
          return item;
        }
        if (patch.uniqueOpId && patch.uniqueOpId !== item.uniqueOpId) {
          this.assertUniqueOpId(patch.uniqueOpId, opId);
          this.relinkUniqueOpId(item.uniqueOpId, patch.uniqueOpId);
        }
        return this.withAudit({ ...item, ...patch, opId }, false);
      }),
    );
  }

  removeOperationalPoint(opId: string): void {
    const op = this.entities.operationalPoints().find((item) => item.opId === opId);
    if (!op) {
      return;
    }
    const uniqueId = op.uniqueOpId;
    this.entities.operationalPoints.update((list) => list.filter((item) => item.opId !== opId));
    this.entities.sectionsOfLine.update((list) =>
      list.filter(
        (sol) => sol.startUniqueOpId !== uniqueId && sol.endUniqueOpId !== uniqueId,
      ),
    );
    this.entities.personnelSites.update((list) =>
      list.map((site) =>
        site.uniqueOpId === uniqueId ? { ...site, uniqueOpId: undefined } : site,
      ),
    );
    this.entities.replacementStops.update((list) =>
      list.map((stop) =>
        stop.nearestUniqueOpId === uniqueId ? { ...stop, nearestUniqueOpId: undefined } : stop,
      ),
    );
    this.entities.opReplacementStopLinks.update((list) =>
      list.filter((link) => link.uniqueOpId !== uniqueId),
    );
    this.entities.transferEdges.update((list) =>
      list.filter((edge) => !this.transferNodeMatches(edge.from, { kind: 'OP', uniqueOpId: uniqueId })
        && !this.transferNodeMatches(edge.to, { kind: 'OP', uniqueOpId: uniqueId })),
    );
  }

  addSectionOfLine(sol: SectionOfLine): void {
    this.ensureOperationalPointExists(sol.startUniqueOpId);
    this.ensureOperationalPointExists(sol.endUniqueOpId);
    if (sol.startUniqueOpId === sol.endUniqueOpId) {
      throw new Error('Section of line cannot start and end at the same operational point.');
    }
    this.entities.sectionsOfLine.update((list) => [...list, this.withAudit(sol, true)]);
  }

  updateSectionOfLine(solId: string, patch: Partial<SectionOfLine>): void {
    this.entities.sectionsOfLine.update((list) =>
      list.map((item) => {
        if (item.solId !== solId) {
          return item;
        }
        const merged = { ...item, ...patch, solId };
        if (merged.startUniqueOpId === merged.endUniqueOpId) {
          throw new Error('Section of line cannot form a loop.');
        }
        this.ensureOperationalPointExists(merged.startUniqueOpId);
        this.ensureOperationalPointExists(merged.endUniqueOpId);
        return this.withAudit(merged, false);
      }),
    );
  }

  removeSectionOfLine(solId: string): void {
    this.entities.sectionsOfLine.update((list) => list.filter((item) => item.solId !== solId));
  }

  addPersonnelSite(site: PersonnelSite): void {
    if (site.uniqueOpId) {
      this.ensureOperationalPointExists(site.uniqueOpId);
    }
    this.entities.personnelSites.update((list) => [...list, this.withAudit(site, true)]);
  }

  updatePersonnelSite(siteId: string, patch: Partial<PersonnelSite>): void {
    this.entities.personnelSites.update((list) =>
      list.map((item) => {
        if (item.siteId !== siteId) {
          return item;
        }
        const merged = { ...item, ...patch, siteId };
        if (merged.uniqueOpId) {
          this.ensureOperationalPointExists(merged.uniqueOpId);
        }
        return this.withAudit(merged, false);
      }),
    );
  }

  removePersonnelSite(siteId: string): void {
    this.entities.personnelSites.update((list) => list.filter((item) => item.siteId !== siteId));
    this.entities.transferEdges.update((list) =>
      list.filter(
        (edge) =>
          !this.transferNodeMatches(edge.from, { kind: 'PERSONNEL_SITE', siteId }) &&
          !this.transferNodeMatches(edge.to, { kind: 'PERSONNEL_SITE', siteId }),
      ),
    );
  }

  addReplacementStop(stop: ReplacementStop): void {
    if (stop.nearestUniqueOpId) {
      this.ensureOperationalPointExists(stop.nearestUniqueOpId);
    }
    this.entities.replacementStops.update((list) => [...list, this.withAudit(stop, true)]);
  }

  updateReplacementStop(stopId: string, patch: Partial<ReplacementStop>): void {
    this.entities.replacementStops.update((list) =>
      list.map((item) => {
        if (item.replacementStopId !== stopId) {
          return item;
        }
        const merged = { ...item, ...patch, replacementStopId: stopId };
        if (merged.nearestUniqueOpId) {
          this.ensureOperationalPointExists(merged.nearestUniqueOpId);
        }
        return this.withAudit(merged, false);
      }),
    );
  }

  removeReplacementStop(stopId: string): void {
    this.entities.replacementStops.update((list) =>
      list.filter((item) => item.replacementStopId !== stopId),
    );
    this.entities.replacementEdges.update((list) =>
      list.filter((edge) => edge.fromStopId !== stopId && edge.toStopId !== stopId),
    );
    this.entities.opReplacementStopLinks.update((list) =>
      list.filter((link) => link.replacementStopId !== stopId),
    );
    this.entities.transferEdges.update((list) =>
      list.filter(
        (edge) =>
          !this.transferNodeMatches(edge.from, { kind: 'REPLACEMENT_STOP', replacementStopId: stopId }) &&
          !this.transferNodeMatches(edge.to, { kind: 'REPLACEMENT_STOP', replacementStopId: stopId }),
      ),
    );
  }

  addReplacementRoute(route: ReplacementRoute): void {
    this.entities.replacementRoutes.update((list) => [...list, this.withAudit(route, true)]);
  }

  updateReplacementRoute(routeId: string, patch: Partial<ReplacementRoute>): void {
    this.entities.replacementRoutes.update((list) =>
      list.map((item) =>
        item.replacementRouteId === routeId
          ? this.withAudit({ ...item, ...patch, replacementRouteId: routeId }, false)
          : item,
      ),
    );
  }

  removeReplacementRoute(routeId: string): void {
    this.entities.replacementRoutes.update((list) =>
      list.filter((item) => item.replacementRouteId !== routeId),
    );
    this.entities.replacementEdges.update((list) =>
      list.filter((edge) => edge.replacementRouteId !== routeId),
    );
  }

  addReplacementEdge(edge: ReplacementEdge): void {
    if (edge.fromStopId === edge.toStopId) {
      throw new Error('Replacement edge cannot connect the same stop.');
    }
    this.ensureReplacementRouteExists(edge.replacementRouteId);
    this.ensureReplacementStopExists(edge.fromStopId);
    this.ensureReplacementStopExists(edge.toStopId);
    this.assertUniqueReplacementEdgeSeq(edge.replacementRouteId, edge.seq, edge.replacementEdgeId);
    this.entities.replacementEdges.update((list) => [...list, this.withAudit(edge, true)]);
  }

  updateReplacementEdge(edgeId: string, patch: Partial<ReplacementEdge>): void {
    this.entities.replacementEdges.update((list) =>
      list.map((item) => {
        if (item.replacementEdgeId !== edgeId) {
          return item;
        }
        const merged = { ...item, ...patch, replacementEdgeId: edgeId };
        if (merged.fromStopId === merged.toStopId) {
          throw new Error('Replacement edge cannot connect the same stop.');
        }
        this.ensureReplacementRouteExists(merged.replacementRouteId);
        this.ensureReplacementStopExists(merged.fromStopId);
        this.ensureReplacementStopExists(merged.toStopId);
        this.assertUniqueReplacementEdgeSeq(
          merged.replacementRouteId,
          merged.seq,
          merged.replacementEdgeId,
        );
        return this.withAudit(merged, false);
      }),
    );
  }

  removeReplacementEdge(edgeId: string): void {
    this.entities.replacementEdges.update((list) =>
      list.filter((item) => item.replacementEdgeId !== edgeId),
    );
  }

  addOpReplacementStopLink(link: OpReplacementStopLink): void {
    this.ensureOperationalPointExists(link.uniqueOpId);
    this.ensureReplacementStopExists(link.replacementStopId);
    this.assertUniqueOpReplacementLink(link.uniqueOpId, link.replacementStopId, link.linkId);
    this.entities.opReplacementStopLinks.update((list) => [...list, this.withAudit(link, true)]);
  }

  updateOpReplacementStopLink(linkId: string, patch: Partial<OpReplacementStopLink>): void {
    this.entities.opReplacementStopLinks.update((list) =>
      list.map((item) => {
        if (item.linkId !== linkId) {
          return item;
        }
        const merged = { ...item, ...patch, linkId };
        this.ensureOperationalPointExists(merged.uniqueOpId);
        this.ensureReplacementStopExists(merged.replacementStopId);
        this.assertUniqueOpReplacementLink(
          merged.uniqueOpId,
          merged.replacementStopId,
          merged.linkId,
        );
        return this.withAudit(merged, false);
      }),
    );
  }

  removeOpReplacementStopLink(linkId: string): void {
    this.entities.opReplacementStopLinks.update((list) =>
      list.filter((item) => item.linkId !== linkId),
    );
  }

  addTransferEdge(edge: TransferEdge): void {
    if (this.transferNodesEqual(edge.from, edge.to)) {
      throw new Error('Transfer edge must connect two different nodes.');
    }
    this.validateTransferNode(edge.from);
    this.validateTransferNode(edge.to);
    this.entities.transferEdges.update((list) => [...list, this.withAudit(edge, true)]);
  }

  updateTransferEdge(transferId: string, patch: Partial<TransferEdge>): void {
    this.entities.transferEdges.update((list) =>
      list.map((item) => {
        if (item.transferId !== transferId) {
          return item;
        }
        const merged = { ...item, ...patch, transferId };
        if (this.transferNodesEqual(merged.from, merged.to)) {
          throw new Error('Transfer edge must connect two different nodes.');
        }
        this.validateTransferNode(merged.from);
        this.validateTransferNode(merged.to);
        return this.withAudit(merged, false);
      }),
    );
  }

  removeTransferEdge(transferId: string): void {
    this.entities.transferEdges.update((list) =>
      list.filter((item) => item.transferId !== transferId),
    );
  }

  clear(): void {
    Object.values(this.entities).forEach((sig) => {
      sig.set([]);
    });
  }

  private ensureOperationalPointExists(uniqueOpId: string): void {
    if (!this.operationalPointMap().has(uniqueOpId)) {
      throw new Error(`Operational point "${uniqueOpId}" not found.`);
    }
  }

  private ensureReplacementStopExists(stopId: string): void {
    if (!this.replacementStopMap().has(stopId)) {
      throw new Error(`Replacement stop "${stopId}" not found.`);
    }
  }

  private ensureReplacementRouteExists(routeId: string): void {
    if (!this.replacementRoutes().some((route) => route.replacementRouteId === routeId)) {
      throw new Error(`Replacement route "${routeId}" not found.`);
    }
  }

  private assertUniqueOpId(uniqueOpId: string, ignoreOpId?: string): void {
    const conflict = this.operationalPoints().find(
      (op) => op.uniqueOpId === uniqueOpId && op.opId !== ignoreOpId,
    );
    if (conflict) {
      throw new Error(`Operational point with uniqueOpId "${uniqueOpId}" already exists.`);
    }
  }

  private assertUniqueReplacementEdgeSeq(
    routeId: string,
    seq: number,
    ignoreEdgeId?: string,
  ): void {
    const conflict = this.replacementEdges().find(
      (edge) =>
        edge.replacementRouteId === routeId &&
        edge.seq === seq &&
        edge.replacementEdgeId !== ignoreEdgeId,
    );
    if (conflict) {
      throw new Error(
        `Sequence ${seq} is already used for replacement route "${routeId}".`,
      );
    }
  }

  private assertUniqueOpReplacementLink(
    uniqueOpId: string,
    replacementStopId: string,
    ignoreLinkId?: string,
  ): void {
    const conflict = this.opReplacementStopLinks().find(
      (link) =>
        link.uniqueOpId === uniqueOpId &&
        link.replacementStopId === replacementStopId &&
        link.linkId !== ignoreLinkId,
    );
    if (conflict) {
      throw new Error(
        `Link between OP "${uniqueOpId}" and replacement stop "${replacementStopId}" already exists.`,
      );
    }
  }

  private transferNodeMatches(node: TransferNode, target: TransferNode): boolean {
    if (node.kind !== target.kind) {
      return false;
    }
    switch (node.kind) {
      case 'OP':
        return node.uniqueOpId === (target as { uniqueOpId: string }).uniqueOpId;
      case 'PERSONNEL_SITE':
        return node.siteId === (target as { siteId: string }).siteId;
      case 'REPLACEMENT_STOP':
        return (
          node.replacementStopId === (target as { replacementStopId: string }).replacementStopId
        );
    }
  }

  private transferNodesEqual(a: TransferNode, b: TransferNode): boolean {
    return this.transferNodeMatches(a, b);
  }

  private validateTransferNode(node: TransferNode): void {
    switch (node.kind) {
      case 'OP':
        this.ensureOperationalPointExists(node.uniqueOpId);
        break;
      case 'PERSONNEL_SITE':
        if (!this.personnelSites().some((site) => site.siteId === node.siteId)) {
          throw new Error(`Personnel site "${node.siteId}" not found.`);
        }
        break;
      case 'REPLACEMENT_STOP':
        this.ensureReplacementStopExists(node.replacementStopId);
        break;
    }
  }

  private relinkUniqueOpId(oldId: string, newId: string): void {
    this.entities.sectionsOfLine.update((list) =>
      list.map((sol) => ({
        ...sol,
        startUniqueOpId: sol.startUniqueOpId === oldId ? newId : sol.startUniqueOpId,
        endUniqueOpId: sol.endUniqueOpId === oldId ? newId : sol.endUniqueOpId,
      })),
    );
    this.entities.personnelSites.update((list) =>
      list.map((site) =>
        site.uniqueOpId === oldId ? { ...site, uniqueOpId: newId } : site,
      ),
    );
    this.entities.replacementStops.update((list) =>
      list.map((stop) =>
        stop.nearestUniqueOpId === oldId ? { ...stop, nearestUniqueOpId: newId } : stop,
      ),
    );
    this.entities.opReplacementStopLinks.update((list) =>
      list.map((link) =>
        link.uniqueOpId === oldId ? { ...link, uniqueOpId: newId } : link,
      ),
    );
    this.entities.transferEdges.update((list) =>
      list.map((edge) => ({
        ...edge,
        from: this.remapTransferNode(edge.from, oldId, newId),
        to: this.remapTransferNode(edge.to, oldId, newId),
      })),
    );
  }

  private remapTransferNode(node: TransferNode, oldId: string, newId: string): TransferNode {
    if (node.kind === 'OP' && node.uniqueOpId === oldId) {
      return { ...node, uniqueOpId: newId };
    }
    return node;
  }

  private withAudit<T extends { createdAt?: string; updatedAt?: string }>(
    entity: T,
    isNew: boolean,
  ): T {
    const timestamp = nowIso();
    return {
      ...entity,
      createdAt: isNew ? entity.createdAt ?? timestamp : entity.createdAt,
      updatedAt: timestamp,
    };
  }
}
