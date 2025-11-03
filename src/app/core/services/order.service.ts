import { Injectable, computed, signal } from '@angular/core';
import { Order } from '../models/order.model';
import { OrderItem, OrderItemValiditySegment } from '../models/order-item.model';
import { MOCK_ORDERS } from '../mock/mock-orders.mock';
import { ScheduleTemplate } from '../models/schedule-template.model';
import {
  CreatePlansFromTemplatePayload,
  TrainPlanService,
} from './train-plan.service';
import { TrainPlan, TrainPlanStatus } from '../models/train-plan.model';
import { CreateScheduleTemplateStopPayload } from './schedule-template.service';
import { BusinessStatus } from '../models/business.model';

export interface OrderFilters {
  search: string;
  tag: string | 'all';
  timeRange: 'all' | 'next4h' | 'next12h' | 'today' | 'thisWeek';
  trainStatus: TrainPlanStatus | 'all';
  businessStatus: BusinessStatus | 'all';
  trainNumber: string;
}

export interface OrderItemOption {
  itemId: string;
  orderId: string;
  orderName: string;
  itemName: string;
}

export interface CreateOrderPayload {
  id?: string;
  name: string;
  customer?: string;
  tags?: string[];
  comment?: string;
}

export interface CreateServiceOrderItemPayload {
  orderId: string;
  serviceType: string;
  fromLocation: string;
  toLocation: string;
  start: string; // ISO
  end: string; // ISO
  trafficPeriodId: string;
  responsible?: string;
  deviation?: string;
  name?: string;
}

export interface CreatePlanOrderItemsPayload
  extends CreatePlansFromTemplatePayload {
  orderId: string;
  namePrefix?: string;
  responsible?: string;
}

export interface ImportedRailMlStop extends CreateScheduleTemplateStopPayload {}

export interface ImportedRailMlTrain {
  id: string;
  name: string;
  number: string;
  category?: string;
  start?: string;
  end?: string;
  departureIso: string;
  arrivalIso?: string;
  departureTime?: string;
  arrivalTime?: string;
  stops: ImportedRailMlStop[];
}

export interface CreateManualPlanOrderItemPayload {
  orderId: string;
  template: ScheduleTemplate;
  departure: string; // ISO
  trafficPeriodId: string;
  name?: string;
  responsible?: string;
}

export interface CreateImportedPlanOrderItemPayload {
  orderId: string;
  train: ImportedRailMlTrain;
  trafficPeriodId: string;
  namePrefix?: string;
  responsible?: string;
}

type EditableOrderItemKeys =
  | 'name'
  | 'start'
  | 'end'
  | 'responsible'
  | 'deviation'
  | 'serviceType'
  | 'fromLocation'
  | 'toLocation'
  | 'trafficPeriodId'
  | 'linkedBusinessIds'
  | 'linkedTemplateId'
  | 'linkedTrainPlanId';

export type OrderItemUpdateData = Pick<OrderItem, EditableOrderItemKeys>;

export interface SplitOrderItemPayload {
  orderId: string;
  itemId: string;
  rangeStart: string; // ISO date (YYYY-MM-DD)
  rangeEnd: string; // ISO date (YYYY-MM-DD)
  updates?: Partial<OrderItemUpdateData>;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly _orders = signal<Order[]>(MOCK_ORDERS);
  private readonly _filters = signal<OrderFilters>({
    search: '',
    tag: 'all',
    timeRange: 'all',
    trainStatus: 'all',
    businessStatus: 'all',
    trainNumber: '',
  });

  constructor(private readonly trainPlanService: TrainPlanService) {
    this._orders.set(
      this._orders().map((order) => this.initializeOrder(order)),
    );
  }

  readonly filters = computed(() => this._filters());
  readonly orders = computed(() => this._orders());
  readonly orderItems = computed(() =>
    this._orders().flatMap((order) =>
      order.items.map((item) => ({
        orderId: order.id,
        orderName: order.name,
        item,
      })),
    ),
  );
  readonly orderItemOptions = computed<OrderItemOption[]>(() =>
    this.orderItems().map((entry) => ({
      itemId: entry.item.id,
      orderId: entry.orderId,
      orderName: entry.orderName,
      itemName: entry.item.name,
    })),
  );

  readonly filteredOrders = computed(() => {
    const filters = this._filters();
    const itemFiltersActive =
      filters.timeRange !== 'all' ||
      filters.trainStatus !== 'all' ||
      filters.businessStatus !== 'all' ||
      filters.trainNumber.trim() !== '';

    return this._orders().filter((order) => {
      if (!this.matchesOrder(order, filters)) {
        return false;
      }
      const filteredItems = this.filterItemsForOrder(order);
      if (itemFiltersActive && filteredItems.length === 0) {
        return false;
      }
      return true;
    });
  });

  setFilter(patch: Partial<OrderFilters>) {
    this._filters.update((f) => ({ ...f, ...patch }));
  }

  getOrderById(orderId: string): Order | undefined {
    return this._orders().find((order) => order.id === orderId);
  }

  filterItemsForOrder(order: Order): OrderItem[] {
    const filters = this._filters();
    return order.items.filter((item) => this.matchesItem(item, filters));
  }

  createOrder(payload: CreateOrderPayload): Order {
    const id = payload.id?.trim().length ? payload.id.trim() : this.generateOrderId();
    const order: Order = {
      id,
      name: payload.name,
      customer: payload.customer,
      tags: this.normalizeTags(payload.tags),
      comment: payload.comment,
      items: [],
    };

    this._orders.update((orders) => [order, ...orders]);
    return order;
  }

  addServiceOrderItem(payload: CreateServiceOrderItemPayload): OrderItem {
    const serviceType = payload.serviceType.trim();
    const name =
      payload.name?.trim() && payload.name.trim().length > 0
        ? payload.name.trim()
        : serviceType;

    const item: OrderItem = {
      id: this.generateItemId(payload.orderId),
      name,
      type: 'Leistung',
      serviceType,
      fromLocation: payload.fromLocation,
      toLocation: payload.toLocation,
      start: payload.start,
      end: payload.end,
      trafficPeriodId: payload.trafficPeriodId,
      responsible: payload.responsible,
      deviation: payload.deviation,
    };

    this.appendItems(payload.orderId, [item]);
    return item;
  }

  addPlanOrderItems(payload: CreatePlanOrderItemsPayload) {
    const plans = this.trainPlanService.createPlansFromTemplate({
      templateId: payload.templateId,
      trafficPeriodId: payload.trafficPeriodId,
      startTime: payload.startTime,
      intervalMinutes: payload.intervalMinutes,
      count: payload.count,
      responsibleRu: payload.responsible,
    });

    const items: OrderItem[] = plans.map((plan, index) => {
      const namePrefix = payload.namePrefix?.trim() ?? plan.title;
      const itemName = plans.length > 1 ? `${namePrefix} #${index + 1}` : namePrefix;
      const base: OrderItem = {
        id: this.generateItemId(payload.orderId),
        name: itemName,
        type: 'Fahrplan',
        responsible: plan.responsibleRu,
        linkedTemplateId: payload.templateId,
        linkedTrainPlanId: plan.id,
      } satisfies OrderItem;

      return this.applyPlanDetailsToItem(base, plan);
    });

    this.appendItems(payload.orderId, items);

    items.forEach((item, index) => {
      const plan = plans[index];
      this.trainPlanService.linkOrderItem(plan.id, item.id);
      this.linkTrainPlanToItem(plan.id, item.id);
    });

    return items;
  }

  addManualPlanOrderItem(payload: CreateManualPlanOrderItemPayload): OrderItem {
    const plan = this.trainPlanService.createManualPlan({
      title: payload.template.title,
      trainNumber: payload.template.trainNumber,
      responsibleRu: payload.template.responsibleRu,
      departure: payload.departure,
      stops: payload.template.stops,
      sourceName: payload.template.title,
      notes: payload.template.description,
      templateId: payload.template.id,
      trafficPeriodId: payload.trafficPeriodId,
    });

    const base: OrderItem = {
      id: this.generateItemId(payload.orderId),
      name:
        payload.name?.trim() && payload.name.trim().length
          ? payload.name.trim()
          : payload.template.title,
      type: 'Fahrplan',
      responsible:
        payload.responsible?.trim() || payload.template.responsibleRu,
      linkedTrainPlanId: plan.id,
      linkedTemplateId: payload.template.id,
    } satisfies OrderItem;
    const item = this.applyPlanDetailsToItem(base, plan);

    this.appendItems(payload.orderId, [item]);
    this.trainPlanService.linkOrderItem(plan.id, item.id);
    this.linkTrainPlanToItem(plan.id, item.id);
    return item;
  }

  addImportedPlanOrderItem(payload: CreateImportedPlanOrderItemPayload): OrderItem {
    const departureIso = payload.train.departureIso;
    if (!departureIso) {
      throw new Error(`Zug ${payload.train.name} enthält keine Abfahrtszeit.`);
    }

    const responsible = payload.responsible ?? 'RailML Import';

    const plan = this.trainPlanService.createManualPlan({
      title: payload.train.name,
      trainNumber: payload.train.number,
      responsibleRu: responsible,
      departure: departureIso,
      stops: payload.train.stops,
      sourceName: payload.train.category ?? 'RailML',
      notes: undefined,
      templateId: undefined,
      trafficPeriodId: payload.trafficPeriodId,
    });

    const firstStop = plan.stops[0];
    const lastStop = plan.stops[plan.stops.length - 1];

    const namePrefix = payload.namePrefix?.trim();
    const itemName = namePrefix ? `${namePrefix} ${payload.train.name}` : payload.train.name;
    const base: OrderItem = {
      id: this.generateItemId(payload.orderId),
      name: itemName,
      type: 'Fahrplan',
      responsible,
      linkedTrainPlanId: plan.id,
    } satisfies OrderItem;

    const item = this.applyPlanDetailsToItem(
      {
        ...base,
        fromLocation: firstStop?.locationName ?? payload.train.start,
        toLocation: lastStop?.locationName ?? payload.train.end,
      },
      plan,
    );

    this.appendItems(payload.orderId, [item]);
    this.trainPlanService.linkOrderItem(plan.id, item.id);
    this.linkTrainPlanToItem(plan.id, item.id);
    return item;
  }

  applyPlanModification(payload: {
    orderId: string;
    itemId: string;
    plan: TrainPlan;
  }): void {
    const { orderId, itemId, plan } = payload;

    this._orders.update((orders) =>
      orders.map((order) => {
        if (order.id !== orderId) {
          return order;
        }

        const items = order.items.map((item) => {
          if (item.id !== itemId) {
            return item;
          }

          const base: OrderItem = {
            ...item,
            linkedTrainPlanId: plan.id,
          } satisfies OrderItem;

          return this.applyPlanDetailsToItem(base, plan);
        });

        return { ...order, items } satisfies Order;
      }),
    );

    this.trainPlanService.linkOrderItem(plan.id, itemId);
  }

  splitOrderItem(
    payload: SplitOrderItemPayload,
  ): { created: OrderItem; original: OrderItem } {
    const rangeStart = this.normalizeDateInput(payload.rangeStart);
    const rangeEnd = this.normalizeDateInput(payload.rangeEnd);
    if (!rangeStart || !rangeEnd) {
      throw new Error('Ungültiger Datumsbereich.');
    }
    if (rangeStart > rangeEnd) {
      throw new Error('Das Startdatum darf nicht nach dem Enddatum liegen.');
    }

    type SplitResult = { created: OrderItem; original: OrderItem };
    let result: SplitResult | null = null;

    this._orders.update((orders) =>
      orders.map((order) => {
        if (order.id !== payload.orderId) {
          return order;
        }

        const targetIndex = order.items.findIndex(
          (item) => item.id === payload.itemId,
        );
        if (targetIndex === -1) {
          throw new Error(
            `Auftragsposition ${payload.itemId} wurde im Auftrag ${order.id} nicht gefunden.`,
          );
        }

        const target = this.ensureItemDefaults(order.items[targetIndex]);
        const validity = target.validity ?? [];

        const { retained, extracted } = this.splitSegments(
          validity,
          rangeStart,
          rangeEnd,
        );

        if (!extracted.length) {
          throw new Error(
            'Die ausgewählten Tage überschneiden sich nicht mit der Auftragsposition.',
          );
        }

        const childId = this.generateItemId(order.id);
        const preparedUpdates = this.prepareUpdatePayload(payload.updates);

        const child: OrderItem = this.applyUpdatesToItem(
          {
            ...target,
            id: childId,
            validity: extracted,
            parentItemId: target.id,
            childItemIds: [],
          },
          preparedUpdates,
        );

        if (preparedUpdates.linkedTrainPlanId) {
          const linkedPlan = this.trainPlanService.getById(
            preparedUpdates.linkedTrainPlanId,
          );
          if (linkedPlan) {
            const planStart = this.extractPlanStart(linkedPlan);
            const planEnd = this.extractPlanEnd(linkedPlan);
            if (planStart) {
              child.start = planStart;
            }
            if (planEnd) {
              child.end = planEnd;
            }
          }
        }

        const updatedOriginal: OrderItem = {
          ...target,
          validity: retained,
          childItemIds: [...(target.childItemIds ?? []), childId],
        };

        const nextItems = [...order.items];
        nextItems[targetIndex] = updatedOriginal;
        nextItems.push(child);

        const normalizedItems = this.normalizeItemsAfterChange(nextItems);

        const normalizedChild =
          normalizedItems.find((item) => item.id === childId) ?? child;
        const normalizedOriginal =
          normalizedItems.find((item) => item.id === target.id) ?? updatedOriginal;

        result = { created: normalizedChild, original: normalizedOriginal };

        return { ...order, items: normalizedItems };
      }),
    );

    if (!result) {
      throw new Error(
        `Der Split der Auftragsposition ${payload.itemId} konnte nicht durchgeführt werden.`,
      );
    }

    return result;
  }

  private matchesOrder(order: Order, filters: OrderFilters): boolean {
    const term = filters.search.trim().toLowerCase();
    if (
      term &&
      !(
        order.name.toLowerCase().includes(term) ||
        order.id.toLowerCase().includes(term) ||
        (order.customer?.toLowerCase().includes(term) ?? false)
      )
    ) {
      return false;
    }
    if (filters.tag !== 'all' && !(order.tags?.includes(filters.tag) ?? false)) {
      return false;
    }
    return true;
  }

  private matchesItem(item: OrderItem, filters: OrderFilters): boolean {
    if (filters.trainStatus !== 'all' || filters.trainNumber.trim()) {
      if (item.type !== 'Fahrplan') {
        if (filters.trainStatus !== 'all' || filters.trainNumber.trim() !== '') {
          return false;
        }
      } else {
        const plan = item.linkedTrainPlanId
          ? this.trainPlanService.getById(item.linkedTrainPlanId)
          : undefined;
        if (filters.trainStatus !== 'all') {
          if (!plan || plan.status !== filters.trainStatus) {
            return false;
          }
        }
        if (filters.trainNumber.trim()) {
          const search = filters.trainNumber.trim().toLowerCase();
          const trainNumber = plan?.trainNumber ?? item.name;
          if (!trainNumber.toLowerCase().includes(search)) {
            return false;
          }
        }
      }
    }

    if (filters.timeRange !== 'all') {
      if (!this.matchesTimeRange(item, filters.timeRange)) {
        return false;
      }
    }

    return true;
  }

  private matchesTimeRange(
    item: OrderItem,
    range: OrderFilters['timeRange'],
  ): boolean {
    if (range === 'all') {
      return true;
    }
    if (!item.start) {
      return false;
    }
    const start = new Date(item.start);
    if (Number.isNaN(start.getTime())) {
      return false;
    }
    const now = new Date();
    switch (range) {
      case 'next4h':
        return start >= now && start <= this.addHours(now, 4);
      case 'next12h':
        return start >= now && start <= this.addHours(now, 12);
      case 'today':
        return this.isSameDay(start, now);
      case 'thisWeek':
        return this.isSameWeek(start, now);
      default:
        return true;
    }
  }

  private addHours(date: Date, hours: number): Date {
    const result = new Date(date.getTime());
    result.setHours(result.getHours() + hours);
    return result;
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date.getTime());
    result.setDate(result.getDate() + days);
    return result;
  }

  private isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  private isSameWeek(date: Date, reference: Date): boolean {
    const start = this.startOfWeek(reference);
    const end = this.addDays(start, 7);
    return date >= start && date < end;
  }

  private startOfWeek(date: Date): Date {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = result.getDay();
    const diff = (day + 6) % 7; // Monday start
    result.setDate(result.getDate() - diff);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  linkBusinessToItem(businessId: string, itemId: string) {
    this.updateItem(itemId, (item) => {
      const ids = new Set(item.linkedBusinessIds ?? []);
      if (ids.has(businessId)) {
        return item;
      }
      ids.add(businessId);
      return { ...item, linkedBusinessIds: Array.from(ids) };
    });
  }

  unlinkBusinessFromItem(businessId: string, itemId: string) {
    this.updateItem(itemId, (item) => {
      const ids = new Set(item.linkedBusinessIds ?? []);
      if (!ids.has(businessId)) {
        return item;
      }
      ids.delete(businessId);
      const next = Array.from(ids);
      return {
        ...item,
        linkedBusinessIds: next.length ? next : undefined,
      };
    });
  }

  linkTemplateToItem(templateId: string, itemId: string) {
    this.updateItem(itemId, (item) => {
      if (item.linkedTemplateId === templateId) {
        return item;
      }
      return { ...item, linkedTemplateId: templateId };
    });
  }

  unlinkTemplateFromItem(templateId: string, itemId: string) {
    this.updateItem(itemId, (item) => {
      if (item.linkedTemplateId !== templateId) {
        return item;
      }
      const next = { ...item };
      delete next.linkedTemplateId;
      return next;
    });
  }

  linkTrainPlanToItem(planId: string, itemId: string) {
    const plan = this.trainPlanService.getById(planId);
    this._orders.update((orders) =>
      orders.map((order) => {
        let mutated = false;
        const items = order.items.map((item) => {
          if (item.id === itemId) {
            mutated = true;
            const base: OrderItem = {
              ...item,
              linkedTrainPlanId: planId,
            };
            return plan ? this.applyPlanDetailsToItem(base, plan) : base;
          }
          if (item.linkedTrainPlanId === planId && item.id !== itemId) {
            mutated = true;
            const next = { ...item };
            delete next.linkedTrainPlanId;
            return next;
          }
          return item;
        });
        return mutated ? { ...order, items } : order;
      }),
    );
  }

  unlinkTrainPlanFromItem(planId: string, itemId: string) {
    this.updateItem(itemId, (item) => {
      if (item.linkedTrainPlanId !== planId) {
        return item;
      }
      const next = { ...item };
      delete next.linkedTrainPlanId;
      return next;
    });
    this.trainPlanService.unlinkOrderItem(planId);
  }

  private appendItems(orderId: string, items: OrderItem[]) {
    if (!items.length) {
      return;
    }
    let updated = false;
    this._orders.update((orders) =>
      orders.map((order) => {
        if (order.id !== orderId) {
          return order;
        }
        updated = true;
        const prepared = this.prepareItemsForInsertion(items);
        return {
          ...order,
          items: this.normalizeItemsAfterChange([...order.items, ...prepared]),
        };
      }),
    );

    if (!updated) {
      throw new Error(`Auftrag ${orderId} nicht gefunden`);
    }
  }

  private prepareItemsForInsertion(items: OrderItem[]): OrderItem[] {
    return items.map((item) => this.ensureItemDefaults(item));
  }

  private initializeOrder(order: Order): Order {
    const prepared = order.items.map((item) => this.ensureItemDefaults(item));
    return {
      ...order,
      items: this.normalizeItemsAfterChange(prepared),
    };
  }

  private ensureItemDefaults(item: OrderItem): OrderItem {
    const validity =
      item.validity && item.validity.length
        ? this.normalizeSegments(item.validity)
        : this.deriveDefaultValidity(item);
    const originalTimetable = item.originalTimetable
      ? {
          ...item.originalTimetable,
          calendar: { ...item.originalTimetable.calendar },
          stops: [...(item.originalTimetable.stops ?? [])].map((stop) => ({
            ...stop,
          })),
        }
      : undefined;

    return {
      ...item,
      validity,
      childItemIds: [...(item.childItemIds ?? [])],
      versionPath: item.versionPath ? [...item.versionPath] : undefined,
      linkedBusinessIds: item.linkedBusinessIds
        ? [...item.linkedBusinessIds]
        : undefined,
      linkedTemplateId: item.linkedTemplateId,
      linkedTrainPlanId: item.linkedTrainPlanId,
      generatedTimetableRefId: item.generatedTimetableRefId,
      timetablePhase: item.timetablePhase,
      originalTimetable,
    };
  }

  private normalizeItemsAfterChange(items: OrderItem[]): OrderItem[] {
    const itemMap = new Map<string, OrderItem>();
    items.forEach((item) => {
      const defaults = this.ensureItemDefaults(item);
      itemMap.set(defaults.id, defaults);
    });

    // Reset child references to avoid duplicates.
    itemMap.forEach((item) => {
      item.childItemIds = [];
    });
    itemMap.forEach((item) => {
      if (!item.parentItemId) {
        return;
      }
      const parent = itemMap.get(item.parentItemId);
      if (!parent) {
        return;
      }
      parent.childItemIds = parent.childItemIds ?? [];
      if (!parent.childItemIds.includes(item.id)) {
        parent.childItemIds.push(item.id);
      }
    });

    const result: OrderItem[] = Array.from(itemMap.values());

    // Assign version paths depth-first, preserving original ordering as much as possible.
    const inputOrder = items.map((item) => item.id);
    const roots = inputOrder
      .map((id) => itemMap.get(id))
      .filter((item): item is OrderItem => !!item && !item.parentItemId);

    let rootCounter = 1;
    roots.forEach((root) => {
      const existingRootNumber =
        root.versionPath && root.versionPath.length === 1
          ? root.versionPath[0]
          : undefined;
      if (typeof existingRootNumber === 'number') {
        this.assignVersionPath(root, [existingRootNumber], itemMap, inputOrder);
        rootCounter = Math.max(rootCounter, existingRootNumber + 1);
      } else {
        this.assignVersionPath(root, [rootCounter], itemMap, inputOrder);
        rootCounter += 1;
      }
    });

    const orphans = inputOrder
      .map((id) => itemMap.get(id))
      .filter(
        (item): item is OrderItem =>
          !!item &&
          !!item.parentItemId &&
          !itemMap.has(item.parentItemId),
      );
    orphans.forEach((orphan) => {
      const existing = orphan.versionPath?.[0];
      if (typeof existing === 'number') {
        this.assignVersionPath(orphan, [existing], itemMap, inputOrder);
        rootCounter = Math.max(rootCounter, existing + 1);
      } else {
        this.assignVersionPath(orphan, [rootCounter], itemMap, inputOrder);
        rootCounter += 1;
      }
    });

    return result;
  }

  private assignVersionPath(
    item: OrderItem,
    path: number[],
    itemMap: Map<string, OrderItem>,
    inputOrder: string[],
  ) {
    item.versionPath = [...path];
    const childrenIds = [...(item.childItemIds ?? [])].sort((a, b) => {
      const indexA = inputOrder.indexOf(a);
      const indexB = inputOrder.indexOf(b);
      const safeA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
      const safeB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;
      return safeA - safeB;
    });
    let childCounter = 1;
    childrenIds.forEach((childId) => {
      const child = itemMap.get(childId);
      if (!child) {
        return;
      }
      const existingChildNumber =
        child.versionPath && child.versionPath.length === path.length + 1
          ? child.versionPath[path.length]
          : undefined;
      let nextIndex: number;
      if (typeof existingChildNumber === 'number') {
        nextIndex = existingChildNumber;
        childCounter = Math.max(childCounter, existingChildNumber + 1);
      } else {
        nextIndex = childCounter;
        childCounter += 1;
      }
      const nextPath = [...path, nextIndex];
      this.assignVersionPath(child, nextPath, itemMap, inputOrder);
    });
  }

  private deriveDefaultValidity(item: OrderItem): OrderItemValiditySegment[] {
    if (!item.start && !item.end) {
      return [];
    }
    const startDate = item.start ? item.start.slice(0, 10) : item.end?.slice(0, 10);
    const endDate = item.end ? item.end.slice(0, 10) : startDate;
    if (!startDate || !endDate) {
      return [];
    }
    if (!this.isValidDate(startDate) || !this.isValidDate(endDate)) {
      return [];
    }
    const normalizedStart =
      startDate <= endDate ? startDate : endDate;
    const normalizedEnd =
      endDate >= startDate ? endDate : startDate;
    return [{ startDate: normalizedStart, endDate: normalizedEnd }];
  }

  private splitSegments(
    segments: OrderItemValiditySegment[],
    rangeStart: string,
    rangeEnd: string,
  ): { retained: OrderItemValiditySegment[]; extracted: OrderItemValiditySegment[] } {
    const retained: OrderItemValiditySegment[] = [];
    const extracted: OrderItemValiditySegment[] = [];

    segments.forEach((segment) => {
      const segStart = segment.startDate;
      const segEnd = segment.endDate;

      if (rangeEnd < segStart || rangeStart > segEnd) {
        retained.push(segment);
        return;
      }

      const overlapStart = rangeStart > segStart ? rangeStart : segStart;
      const overlapEnd = rangeEnd < segEnd ? rangeEnd : segEnd;

      if (overlapStart > overlapEnd) {
        retained.push(segment);
        return;
      }

      extracted.push({ startDate: overlapStart, endDate: overlapEnd });

      if (segStart < overlapStart) {
        retained.push({
          startDate: segStart,
          endDate: this.addDaysToDateString(overlapStart, -1),
        });
      }

      if (overlapEnd < segEnd) {
        retained.push({
          startDate: this.addDaysToDateString(overlapEnd, 1),
          endDate: segEnd,
        });
      }
    });

    return {
      retained: this.normalizeSegments(retained),
      extracted: this.normalizeSegments(extracted),
    };
  }

  private normalizeSegments(
    segments: OrderItemValiditySegment[],
  ): OrderItemValiditySegment[] {
    if (!segments.length) {
      return [];
    }
    const sorted = [...segments].sort((a, b) =>
      a.startDate.localeCompare(b.startDate),
    );
    const merged: OrderItemValiditySegment[] = [];
    let current = { ...sorted[0] };
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      const dayAfterCurrentEnd = this.addDaysToDateString(current.endDate, 1);
      if (dayAfterCurrentEnd >= next.startDate) {
        const maxEnd =
          current.endDate > next.endDate ? current.endDate : next.endDate;
        current = { startDate: current.startDate, endDate: maxEnd };
      } else {
        merged.push(current);
        current = { ...next };
      }
    }
    merged.push(current);
    return merged;
  }

  private addDaysToDateString(date: string, days: number): string {
    const utc = this.toUtcDate(date);
    if (!utc) {
      return date;
    }
    utc.setUTCDate(utc.getUTCDate() + days);
    return this.fromUtcDate(utc);
  }

  private toUtcDate(value: string): Date | null {
    if (!this.isValidDate(value)) {
      return null;
    }
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private fromUtcDate(date: Date): string {
    return [
      date.getUTCFullYear().toString().padStart(4, '0'),
      (date.getUTCMonth() + 1).toString().padStart(2, '0'),
      date.getUTCDate().toString().padStart(2, '0'),
    ].join('-');
  }

  private isValidDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  private normalizeDateInput(value: string): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (!this.isValidDate(trimmed)) {
      return null;
    }
    return trimmed;
  }

  private prepareUpdatePayload(
    updates: Partial<OrderItemUpdateData> | undefined,
  ): Partial<OrderItemUpdateData> {
    if (!updates) {
      return {};
    }
    const clone: Partial<OrderItemUpdateData> = { ...updates };
    if (updates.linkedBusinessIds) {
      clone.linkedBusinessIds = [...updates.linkedBusinessIds];
    }
    return clone;
  }

  private applyUpdatesToItem(
    item: OrderItem,
    updates: Partial<OrderItemUpdateData>,
  ): OrderItem {
    if (!updates || Object.keys(updates).length === 0) {
      return item;
    }
    const next: OrderItem = { ...item, ...updates };
    if (updates.linkedBusinessIds) {
      next.linkedBusinessIds = [...updates.linkedBusinessIds];
    }
    return next;
  }

  private generateOrderId(): string {
    return `A-${Date.now().toString(36).toUpperCase()}`;
  }

  private generateItemId(orderId: string): string {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${orderId}-OP-${suffix}`;
  }

  private normalizeTags(tags?: string[]): string[] | undefined {
    if (!tags?.length) {
      return undefined;
    }
    return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
  }

  private extractPlanStart(plan: { stops: TrainPlan['stops'] }): string | undefined {
    const sorted = [...plan.stops].sort((a, b) => a.sequence - b.sequence);
    for (const stop of sorted) {
      if (stop.departureTime) {
        return stop.departureTime;
      }
      if (stop.arrivalTime) {
        return stop.arrivalTime;
      }
    }
    return undefined;
  }

  private extractPlanEnd(plan: { stops: TrainPlan['stops'] }): string | undefined {
    const sorted = [...plan.stops].sort((a, b) => b.sequence - a.sequence);
    for (const stop of sorted) {
      if (stop.arrivalTime) {
        return stop.arrivalTime;
      }
      if (stop.departureTime) {
        return stop.departureTime;
      }
    }
    return undefined;
  }

  private applyPlanDetailsToItem(item: OrderItem, plan: TrainPlan): OrderItem {
    const start = this.extractPlanStart(plan);
    const end = this.extractPlanEnd(plan);
    const firstStop = plan.stops[0];
    const lastStop = plan.stops[plan.stops.length - 1];

    const updated: OrderItem = {
      ...item,
      responsible: plan.responsibleRu,
      fromLocation: firstStop?.locationName ?? item.fromLocation,
      toLocation: lastStop?.locationName ?? item.toLocation,
    };

    if (start) {
      updated.start = start;
    }
    if (end) {
      updated.end = end;
    }

    if (plan.trafficPeriodId) {
      updated.trafficPeriodId = plan.trafficPeriodId;
      updated.validity = undefined;
    } else if (plan.calendar?.validFrom) {
      updated.trafficPeriodId = undefined;
      const endDate = plan.calendar.validTo ?? plan.calendar.validFrom;
      updated.validity = [
        {
          startDate: plan.calendar.validFrom,
          endDate,
        },
      ];
    } else {
      updated.trafficPeriodId = undefined;
      updated.validity = undefined;
    }

    return updated;
  }

  private combineDateTime(date: string, time: string): string {
    const match = /^([0-9]{1,2}):([0-9]{2})$/.exec(time);
    const [year, month, day] = date.split('-').map(Number);
    const hours = match ? Number.parseInt(match[1], 10) : 0;
    const minutes = match ? Number.parseInt(match[2], 10) : 0;
    const result = new Date(year, month - 1, day, hours, minutes, 0, 0);
    return result.toISOString();
  }

  private updateItem(
    itemId: string,
    updater: (item: OrderItem) => OrderItem,
  ): void {
    this._orders.update((orders) =>
      orders.map((order) => {
        let mutated = false;
        const items = order.items.map((item) => {
          if (item.id !== itemId) {
            return item;
          }
          mutated = true;
          return updater(item);
        });
        return mutated ? { ...order, items } : order;
      }),
    );
  }
}
