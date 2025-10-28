import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
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

interface SortOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-business-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS],
  templateUrl: './business-list.component.html',
  styleUrl: './business-list.component.scss',
})
export class BusinessListComponent {
  private readonly businessService = inject(BusinessService);
  private readonly orderService = inject(OrderService);
  private readonly dialog = inject(MatDialog);

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

  private readonly statusLabels: Record<BusinessStatus, string> = {
    neu: 'Neu',
    pausiert: 'Pausiert',
    in_arbeit: 'In Arbeit',
    erledigt: 'Erledigt',
  };

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

  onStatusChange(id: string, status: BusinessStatus): void {
    this.businessService.updateStatus(id, status);
  }

  onLinkedItemsChange(id: string, itemIds: string[]): void {
    this.businessService.setLinkedOrderItems(id, itemIds);
  }

  removeLinkedItem(id: string, itemId: string): void {
    const current = this.businessService
      .businesses()
      .find((business) => business.id === id)?.linkedOrderItemIds ?? [];
    const next = current.filter((existing) => existing !== itemId);
    this.businessService.setLinkedOrderItems(id, next);
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

  itemLabel(itemId: string): string {
    const option = this.orderItemOptions().find(
      (entry) => entry.itemId === itemId,
    );
    if (!option) {
      return itemId;
    }
    return `${option.orderName} · ${option.itemName}`;
  }

  trackByBusinessId(_: number, business: Business): string {
    return business.id;
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
}
