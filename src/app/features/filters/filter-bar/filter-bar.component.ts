import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MATERIAL_IMPORTS } from '../../../core/material.imports.imports';
import { OrderService } from '../../../core/services/order.service';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [FormsModule, ...MATERIAL_IMPORTS],
  templateUrl: './filter-bar.component.html',
  styleUrl: './filter-bar.component.scss',
})
export class FilterBarComponent {
  statusOptions = ['all', 'open', 'in_progress', 'blocked', 'done'] as const;
  search = signal('');
  status = signal<'all' | 'open' | 'in_progress' | 'blocked' | 'done'>('all');
  tag = signal<'all' | string>('all');

  constructor(public store: OrderService) {}

  onApply() {
    this.store.setFilter({
      search: this.search(),
      status: this.status(),
      tag: this.tag(),
    });
  }
  onSearchChange(value: string) {
    this.search.set(value ?? '');
    this.onApply();
  }

  onStatusChange(value: 'all' | 'open' | 'in_progress' | 'blocked' | 'done') {
    this.status.set(value);
    this.onApply();
  }

  onTagInput(evt: Event) {
    const value = (evt.target as HTMLInputElement | null)?.value ?? '';
    this.tag.set(value.trim() === '' ? 'all' : value);
    this.onApply();
  }

  onReset() {
    this.search.set('');
    this.status.set('all');
    this.tag.set('all');
    this.onApply();
  }
}
