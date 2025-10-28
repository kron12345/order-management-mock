import { Injectable, computed, signal } from '@angular/core';
import {
  Business,
  BusinessAssignment,
  BusinessDocument,
  BusinessStatus,
} from '../models/business.model';
import { MOCK_BUSINESSES } from '../mock/mock-businesses.mock';
import { OrderService } from './order.service';

export type BusinessDueDateFilter =
  | 'all'
  | 'overdue'
  | 'today'
  | 'this_week'
  | 'next_week';

export interface BusinessFilters {
  search: string;
  status: BusinessStatus | 'all';
  dueDate: BusinessDueDateFilter;
  assignment: 'all' | string;
}

export type BusinessSortField = 'dueDate' | 'createdAt' | 'status' | 'title';

export interface BusinessSort {
  field: BusinessSortField;
  direction: 'asc' | 'desc';
}

export interface CreateBusinessPayload {
  title: string;
  description: string;
  dueDate?: Date | null;
  assignment: BusinessAssignment;
  documents?: BusinessDocument[];
  linkedOrderItemIds?: string[];
}

@Injectable({ providedIn: 'root' })
export class BusinessService {
  private readonly _businesses = signal<Business[]>(MOCK_BUSINESSES);
  private readonly _filters = signal<BusinessFilters>({
    search: '',
    status: 'all',
    dueDate: 'all',
    assignment: 'all',
  });
  private readonly _sort = signal<BusinessSort>({
    field: 'dueDate',
    direction: 'asc',
  });

  readonly businesses = computed(() => this._businesses());
  readonly filters = computed(() => this._filters());
  readonly sort = computed(() => this._sort());
  readonly filteredBusinesses = computed(() => {
    const filters = this._filters();
    const sort = this._sort();
    const now = new Date();
    return this._businesses()
      .filter((business) => this.matchesFilters(business, filters, now))
      .sort((a, b) => this.sortBusinesses(a, b, sort));
  });
  readonly assignments = computed(() =>
    Array.from(
      new Map(
        this._businesses().map((b) => [
          b.assignment.name.toLowerCase(),
          b.assignment,
        ]),
      ).values(),
    ),
  );

  constructor(private readonly orderService: OrderService) {}

  getByIds(ids: readonly string[]): Business[] {
    if (!ids.length) {
      return [];
    }

    const businessById = new Map(this._businesses().map((b) => [b.id, b]));
    return ids.reduce<Business[]>((acc, id) => {
      const business = businessById.get(id);
      if (business) {
        acc.push(business);
      }
      return acc;
    }, []);
  }

  setFilters(patch: Partial<BusinessFilters>) {
    this._filters.update((current) => ({ ...current, ...patch }));
  }

  resetFilters() {
    this._filters.set({
      search: '',
      status: 'all',
      dueDate: 'all',
      assignment: 'all',
    });
  }

  setSort(sort: BusinessSort) {
    this._sort.set(sort);
  }

  createBusiness(payload: CreateBusinessPayload) {
    const id = this.generateBusinessId();
    const linkedIds = payload.linkedOrderItemIds ?? [];
    const newBusiness: Business = {
      id,
      title: payload.title,
      description: payload.description,
      createdAt: new Date().toISOString(),
      dueDate: payload.dueDate ? payload.dueDate.toISOString() : undefined,
      status: 'neu',
      assignment: payload.assignment,
      documents: payload.documents,
      linkedOrderItemIds: linkedIds.length ? [...new Set(linkedIds)] : undefined,
    };

    this._businesses.update((businesses) => [newBusiness, ...businesses]);
    linkedIds.forEach((itemId) =>
      this.orderService.linkBusinessToItem(id, itemId),
    );
  }

  updateBusiness(businessId: string, patch: Partial<Omit<Business, 'id'>>) {
    this._businesses.update((businesses) =>
      businesses.map((business) =>
        business.id === businessId ? { ...business, ...patch } : business,
      ),
    );
  }

  updateStatus(businessId: string, status: BusinessStatus) {
    this.updateBusiness(businessId, { status });
  }

  setLinkedOrderItems(businessId: string, itemIds: string[]) {
    const business = this._businesses().find((b) => b.id === businessId);
    if (!business) {
      return;
    }

    const nextIds = Array.from(new Set(itemIds));
    const previousIds = new Set(business.linkedOrderItemIds ?? []);

    const toLink = nextIds.filter((id) => !previousIds.has(id));
    const toUnlink = Array.from(previousIds).filter(
      (id) => !nextIds.includes(id),
    );

    this._businesses.update((businesses) =>
      businesses.map((b) =>
        b.id === businessId
          ? {
              ...b,
              linkedOrderItemIds: nextIds.length ? nextIds : undefined,
            }
          : b,
      ),
    );

    toLink.forEach((itemId) =>
      this.orderService.linkBusinessToItem(businessId, itemId),
    );
    toUnlink.forEach((itemId) =>
      this.orderService.unlinkBusinessFromItem(businessId, itemId),
    );
  }

  private matchesFilters(
    business: Business,
    filters: BusinessFilters,
    now: Date,
  ): boolean {
    if (filters.search) {
      const haystack =
        `${business.title} ${business.description}`.toLowerCase();
      if (!haystack.includes(filters.search.toLowerCase())) {
        return false;
      }
    }

    if (filters.status !== 'all' && business.status !== filters.status) {
      return false;
    }

    if (filters.assignment !== 'all') {
      if (business.assignment.name !== filters.assignment) {
        return false;
      }
    }

    if (filters.dueDate !== 'all') {
      const due = business.dueDate ? new Date(business.dueDate) : undefined;
      if (!due) {
        return false;
      }
      switch (filters.dueDate) {
        case 'overdue':
          if (!this.isBeforeDay(due, now)) {
            return false;
          }
          break;
        case 'today':
          if (!this.isSameDay(due, now)) {
            return false;
          }
          break;
        case 'this_week':
          if (!this.isWithinWeek(due, now, 0)) {
            return false;
          }
          break;
        case 'next_week':
          if (!this.isWithinWeek(due, now, 1)) {
            return false;
          }
          break;
      }
    }

    return true;
  }

  private sortBusinesses(a: Business, b: Business, sort: BusinessSort): number {
    const direction = sort.direction === 'asc' ? 1 : -1;
    switch (sort.field) {
      case 'dueDate': {
        const dueA = a.dueDate ? new Date(a.dueDate).getTime() : undefined;
        const dueB = b.dueDate ? new Date(b.dueDate).getTime() : undefined;
        if (dueA === dueB) {
          return this.compareStrings(a.title, b.title) * direction;
        }
        if (dueA === undefined) {
          return 1;
        }
        if (dueB === undefined) {
          return -1;
        }
        return (dueA - dueB) * direction;
      }
      case 'createdAt': {
        return (
          (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) *
          direction
        );
      }
      case 'status': {
        const order: Record<BusinessStatus, number> = {
          neu: 0,
          in_arbeit: 1,
          pausiert: 2,
          erledigt: 3,
        };
        return (order[a.status] - order[b.status]) * direction;
      }
      case 'title':
      default:
        return this.compareStrings(a.title, b.title) * direction;
    }
  }

  private compareStrings(a: string, b: string): number {
    return a.localeCompare(b, 'de', { sensitivity: 'base' });
  }

  private isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  private isBeforeDay(a: Date, b: Date): boolean {
    const aDate = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const bDate = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return aDate.getTime() < bDate.getTime();
  }

  private isWithinWeek(date: Date, reference: Date, offsetWeeks: number) {
    const start = this.getStartOfWeek(reference, offsetWeeks);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return date >= start && date < end;
  }

  private getStartOfWeek(reference: Date, offsetWeeks: number) {
    const start = new Date(reference);
    const day = start.getDay() || 7;
    if (day !== 1) {
      start.setHours(-24 * (day - 1));
    } else {
      start.setHours(0, 0, 0, 0);
    }
    if (offsetWeeks) {
      start.setDate(start.getDate() + offsetWeeks * 7);
    }
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private generateBusinessId(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    return `G-${timestamp}`;
  }
}
