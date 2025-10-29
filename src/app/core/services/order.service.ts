import { Injectable, computed, signal } from '@angular/core';
import { Order } from '../models/order.model';
import { OrderItem } from '../models/order-item.model';
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

  constructor(private readonly trainPlanService: TrainPlanService) {}

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
      const start = this.extractPlanStart(plan) ?? this.combineDateTime(plan.calendar.validFrom, payload.startTime);
      const end = this.extractPlanEnd(plan) ?? start;
      const namePrefix = payload.namePrefix?.trim() ?? plan.title;
      const itemName = plans.length > 1 ? `${namePrefix} #${index + 1}` : namePrefix;
      const firstStop = plan.stops[0];
      const lastStop = plan.stops[plan.stops.length - 1];

      return {
        id: this.generateItemId(payload.orderId),
        name: itemName,
        type: 'Fahrplan',
        start,
        end,
        responsible: payload.responsible,
        trafficPeriodId: payload.trafficPeriodId,
        linkedTemplateId: payload.templateId,
        linkedTrainPlanId: plan.id,
        fromLocation: firstStop?.locationName,
        toLocation: lastStop?.locationName,
      } satisfies OrderItem;
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
    });

    const start = this.extractPlanStart(plan);
    const end = this.extractPlanEnd(plan);
    const firstStop = plan.stops[0];
    const lastStop = plan.stops[plan.stops.length - 1];

    const item: OrderItem = {
      id: this.generateItemId(payload.orderId),
      name:
        payload.name?.trim() && payload.name.trim().length
          ? payload.name.trim()
          : payload.template.title,
      type: 'Fahrplan',
      responsible:
        payload.responsible?.trim() || payload.template.responsibleRu,
      trafficPeriodId: payload.trafficPeriodId,
      linkedTrainPlanId: plan.id,
      linkedTemplateId: payload.template.id,
      fromLocation: firstStop?.locationName,
      toLocation: lastStop?.locationName,
    } satisfies OrderItem;

    if (start) {
      item.start = start;
    }
    if (end) {
      item.end = end;
    }

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
    });

    const start = this.extractPlanStart(plan);
    const end = this.extractPlanEnd(plan);
    const firstStop = plan.stops[0];
    const lastStop = plan.stops[plan.stops.length - 1];

    const namePrefix = payload.namePrefix?.trim();
    const itemName = namePrefix ? `${namePrefix} ${payload.train.name}` : payload.train.name;
    const item: OrderItem = {
      id: this.generateItemId(payload.orderId),
      name: itemName,
      type: 'Fahrplan',
      responsible,
      trafficPeriodId: payload.trafficPeriodId,
      linkedTrainPlanId: plan.id,
      fromLocation: firstStop?.locationName ?? payload.train.start,
      toLocation: lastStop?.locationName ?? payload.train.end,
    } satisfies OrderItem;

    if (start) {
      item.start = start;
    }
    if (end) {
      item.end = end;
    }

    this.appendItems(payload.orderId, [item]);
    this.trainPlanService.linkOrderItem(plan.id, item.id);
    this.linkTrainPlanToItem(plan.id, item.id);
    return item;
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
    this._orders.update((orders) =>
      orders.map((order) => {
        let mutated = false;
        const items = order.items.map((item) => {
          if (item.id === itemId) {
            mutated = true;
            return { ...item, linkedTrainPlanId: planId };
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
        return { ...order, items: [...order.items, ...items] };
      }),
    );

    if (!updated) {
      throw new Error(`Auftrag ${orderId} nicht gefunden`);
    }
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
