import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MATERIAL_IMPORTS } from '../../../core/material.imports.imports';
import { OrderService, OrderFilters } from '../../../core/services/order.service';
import { TrainPlanStatus } from '../../../core/models/train-plan.model';
import { BusinessStatus } from '../../../core/models/business.model';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [FormsModule, ...MATERIAL_IMPORTS],
  templateUrl: './filter-bar.component.html',
  styleUrl: './filter-bar.component.scss',
})
export class FilterBarComponent {
  search = signal('');
  tag = signal<'all' | string>('all');
  trainNumber = signal('');

  readonly timeOptions: { value: OrderFilters['timeRange']; label: string }[] = [
    { value: 'all', label: 'Alle Zeiten' },
    { value: 'next4h', label: 'Nächste 4 Stunden' },
    { value: 'next12h', label: 'Nächste 12 Stunden' },
    { value: 'today', label: 'Heute' },
    { value: 'thisWeek', label: 'Diese Woche' },
  ];

  readonly trainStatusOptions: { value: TrainPlanStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'Alle Status' },
    { value: 'not_ordered', label: 'Nicht bestellt' },
    { value: 'requested', label: 'Angefragt' },
    { value: 'offered', label: 'Im Angebot' },
    { value: 'confirmed', label: 'Bestätigt' },
    { value: 'operating', label: 'Unterwegs' },
    { value: 'canceled', label: 'Storniert' },
  ];

  readonly businessStatusOptions: { value: BusinessStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'Alle Geschäfte' },
    { value: 'neu', label: 'Neu' },
    { value: 'in_arbeit', label: 'In Arbeit' },
    { value: 'pausiert', label: 'Pausiert' },
    { value: 'erledigt', label: 'Erledigt' },
  ];

  constructor(public store: OrderService) {
    const filters = this.store.filters();
    this.search.set(filters.search);
    this.tag.set(filters.tag);
    this.trainNumber.set(filters.trainNumber);
  }

  onApply() {
    this.store.setFilter({
      search: this.search(),
      tag: this.tag(),
    });
  }
  onSearchChange(value: string) {
    this.search.set(value ?? '');
    this.onApply();
  }

  onTagInput(evt: Event) {
    const value = (evt.target as HTMLInputElement | null)?.value ?? '';
    this.tag.set(value.trim() === '' ? 'all' : value);
    this.onApply();
  }

  onReset() {
    this.search.set('');
    this.tag.set('all');
    this.trainNumber.set('');
    this.store.setFilter({
      search: '',
      tag: 'all',
      timeRange: 'all',
      trainStatus: 'all',
      businessStatus: 'all',
      trainNumber: '',
    });
  }

  onTimeRangeChange(value: OrderFilters['timeRange']) {
    this.store.setFilter({ timeRange: value });
  }

  onTrainStatusChange(value: TrainPlanStatus | 'all') {
    this.store.setFilter({ trainStatus: value });
  }

  onBusinessStatusChange(value: BusinessStatus | 'all') {
    this.store.setFilter({ businessStatus: value });
  }

  onTrainNumberChange(value: string) {
    this.trainNumber.set(value ?? '');
    this.store.setFilter({ trainNumber: value ?? '' });
  }
}
