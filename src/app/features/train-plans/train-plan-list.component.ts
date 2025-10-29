import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import {
  TrainPlanService,
  TrainPlanSort,
} from '../../core/services/train-plan.service';
import {
  TrainPlan,
  TrainPlanSourceType,
  TrainPlanStatus,
} from '../../core/models/train-plan.model';
import {
  OrderItemOption,
  OrderService,
} from '../../core/services/order.service';

interface SortOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-train-plan-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS],
  templateUrl: './train-plan-list.component.html',
  styleUrl: './train-plan-list.component.scss',
})
export class TrainPlanListComponent {
  private readonly plansService = inject(TrainPlanService);
  private readonly orderService = inject(OrderService);

  readonly searchControl = new FormControl('', { nonNullable: true });

  readonly filters = computed(() => this.plansService.filters());
  readonly sort = computed(() => this.plansService.sort());
  readonly plans = computed(() => this.plansService.filteredPlans());
  readonly responsibleRus = computed(() => this.plansService.responsibleRus());
  readonly orderItemOptions = computed<OrderItemOption[]>(() =>
    this.orderService.orderItemOptions(),
  );

  readonly statusLabels: Record<TrainPlanStatus, string> = {
    not_ordered: 'Nicht bestellt',
    requested: 'Angefragt',
    offered: 'Im Angebot',
    confirmed: 'Bestätigt',
    operating: 'Unterwegs',
    canceled: 'Storniert',
  };

  readonly sourceLabels: Record<TrainPlanSourceType, string> = {
    rollout: 'Rollout',
    ttt: 'TTT',
    external: 'Externe Quelle',
  };

  readonly statusOptions: { value: TrainPlanStatus | 'all'; label: string }[] =
    [
      { value: 'all', label: 'Alle Status' },
      { value: 'not_ordered', label: 'Nicht bestellt' },
      { value: 'requested', label: 'Angefragt' },
      { value: 'offered', label: 'Im Angebot' },
      { value: 'confirmed', label: 'Bestätigt' },
      { value: 'operating', label: 'Unterwegs' },
      { value: 'canceled', label: 'Storniert' },
    ];

  readonly sourceOptions: {
    value: TrainPlanSourceType | 'all';
    label: string;
  }[] = [
    { value: 'all', label: 'Alle Quellen' },
    { value: 'rollout', label: 'Rollout' },
    { value: 'ttt', label: 'TTT Path Request' },
    { value: 'external', label: 'Externe Systeme' },
  ];

  readonly sortOptions: SortOption[] = [
    { value: 'updatedAt:desc', label: 'Zuletzt aktualisiert' },
    { value: 'trainNumber:asc', label: 'Zugnummer (aufsteigend)' },
    { value: 'status:asc', label: 'Status' },
    { value: 'title:asc', label: 'Titel' },
  ];

  constructor() {
    this.searchControl.setValue(this.filters().search, { emitEvent: false });

    this.searchControl.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => this.plansService.setFilters({ search: value }));

    effect(() => {
      const current = this.filters().search;
      if (this.searchControl.value !== current) {
        this.searchControl.setValue(current, { emitEvent: false });
      }
    });
  }

  onStatusFilterChange(value: TrainPlanStatus | 'all') {
    this.plansService.setFilters({ status: value });
  }

  onSourceFilterChange(value: TrainPlanSourceType | 'all') {
    this.plansService.setFilters({ source: value });
  }

  onRuFilterChange(value: string | 'all') {
    this.plansService.setFilters({ responsibleRu: value });
  }

  onSortChange(value: string) {
    const [field, direction] = value.split(':') as [
      TrainPlanSort['field'],
      TrainPlanSort['direction'],
    ];
    this.plansService.setSort({ field, direction });
  }

  sortSelection(sort: TrainPlanSort): string {
    return `${sort.field}:${sort.direction}`;
  }

  calendarLabel(plan: TrainPlan): string {
    const toPart = plan.calendar.validTo
      ? ` – ${plan.calendar.validTo}`
      : ' – offen';
    return `${plan.calendar.validFrom}${toPart}`;
  }

  linkedOrderLabel(plan: TrainPlan): string | undefined {
    if (!plan.linkedOrderItemId) {
      return undefined;
    }
    const option = this.orderItemOptions().find(
      (item) => item.itemId === plan.linkedOrderItemId,
    );
    if (!option) {
      return plan.linkedOrderItemId;
    }
    return `${option.orderName} · ${option.itemName}`;
  }

  timelineTime(stopTime?: string, offset?: number): string | undefined {
    if (!stopTime) {
      return undefined;
    }
    return offset && offset !== 0 ? `${stopTime} (+${offset}T)` : stopTime;
  }

  statusClass(plan: TrainPlan): string {
    return `status-${plan.status.replace(/_/g, '-')}`;
  }

  stopTypeLabel(type: TrainPlan['stops'][number]['type']): string {
    switch (type) {
      case 'origin':
        return 'Start';
      case 'destination':
        return 'Ziel';
      default:
        return 'Halt';
    }
  }

  trackByPlanId(_: number, plan: TrainPlan) {
    return plan.id;
  }

  trackByStopId(_: number, stop: TrainPlan['stops'][number]) {
    return stop.id;
  }
}
