import { Component, computed, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { OrderService } from '../../../core/services/order.service';
import { FilterBarComponent } from '../../filters/filter-bar/filter-bar.component';
import { OrderCardComponent } from '../order-card/order-card.component';
import { MatDialog } from '@angular/material/dialog';
import { OrderCreateDialogComponent } from '../order-create-dialog.component';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { Order } from '../../../core/models/order.model';
import { OrderItem } from '../../../core/models/order-item.model';
import { BusinessStatus } from '../../../core/models/business.model';
import { BusinessService } from '../../../core/services/business.service';

@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatCardModule, FilterBarComponent, OrderCardComponent],
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.scss',
})
export class OrderListComponent {
  readonly orders = computed(() => this.filteredOrders());
  readonly highlightItemId = signal<string | null>(null);

  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);

  constructor(
    private readonly store: OrderService,
    private readonly businessService: BusinessService,
    private readonly dialog: MatDialog,
  ) {
    this.route.queryParamMap.subscribe((params) => {
      const businessId = params.get('businessId');
      if (businessId) {
        this.store.setFilter({ linkedBusinessId: businessId });
      }
      const highlightItem = params.get('highlightItem');
      this.highlightItemId.set(highlightItem);
      if (highlightItem) {
        window.setTimeout(() => this.scrollToHighlightedItem(highlightItem), 0);
      }
    });

    effect(() => {
      this.orders();
      const target = this.highlightItemId();
      if (!target) {
        return;
      }
      window.setTimeout(() => this.scrollToHighlightedItem(target), 0);
    });
  }

  openCreateDialog() {
    this.dialog.open(OrderCreateDialogComponent, {
      width: '760px',
      maxWidth: '95vw',
    });
  }

  filteredItems(order: Order): OrderItem[] {
    const filters = this.store.filters();
    const base = this.store.filterItemsForOrder(order);
    if (filters.businessStatus === 'all') {
      return base;
    }
    return base.filter((item) =>
      this.itemMatchesBusinessStatus(item, filters.businessStatus as BusinessStatus),
    );
  }

  private filteredOrders() {
    const filters = this.store.filters();
    const orders = this.store.filteredOrders();
    const itemFiltersActive =
      filters.timeRange !== 'all' ||
      filters.trainStatus !== 'all' ||
      filters.businessStatus !== 'all' ||
      filters.trainNumber.trim() !== '' ||
      filters.timetableYearLabel !== 'all' ||
      Boolean(filters.linkedBusinessId);

    return orders
      .map((order) => ({
        order,
        items: this.filteredItems(order),
      }))
      .filter(({ items, order }) => {
        if (items.length > 0) {
          return true;
        }
        if (itemFiltersActive) {
          return false;
        }
        return true;
      });
  }

  private itemMatchesBusinessStatus(
    item: OrderItem,
    status: BusinessStatus,
  ): boolean {
    const businessIds = item.linkedBusinessIds ?? [];
    if (!businessIds.length) {
      return false;
    }
    const businesses = this.businessService.getByIds(businessIds);
    return businesses.some((business) => business.status === status);
  }

  private scrollToHighlightedItem(itemId: string | null): void {
    if (!itemId) {
      return;
    }
    const element = this.document.getElementById(`order-item-${itemId}`);
    if (!element) {
      return;
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      if (this.highlightItemId() === itemId) {
        this.highlightItemId.set(null);
      }
    }, 2500);
  }
}
