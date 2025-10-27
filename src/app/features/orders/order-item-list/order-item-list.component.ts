import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MATERIAL_IMPORTS } from '../../../core/material.imports.imports';
import { OrderItem } from '../../../core/models/order-item.model';

@Component({
  selector: 'app-order-item-list',
  standalone: true,
  imports: [CommonModule, ...MATERIAL_IMPORTS],
  templateUrl: './order-item-list.component.html',
  styleUrl: './order-item-list.component.scss',
})
export class OrderItemListComponent {
  @Input({ required: true }) items!: OrderItem[];
}
