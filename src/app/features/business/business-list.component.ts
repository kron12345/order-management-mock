import { CommonModule, DOCUMENT, DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import {
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import {
  BusinessDueDateFilter,
  BusinessService,
  BusinessSortField,
  CreateBusinessPayload,
} from '../../core/services/business.service';
import {
  Business,
  BusinessStatus,
} from '../../core/models/business.model';
import {
  OrderItemOption,
  OrderService,
} from '../../core/services/order.service';
import { MatDialog } from '@angular/material/dialog';
import { BusinessCreateDialogComponent } from './business-create-dialog.component';
import { ActivatedRoute, Router } from '@angular/router';
import {
  OrderItemPickerDialogComponent,
  OrderItemPickerDialogData,
} from './order-item-picker-dialog.component';

interface SortOption {
  value: string;
  label: string;
}

type BusinessMetric = {
  label: string;
  value: number | string;
  icon: string;
  hint: string;
};

type BusinessHighlight = {
  icon: string;
  label: string;
  filter?: { kind: 'status' | 'assignment'; value: string };
};

@Component({
  selector: 'app-business-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS],
  templateUrl: './business-list.component.html',
  styleUrl: './business-list.component.scss',
  providers: [DatePipe],
})
export class BusinessListComponent {
  private readonly businessService = inject(BusinessService);
  private readonly orderService = inject(OrderService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly datePipe = inject(DatePipe);

  readonly searchControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(80)],
  });

  readonly statusOptions: { value: BusinessStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'Alle' },
    { value: 'neu', label: 'Neu' },
    { value: 'in_arbeit', label: 'In Arbeit' },
    { value: 'pausiert', label: 'Pausiert' },
    { value: 'erledigt', label: 'Erledigt' },
  ];

  readonly dueDatePresetOptions: {
    value: BusinessDueDateFilter;
    label: string;
    icon: string;
  }[] = [
    { value: 'all', label: 'Alle', icon: 'all_inclusive' },
    { value: 'today', label: 'Heute', icon: 'event' },
    { value: 'this_week', label: 'Diese Woche', icon: 'calendar_view_week' },
    { value: 'next_week', label: 'Nächste Woche', icon: 'calendar_month' },
    { value: 'overdue', label: 'Überfällig', icon: 'schedule' },
  ];

  readonly sortOptions: SortOption[] = [
    { value: 'dueDate:asc', label: 'Fälligkeit · aufsteigend' },
    { value: 'dueDate:desc', label: 'Fälligkeit · absteigend' },
    { value: 'status:asc', label: 'Status' },
    { value: 'createdAt:desc', label: 'Erstellt · neueste zuerst' },
    { value: 'title:asc', label: 'Titel A–Z' },
  ];

  readonly assignments = computed(() => this.businessService.assignments());
  readonly filters = computed(() => this.businessService.filters());
  readonly sort = computed(() => this.businessService.sort());
  readonly businesses = computed(() => this.businessService.filteredBusinesses());
  readonly orderItemOptions = computed<OrderItemOption[]>(() =>
    this.orderService.orderItemOptions(),
  );
  readonly orderItemLookup = computed(() => {
    const map = new Map<string, OrderItemOption>();
    this.orderItemOptions().forEach((option) => map.set(option.itemId, option));
    return map;
  });

  private readonly selectedBusinessId = signal<string | null>(null);
  readonly selectedBusiness = computed(() => {
    const id = this.selectedBusinessId();
    if (!id) {
      return null;
    }
    return this.businesses().find((business) => business.id === id) ?? null;
  });

  private readonly statusLabels: Record<BusinessStatus, string> = {
    neu: 'Neu',
    pausiert: 'Pausiert',
    in_arbeit: 'In Arbeit',
    erledigt: 'Erledigt',
  };
  private pendingScrollId: string | null = null;

  constructor() {
    this.searchControl.setValue(this.filters().search, { emitEvent: false });

    this.searchControl.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => {
        this.businessService.setFilters({ search: value });
      });

    effect(() => {
      const next = this.filters().search;
      if (this.searchControl.value !== next) {
        this.searchControl.setValue(next, { emitEvent: false });
      }
    });

    this.route.fragment
      .pipe(takeUntilDestroyed())
      .subscribe((fragment) => {
        this.pendingScrollId = fragment ?? null;
        window.setTimeout(() => this.scrollToPendingBusiness(), 0);
      });

    effect(() => {
      const businesses = this.businesses();
      if (businesses.length && !this.selectedBusinessId()) {
        this.selectedBusinessId.set(businesses[0].id);
      } else if (businesses.length && this.selectedBusinessId()) {
        const exists = businesses.some((biz) => biz.id === this.selectedBusinessId());
        if (!exists) {
          this.selectedBusinessId.set(businesses[0].id);
        }
      } else if (!businesses.length) {
        this.selectedBusinessId.set(null);
      }
      window.setTimeout(() => this.scrollToPendingBusiness(), 0);
    });
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open<
      BusinessCreateDialogComponent,
      { orderItemOptions: OrderItemOption[] },
      CreateBusinessPayload | undefined
    >(BusinessCreateDialogComponent, {
      width: '560px',
      data: {
        orderItemOptions: this.orderItemOptions(),
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.businessService.createBusiness(result);
      }
    });
  }

  onStatusFilterChange(value: BusinessStatus | 'all'): void {
    this.businessService.setFilters({ status: value });
  }

  onAssignmentFilterChange(value: string | 'all'): void {
    this.businessService.setFilters({ assignment: value });
  }

  onDueDatePresetChange(value: BusinessDueDateFilter): void {
    this.businessService.setFilters({ dueDate: value });
  }

  onSortChange(value: string): void {
    const [field, direction] = value.split(':') as [
      BusinessSortField,
      'asc' | 'desc',
    ];
    this.businessService.setSort({ field, direction });
  }

  resetFilters(): void {
    this.searchControl.setValue('', { emitEvent: false });
    this.businessService.resetFilters();
    this.businessService.setSort({ field: 'dueDate', direction: 'asc' });
  }

  onStatusChange(id: string, status: BusinessStatus): void {
    this.businessService.updateStatus(id, status);
  }

  removeLinkedItem(id: string, itemId: string): void {
    const current = this.businessService
      .businesses()
      .find((business) => business.id === id)?.linkedOrderItemIds ?? [];
    const next = current.filter((existing) => existing !== itemId);
    this.businessService.setLinkedOrderItems(id, next);
  }

  deleteBusiness(business: Business): void {
    const confirmed = confirm(`Geschäft "${business.title}" löschen?`);
    if (!confirmed) {
      return;
    }
    this.businessService.deleteBusiness(business.id);
    if (this.selectedBusinessId() === business.id) {
      this.selectedBusinessId.set(null);
    }
  }

  openOrderItemPicker(business: Business): void {
    const dialogRef = this.dialog.open<OrderItemPickerDialogComponent, OrderItemPickerDialogData, string[] | undefined>(
      OrderItemPickerDialogComponent,
      {
        width: '720px',
        data: {
          options: this.orderItemOptions(),
          selectedIds: business.linkedOrderItemIds ?? [],
        },
      },
    );

    dialogRef.afterClosed().subscribe((selection) => {
      if (!selection) {
        return;
      }
      this.businessService.setLinkedOrderItems(business.id, selection);
    });
  }

  openOrderOverview(business: Business): void {
    this.router.navigate(['/'], {
      queryParams: { businessId: business.id },
    });
  }

  goToOrderItem(business: Business, itemId: string): void {
    this.router.navigate(['/'], {
      queryParams: {
        businessId: business.id,
        highlightItem: itemId,
      },
    });
  }

  orderItemMeta(itemId: string): OrderItemOption | undefined {
    return this.orderItemLookup().get(itemId);
  }

  orderItemRange(itemId: string): string | null {
    const meta = this.orderItemMeta(itemId);
    if (!meta?.start && !meta?.end) {
      return null;
    }
    const start = meta?.start
      ? this.datePipe.transform(meta.start, 'short')
      : '—';
    const end = meta?.end ? this.datePipe.transform(meta.end, 'short') : '—';
    return `${start} – ${end}`;
  }

  selectBusiness(business: Business): void {
    this.selectedBusinessId.set(business.id);
  }

  isBusinessSelected(business: Business): boolean {
    return this.selectedBusinessId() === business.id;
  }

  assignmentInitials(business: Business): string {
    return business.assignment.name
      .split(' ')
      .map((chunk) => chunk.trim()[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  businessHighlights(business: Business): BusinessHighlight[] {
    const highlights: BusinessHighlight[] = [];
    highlights.push({
      icon: 'flag',
      label: this.statusLabel(business.status),
      filter: { kind: 'status', value: business.status },
    });
    highlights.push({
      icon: this.assignmentIcon(business),
      label: this.assignmentLabel(business),
      filter: { kind: 'assignment', value: business.assignment.name },
    });
    const dueLabel = business.dueDate
      ? this.datePipe.transform(business.dueDate, 'mediumDate')
      : null;
    const createdLabel = this.datePipe.transform(business.createdAt, 'short') ?? business.createdAt;
    highlights.push({
      icon: 'event_available',
      label: `Erstellt ${createdLabel}`,
    });
    highlights.push({
      icon: 'schedule',
      label: dueLabel ? `Fällig ${dueLabel}` : 'Keine Fälligkeit',
    });
    return highlights;
  }

  applyHighlightFilter(event: MouseEvent, highlight: BusinessHighlight): void {
    if (!highlight.filter) {
      return;
    }
    event.stopPropagation();
    if (highlight.filter.kind === 'status') {
      this.businessService.setFilters({ status: highlight.filter.value as BusinessStatus });
    }
    if (highlight.filter.kind === 'assignment') {
      this.businessService.setFilters({ assignment: highlight.filter.value });
    }
  }

  dueProgress(business: Business): number {
    const created = new Date(business.createdAt).getTime();
    if (!business.dueDate) {
      return 0;
    }
    const due = new Date(business.dueDate).getTime();
    if (Number.isNaN(created) || Number.isNaN(due) || due <= created) {
      return 100;
    }
    const now = Date.now();
    const total = due - created;
    const elapsed = Math.min(Math.max(0, now - created), total);
    return Math.round((elapsed / total) * 100);
  }

  daysUntilDue(business: Business): number | null {
    if (!business.dueDate) {
      return null;
    }
    const due = new Date(business.dueDate);
    const now = new Date();
    const diff = due.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  businessMetrics(business: Business): BusinessMetric[] {
    const linked = business.linkedOrderItemIds?.length ?? 0;
    const docs = business.documents?.length ?? 0;
    const daysLeft = this.daysUntilDue(business);
    return [
      {
        label: 'Positionen',
        value: linked,
        icon: 'work',
        hint: 'Verknüpfte Auftragspositionen',
      },
      {
        label: 'Dokumente',
        value: docs,
        icon: 'attach_file',
        hint: 'Hinterlegte Geschäftsdokumente',
      },
      {
        label: 'Tage übrig',
        value: daysLeft ?? '—',
        icon: 'calendar_today',
        hint: 'Tage bis zur Fälligkeit',
      },
    ];
  }

  assignmentLabel(business: Business): string {
    return business.assignment.type === 'group'
      ? `Gruppe ${business.assignment.name}`
      : business.assignment.name;
  }

  assignmentIcon(business: Business): string {
    return business.assignment.type === 'group' ? 'groups' : 'person';
  }

  statusLabel(status: BusinessStatus): string {
    return this.statusLabels[status];
  }

  dueDateState(business: Business):
    | 'overdue'
    | 'today'
    | 'upcoming'
    | 'none' {
    if (!business.dueDate) {
      return 'none';
    }
    const due = new Date(business.dueDate);
    const today = new Date();
    if (this.isBeforeDay(due, today)) {
      return 'overdue';
    }
    if (this.isSameDay(due, today)) {
      return 'today';
    }
    return 'upcoming';
  }

  trackByBusinessId(_: number, business: Business): string {
    return business.id;
  }

  businessElementId(id: string): string {
    return `business-${id}`;
  }

  private isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  private isBeforeDay(a: Date, b: Date): boolean {
    const startA = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const startB = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return startA.getTime() < startB.getTime();
  }

  private scrollToPendingBusiness(): void {
    if (!this.pendingScrollId) {
      return;
    }
    const element = this.document.getElementById(
      this.businessElementId(this.pendingScrollId),
    );
    if (!element) {
      return;
    }
    this.pendingScrollId = null;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    element.classList.add('business-card--highlight');
    window.setTimeout(() => {
      element.classList.remove('business-card--highlight');
    }, 2000);
  }
}
