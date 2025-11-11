import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import { Order } from '../../core/models/order.model';
import { OrderItem } from '../../core/models/order-item.model';
import { TimetablePhase } from '../../core/models/timetable.model';
import { OrderService } from '../../core/services/order.service';

export interface OrderStatusUpdateDialogData {
  order: Order;
  items: OrderItem[];
}

@Component({
  selector: 'app-order-status-update-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, ...MATERIAL_IMPORTS],
  templateUrl: './order-status-update-dialog.component.html',
  styleUrl: './order-status-update-dialog.component.scss',
})
export class OrderStatusUpdateDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<OrderStatusUpdateDialogComponent>);
  readonly data = inject<OrderStatusUpdateDialogData>(MAT_DIALOG_DATA);
  private readonly orderService = inject(OrderService);
  private readonly snackBar = inject(MatSnackBar);

  readonly selectedPhase = signal<TimetablePhase>('bedarf');
  readonly selectedItemIds = signal<Set<string>>(new Set(this.data.items.map((item) => item.id)));
  readonly phaseOptions: { value: TimetablePhase; label: string; icon: string }[] = [
    { value: 'bedarf', label: 'Bedarf', icon: 'lightbulb' },
    { value: 'path_request', label: 'Trassenanmeldung', icon: 'directions_subway' },
    { value: 'offer', label: 'Angebot', icon: 'description' },
    { value: 'contract', label: 'Vertrag', icon: 'assignment_turned_in' },
    { value: 'operational', label: 'Betrieb', icon: 'play_circle' },
    { value: 'archived', label: 'Archiv', icon: 'inventory_2' },
  ];

  constructor() {
    const firstPhase = this.data.items.find((item) => item.timetablePhase)?.timetablePhase;
    if (firstPhase) {
      this.selectedPhase.set(firstPhase);
    }
  }

  selectPhase(phase: TimetablePhase): void {
    this.selectedPhase.set(phase);
  }

  toggleItem(itemId: string): void {
    this.selectedItemIds.update((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  save(): void {
    const phase = this.selectedPhase();
    const items = Array.from(this.selectedItemIds());
    if (!items.length) {
      return;
    }
    items.forEach((itemId) => this.orderService.setItemTimetablePhase(itemId, phase));
    this.snackBar.open(
      `${items.length} Position${items.length === 1 ? '' : 'en'} auf ${this.labelForPhase(phase)} gesetzt.`,
      'OK',
      { duration: 2500 },
    );
    this.dialogRef.close();
  }

  close(): void {
    this.dialogRef.close();
  }

  labelForPhase(phase: TimetablePhase): string {
    const option = this.phaseOptions.find((entry) => entry.value === phase);
    return option?.label ?? phase;
  }
}
