import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import {
  CreateOrderPayload,
  OrderService,
} from '../../core/services/order.service';

@Component({
  selector: 'app-order-create-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS],
  templateUrl: './order-create-dialog.component.html',
  styleUrl: './order-create-dialog.component.scss',
})
export class OrderCreateDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<OrderCreateDialogComponent>);
  private readonly orderService = inject(OrderService);

  readonly form = this.fb.group({
    id: [''],
    name: ['', Validators.required],
    customer: [''],
    tags: [''],
    comment: [''],
  });

  cancel() {
    this.dialogRef.close();
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload: CreateOrderPayload = {
      id: value.id?.trim() || undefined,
      name: value.name!,
      customer: value.customer?.trim() || undefined,
      tags: this.parseTags(value.tags),
      comment: value.comment?.trim() || undefined,
    };

    const order = this.orderService.createOrder(payload);
    this.dialogRef.close(order);
  }

  private parseTags(value: string | null | undefined): string[] | undefined {
    if (!value?.trim()) {
      return undefined;
    }
    const tags = value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    return tags.length ? Array.from(new Set(tags)) : undefined;
  }
}
