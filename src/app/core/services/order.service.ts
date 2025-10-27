import { Injectable, computed, signal } from '@angular/core';
import { Order } from '../models/order.model';
import { OrderStatus } from '../models/order-status';
import { MOCK_ORDERS } from '../mock/mock-orders.mock';

export interface OrderFilters {
  search: string;
  status: OrderStatus | 'all';
  tag: string | 'all';
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly _orders = signal<Order[]>(MOCK_ORDERS);
  private readonly _filters = signal<OrderFilters>({
    search: '',
    status: 'all',
    tag: 'all',
  });

  readonly filters = computed(() => this._filters());
  readonly orders = computed(() => this._orders());

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
}
