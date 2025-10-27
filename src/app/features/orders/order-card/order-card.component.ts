import { Component, Input, signal } from '@angular/core';
import { MATERIAL_IMPORTS } from '../../../core/material.imports.imports';
import { Order } from '../../../core/models/order.model';
import { StatusChipComponent } from '../../../shared/status-chip/status-chip.component';
import { OrderItemListComponent } from '../order-item-list/order-item-list.component';

@Component({
  selector: 'app-order-card',
  standalone: true,
  imports: [...MATERIAL_IMPORTS, StatusChipComponent, OrderItemListComponent],
  templateUrl: './order-card.component.html',
  styleUrl: './order-card.component.scss',
})
export class OrderCardComponent {
  @Input({ required: true }) order!: Order;
  expanded = signal(true);
}
