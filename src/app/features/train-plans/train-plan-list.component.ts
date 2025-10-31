import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
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
import { ActivatedRoute, Router } from '@angular/router';

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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  readonly searchControl = new FormControl('', { nonNullable: true });

  readonly filters = computed(() => this.plansService.filters());
  readonly sort = computed(() => this.plansService.sort());
  readonly plans = computed(() => this.plansService.filteredPlans());
  readonly responsibleRus = computed(() => this.plansService.responsibleRus());
  readonly orderItemOptions = computed<OrderItemOption[]>(() =>
    this.orderService.orderItemOptions(),
  );
  private readonly highlightPlanId = signal<string | null>(null);

  readonly statusLabels: Record<TrainPlanStatus, string> = {
    not_ordered: 'Nicht bestellt',
    requested: 'Angefragt',
    offered: 'Im Angebot',
    confirmed: 'Bestätigt',
    operating: 'Unterwegs',
    canceled: 'Storniert',
    modification_request: 'Modifikation bestellen',
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
      { value: 'modification_request', label: 'Modifikation bestellen' },
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

    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const highlight = params.get('highlightPlan');
        this.highlightPlanId.set(highlight);
        window.setTimeout(() => this.scrollToHighlightedPlan(), 0);
      });

    effect(() => {
      this.plans();
      window.setTimeout(() => this.scrollToHighlightedPlan(), 0);
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

  planElementId(id: string): string {
    return `plan-${id}`;
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

  private scrollToHighlightedPlan() {
    const highlight = this.highlightPlanId();
    if (!highlight) {
      return;
    }
    const element = this.document.getElementById(this.planElementId(highlight));
    if (!element) {
      return;
    }
    this.highlightPlanId.set(null);
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    element.classList.add('plan-card--highlight');
    window.setTimeout(() => {
      element.classList.remove('plan-card--highlight');
    }, 2000);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { highlightPlan: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
