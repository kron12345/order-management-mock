import { Component, computed } from '@angular/core';
import { MATERIAL_IMPORTS } from '../../../core/material.imports.imports';
import { OrderService } from '../../../core/services/order.service';
import { FilterBarComponent } from '../../filters/filter-bar/filter-bar.component';
import { OrderCardComponent } from '../order-card/order-card.component';

@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [...MATERIAL_IMPORTS, FilterBarComponent, OrderCardComponent],
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.scss',
})
export class OrderListComponent {
  orders = computed(() => this.store.filteredOrders());
  constructor(private store: OrderService) {}
}
