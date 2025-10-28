import { Component, Input, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MATERIAL_IMPORTS } from '../../../core/material.imports.imports';
import { Order } from '../../../core/models/order.model';
import { StatusChipComponent } from '../../../shared/status-chip/status-chip.component';
import { OrderItemListComponent } from '../order-item-list/order-item-list.component';
import { OrderPositionDialogComponent } from '../order-position-dialog.component';

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

  constructor(private readonly dialog: MatDialog) {}

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
}
