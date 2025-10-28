import { Component, computed } from '@angular/core';
import { OrderService } from '../../../core/services/order.service';
import { FilterBarComponent } from '../../filters/filter-bar/filter-bar.component';
import { OrderCardComponent } from '../order-card/order-card.component';
import { MatDialog } from '@angular/material/dialog';
import { OrderCreateDialogComponent } from '../order-create-dialog.component';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatCardModule, FilterBarComponent, OrderCardComponent],
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.scss',
})
export class OrderListComponent {
  orders = computed(() => this.store.filteredOrders());
  constructor(private store: OrderService, private readonly dialog: MatDialog) {}

  openCreateDialog() {
    this.dialog.open(OrderCreateDialogComponent, {
      width: '520px',
    });
  }
}
