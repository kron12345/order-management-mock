import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MATERIAL_IMPORTS } from '../../../core/material.imports.imports';
import { Order } from '../../../core/models/order.model';
import { OrderItem } from '../../../core/models/order-item.model';
import { OrderItemListComponent } from '../order-item-list/order-item-list.component';
import { OrderPositionDialogComponent } from '../order-position-dialog.component';
import { BusinessService } from '../../../core/services/business.service';
import { BusinessStatus } from '../../../core/models/business.model';
import { TrainPlanService } from '../../../core/services/train-plan.service';
import { TrainPlanStatus } from '../../../core/models/train-plan.model';
import { OrderService } from '../../../core/services/order.service';

@Component({
  selector: 'app-order-card',
  standalone: true,
  imports: [
    CommonModule,
    ...MATERIAL_IMPORTS,
    OrderItemListComponent,
  ],
  templateUrl: './order-card.component.html',
  styleUrl: './order-card.component.scss',
})
export class OrderCardComponent {
  private readonly orderSignal = signal<Order | null>(null);
  private readonly itemsSignal = signal<OrderItem[] | null>(null);

  private _order!: Order;

  @Input({ required: true })
  set order(value: Order) {
    this._order = value;
    this.orderSignal.set(value);
  }
  get order(): Order {
    return this._order;
  }

  @Input()
  set items(value: OrderItem[] | null) {
    this.itemsSignal.set(value);
  }
  get items(): OrderItem[] | null {
    return this.itemsSignal();
  }
  expanded = signal(true);
  readonly businessStatusSummaries = computed(() =>
    this.computeBusinessStatusSummaries(this.effectiveItems()),
  );
  readonly trainStatusSummaries = computed(() =>
    this.computeTrainStatusSummaries(this.effectiveItems()),
  );
  private readonly filters = computed(() => this.orderService.filters());
  readonly effectiveItems = computed(() => this.resolveItems());

  private readonly businessStatusLabels: Record<BusinessStatus, string> = {
    neu: 'Neu',
    pausiert: 'Pausiert',
    in_arbeit: 'In Arbeit',
    erledigt: 'Erledigt',
  };
  private readonly trainPlanStatusLabels: Partial<Record<TrainPlanStatus, string>> =
    {
      not_ordered: 'Nicht bestellt',
      requested: 'Angefragt',
      offered: 'Angeboten',
      confirmed: 'Bestätigt',
      operating: 'In Betrieb',
      canceled: 'Storniert',
    };

  constructor(
    private readonly dialog: MatDialog,
    private readonly businessService: BusinessService,
    private readonly trainPlanService: TrainPlanService,
    private readonly orderService: OrderService,
  ) {}

  openPositionDialog(event: MouseEvent) {
    event.stopPropagation();
    this.dialog.open(OrderPositionDialogComponent, {
      width: '95vw',
      maxWidth: '1200px',
      data: {
        order: this.order,
      },
    });
  }

  private resolveItems(): OrderItem[] {
    const order = this.orderSignal();
    if (!order) {
      return [];
    }
    const provided = this.itemsSignal();
    const base = provided ?? this.orderService.filterItemsForOrder(order);
    const filters = this.filters();
    if (filters.businessStatus === 'all') {
      return base;
    }
    return base.filter((item) =>
      this.itemMatchesBusinessStatus(item, filters.businessStatus as BusinessStatus),
    );
  }

  private computeBusinessStatusSummaries(items: OrderItem[]): StatusSummary[] {
    const ids = new Set<string>();
    items.forEach((item) =>
      (item.linkedBusinessIds ?? []).forEach((id) => ids.add(id)),
    );

    if (!ids.size) {
      return [];
    }

    const counts = new Map<string, number>();
    const labels = new Map<string, string>();
    const values = new Map<string, string>();

    const businesses = this.businessService.getByIds(Array.from(ids));
    businesses.forEach((business) => {
      const status = business.status;
      const className = this.statusClassName(status);
      counts.set(className, (counts.get(className) ?? 0) + 1);
      labels.set(
        className,
        this.businessStatusLabels[status] ?? this.fallbackStatusLabel(status),
      );
      values.set(className, status);
    });

    return this.sortSummaries(
      Array.from(counts.entries()).map(([className, count]) => ({
        key: className,
        label:
          labels.get(className) ??
          this.fallbackStatusLabel(this.stripStatusPrefix(className)),
        count,
        value: values.get(className) ?? this.stripStatusPrefix(className),
      })),
    );
  }

  private computeTrainStatusSummaries(items: OrderItem[]): StatusSummary[] {
    const ids = new Set<string>(
      items
        .map((item) => item.linkedTrainPlanId)
        .filter((id): id is string => !!id),
    );

    if (!ids.size) {
      return [];
    }

    const counts = new Map<string, number>();
    const labels = new Map<string, string>();
    const values = new Map<string, string>();

    ids.forEach((planId) => {
      const plan = this.trainPlanService.getById(planId);
      const status = plan?.status;
      if (!status) {
        return;
      }
      const className = this.statusClassName(status);
      counts.set(className, (counts.get(className) ?? 0) + 1);
      labels.set(
        className,
        this.trainPlanStatusLabels[status] ?? this.fallbackStatusLabel(status),
      );
      values.set(className, status);
    });

    return this.sortSummaries(
      Array.from(counts.entries()).map(([className, count]) => ({
        key: className,
        label:
          labels.get(className) ??
          this.fallbackStatusLabel(this.stripStatusPrefix(className)),
        count,
        value: values.get(className) ?? this.stripStatusPrefix(className),
      })),
    );
  }

  private fallbackStatusLabel(value: string): string {
    return value
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/(^|\s)\S/g, (match) => match.toUpperCase());
  }

  private normalizeStatusValue(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  private statusClassName(value: string): string {
    return `status-${this.normalizeStatusValue(value)}`;
  }

  private sortSummaries(summaries: StatusSummary[]): StatusSummary[] {
    return summaries.sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.label.localeCompare(b.label, 'de', { sensitivity: 'base' });
    });
  }

  private stripStatusPrefix(value: string): string {
    return value.startsWith('status-') ? value.slice('status-'.length) : value;
  }

  private itemMatchesBusinessStatus(
    item: OrderItem,
    status: BusinessStatus,
  ): boolean {
    const ids = item.linkedBusinessIds ?? [];
    if (!ids.length) {
      return false;
    }
    const businesses = this.businessService.getByIds(ids);
    return businesses.some((b) => b.status === status);
  }

  isTrainStatusActive(status: string): boolean {
    return this.filters().trainStatus === status;
  }

  isBusinessStatusActive(status: string): boolean {
    return this.filters().businessStatus === status;
  }

  toggleTrainStatus(status: string, event: MouseEvent) {
    event.stopPropagation();
    const current = this.filters().trainStatus;
    const next = current === status ? 'all' : (status as TrainPlanStatus | 'all');
    this.orderService.setFilter({ trainStatus: next });
  }

  toggleBusinessStatus(status: string, event: MouseEvent) {
    event.stopPropagation();
    const current = this.filters().businessStatus;
    const next = current === status ? 'all' : (status as BusinessStatus);
    this.orderService.setFilter({ businessStatus: next });
  }

  clearBusinessStatus(event: MouseEvent) {
    event.stopPropagation();
    this.orderService.setFilter({ businessStatus: 'all' });
  }

  clearTrainStatus(event: MouseEvent) {
    event.stopPropagation();
    this.orderService.setFilter({ trainStatus: 'all' });
  }
}

interface StatusSummary {
  key: string;
  label: string;
  count: number;
  value: string;
}
