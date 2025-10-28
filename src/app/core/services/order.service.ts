import { Injectable, computed, signal } from '@angular/core';
import { Order } from '../models/order.model';
import { OrderStatus } from '../models/order-status';
import { OrderItem } from '../models/order-item.model';
import { MOCK_ORDERS } from '../mock/mock-orders.mock';
import {
  CreatePlansFromTemplatePayload,
  TrainPlanService,
} from './train-plan.service';
import { TrainPlan } from '../models/train-plan.model';

export interface OrderFilters {
  search: string;
  status: OrderStatus | 'all';
  tag: string | 'all';
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
  status: OrderStatus;
  tags?: string[];
  comment?: string;
}

export interface CreateServiceOrderItemPayload {
  orderId: string;
  name: string;
  type: OrderItem['type'];
  serviceType: string;
  fromLocation: string;
  toLocation: string;
  start: string; // ISO
  end: string; // ISO
  responsible?: string;
  deviation?: string;
  trafficPeriodId: string;
}

export interface CreatePlanOrderItemsPayload
  extends CreatePlansFromTemplatePayload {
  orderId: string;
  namePrefix?: string;
  responsible?: string;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly _orders = signal<Order[]>(MOCK_ORDERS);
  private readonly _filters = signal<OrderFilters>({
    search: '',
    status: 'all',
    tag: 'all',
  });

  constructor(private readonly trainPlanService: TrainPlanService) {}

  readonly filters = computed(() => this._filters());
  readonly orders = computed(() => this._orders());
  readonly orderItems = computed(() =>
    this._orders().flatMap((order) =>
      order.items.map((item) => ({
        orderId: order.id,
        orderName: order.name,
        orderStatus: order.status,
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
    const f = this._filters();
    return this._orders().filter((o) => {
      const matchesSearch =
        !f.search ||
        o.name.toLowerCase().includes(f.search.toLowerCase()) ||
        o.id.toLowerCase().includes(f.search.toLowerCase());
      const matchesStatus = f.status === 'all' || o.status === f.status;
      const matchesTag = f.tag === 'all' || (o.tags?.includes(f.tag) ?? false);
      return matchesSearch && matchesStatus && matchesTag;
    });
  });

  setFilter(patch: Partial<OrderFilters>) {
    this._filters.update((f) => ({ ...f, ...patch }));
  }

  getOrderById(orderId: string): Order | undefined {
    return this._orders().find((order) => order.id === orderId);
  }

  createOrder(payload: CreateOrderPayload): Order {
    const id = payload.id?.trim().length ? payload.id.trim() : this.generateOrderId();
    const order: Order = {
      id,
      name: payload.name,
      customer: payload.customer,
      status: payload.status,
      tags: this.normalizeTags(payload.tags),
      comment: payload.comment,
      items: [],
    };

    this._orders.update((orders) => [order, ...orders]);
    return order;
  }

  addServiceOrderItem(payload: CreateServiceOrderItemPayload): OrderItem {
    const item: OrderItem = {
      id: this.generateItemId(payload.orderId),
      name: payload.name,
      type: payload.type,
      serviceType: payload.serviceType,
      fromLocation: payload.fromLocation,
      toLocation: payload.toLocation,
      start: payload.start,
      end: payload.end,
      responsible: payload.responsible,
      deviation: payload.deviation,
      trafficPeriodId: payload.trafficPeriodId,
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

      return {
        id: this.generateItemId(payload.orderId),
        name: itemName,
        type: 'TTT',
        start,
        end,
        responsible: payload.responsible,
        trafficPeriodId: payload.trafficPeriodId,
        linkedTemplateId: payload.templateId,
        linkedTrainPlanId: plan.id,
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
