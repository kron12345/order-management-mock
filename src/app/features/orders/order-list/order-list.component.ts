import { Component, computed } from '@angular/core';
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

  constructor(
    private readonly store: OrderService,
    private readonly businessService: BusinessService,
    private readonly dialog: MatDialog,
  ) {}

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
      filters.trainNumber.trim() !== '';

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
}
