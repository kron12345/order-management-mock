import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MATERIAL_IMPORTS } from '../../../core/material.imports.imports';
import { OrderItem } from '../../../core/models/order-item.model';
import {
  Business,
  BusinessStatus,
} from '../../../core/models/business.model';
import { BusinessService } from '../../../core/services/business.service';
import { TrafficPeriodService } from '../../../core/services/traffic-period.service';
import { ScheduleTemplateService } from '../../../core/services/schedule-template.service';
import { TrainPlanService } from '../../../core/services/train-plan.service';
import { Router } from '@angular/router';
import { TrainPlanStatus } from '../../../core/models/train-plan.model';
import { MatDialog } from '@angular/material/dialog';
import { OrderItemEditDialogComponent } from '../order-item-edit-dialog/order-item-edit-dialog.component';

@Component({
  selector: 'app-order-item-list',
  standalone: true,
  imports: [CommonModule, ...MATERIAL_IMPORTS],
  templateUrl: './order-item-list.component.html',
  styleUrl: './order-item-list.component.scss',
})
export class OrderItemListComponent {
  @Input({ required: true }) items!: OrderItem[];
  @Input({ required: true }) orderId!: string;

  get orderedItems(): OrderItem[] {
    if (!this.items) {
      return [];
    }
    return [...this.items].sort((a, b) => {
      const aPath = a.versionPath;
      const bPath = b.versionPath;
      if (!aPath?.length && !bPath?.length) {
        return this.items.indexOf(a) - this.items.indexOf(b);
      }
      if (!aPath?.length) {
        return 1;
      }
      if (!bPath?.length) {
        return -1;
      }
      const minLength = Math.min(aPath.length, bPath.length);
      for (let i = 0; i < minLength; i++) {
        const aValue = aPath[i];
        const bValue = bPath[i];
        if (aValue !== bValue) {
          return aValue - bValue;
        }
      }
      if (aPath.length !== bPath.length) {
        return aPath.length - bPath.length;
      }
      return this.items.indexOf(a) - this.items.indexOf(b);
    });
  }

  private readonly statusLabels: Record<BusinessStatus, string> = {
    neu: 'Neu',
    pausiert: 'Pausiert',
    in_arbeit: 'In Arbeit',
    erledigt: 'Erledigt',
  };
  private readonly itemTypeLabels: Record<OrderItem['type'], string> = {
    Leistung: 'Leistung',
    Fahrplan: 'Fahrplan',
  };
  private readonly trainPlanStatusLabels: Partial<Record<TrainPlanStatus, string>> =
    {
      requested: 'Angefragt',
      offered: 'Angeboten',
      confirmed: 'Bestätigt',
      operating: 'In Betrieb',
      canceled: 'Storniert',
      not_ordered: 'Nicht bestellt',
    };

  constructor(
    private readonly businessService: BusinessService,
    private readonly trafficPeriodService: TrafficPeriodService,
    private readonly templateService: ScheduleTemplateService,
    private readonly trainPlanService: TrainPlanService,
    private readonly router: Router,
    private readonly dialog: MatDialog,
  ) {}

  businessesForItem(item: OrderItem): Business[] {
    return this.businessService.getByIds(item.linkedBusinessIds ?? []);
  }

  navigateToTrainPlan(event: MouseEvent, trainPlanId: string) {
    event.stopPropagation();
    this.router.navigate(['/plans'], {
      queryParams: { highlightPlan: trainPlanId },
    });
  }

  typeLabel(item: OrderItem): string {
    return this.itemTypeLabels[item.type] ?? item.type;
  }

  statusLabel(status: BusinessStatus): string {
    return this.statusLabels[status];
  }

  assignmentLabel(business: Business): string {
    return business.assignment.type === 'group'
      ? `Gruppe ${business.assignment.name}`
      : business.assignment.name;
  }

  assignmentIcon(business: Business): string {
    return business.assignment.type === 'group' ? 'groups' : 'person';
  }

  trafficPeriodName(id: string | undefined): string | undefined {
    if (!id) {
      return undefined;
    }
    return this.trafficPeriodService.getById(id)?.name;
  }

  navigateToTrafficPeriod(event: MouseEvent, periodId: string) {
    event.stopPropagation();
    this.router.navigate(['/templates'], {
      queryParams: {
        tab: 'traffic-periods',
        highlightPeriod: periodId,
      },
    });
  }

  templateName(id: string | undefined): string | undefined {
    if (!id) {
      return undefined;
    }
    return this.templateService.getById(id)?.title;
  }

  navigateToTemplate(event: MouseEvent, templateId: string) {
    event.stopPropagation();
    this.router.navigate(['/templates'], {
      queryParams: {
        tab: 'templates',
        highlightTemplate: templateId,
      },
    });
  }

  trainPlanLabel(id: string | undefined): string | undefined {
    if (!id) {
      return undefined;
    }
    const plan = this.trainPlanService.getById(id);
    return plan ? `${plan.trainNumber} · ${plan.calendar.validFrom}` : undefined;
  }

  trainPlanStatus(
    item: OrderItem,
  ): { label: string; cssClass: string } | undefined {
    if (!item.linkedTrainPlanId) {
      return undefined;
    }
    const plan = this.trainPlanService.getById(item.linkedTrainPlanId);
    const status = plan?.status;
    if (!status) {
      return undefined;
    }
    const label =
      this.trainPlanStatusLabels[status] ?? this.fallbackStatusLabel(status);
    return {
      label,
      cssClass: `status-${this.normalizeStatusValue(status)}`,
    };
  }

  private fallbackStatusLabel(value: string): string {
    return value
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/(^|\s)\S/g, (match) => match.toUpperCase());
  }

  private normalizeStatusValue(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  hasSchedule(item: OrderItem): boolean {
    return Boolean(item.start && item.end);
  }

  versionLabel(item: OrderItem): string | undefined {
    if (!item.versionPath?.length) {
      return undefined;
    }
    return item.versionPath.join('.');
  }

  parentVersionLabel(item: OrderItem): string | undefined {
    if (!item.versionPath || item.versionPath.length <= 1) {
      return undefined;
    }
    return item.versionPath.slice(0, -1).join('.');
  }

  isChildVersion(item: OrderItem): boolean {
    return !!item.versionPath && item.versionPath.length > 1;
  }

  versionDepthClass(item: OrderItem): string | undefined {
    if (!item.versionPath?.length) {
      return undefined;
    }
    return `version-depth-${item.versionPath.length}`;
  }

  validitySummary(item: OrderItem): string | undefined {
    if (!item.validity?.length) {
      return undefined;
    }
    return item.validity
      .map((segment) => `${segment.startDate}–${segment.endDate}`)
      .join(', ');
  }

  openEditDialog(item: OrderItem, orderId: string) {
    this.dialog.open(OrderItemEditDialogComponent, {
      width: '640px',
      data: {
        orderId,
        item,
      },
    });
  }

  onBusinessCardClick(event: MouseEvent, businessId: string): void {
    const target = event.target as HTMLElement;
    if (target.closest('a, button')) {
      return;
    }
    this.navigateToBusiness(businessId);
  }

  onBusinessCardKeydown(event: KeyboardEvent, businessId: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.navigateToBusiness(businessId);
    }
  }

  private navigateToBusiness(businessId: string): void {
    this.router.navigate(['/businesses'], { fragment: businessId });
  }
}
