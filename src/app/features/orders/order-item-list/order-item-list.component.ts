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

@Component({
  selector: 'app-order-item-list',
  standalone: true,
  imports: [CommonModule, ...MATERIAL_IMPORTS],
  templateUrl: './order-item-list.component.html',
  styleUrl: './order-item-list.component.scss',
})
export class OrderItemListComponent {
  @Input({ required: true }) items!: OrderItem[];

  private readonly statusLabels: Record<BusinessStatus, string> = {
    neu: 'Neu',
    pausiert: 'Pausiert',
    in_arbeit: 'In Arbeit',
    erledigt: 'Erledigt',
  };

  constructor(
    private readonly businessService: BusinessService,
    private readonly trafficPeriodService: TrafficPeriodService,
    private readonly templateService: ScheduleTemplateService,
    private readonly trainPlanService: TrainPlanService,
  ) {}

  businessesForItem(item: OrderItem): Business[] {
    return this.businessService.getByIds(item.linkedBusinessIds ?? []);
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

  templateName(id: string | undefined): string | undefined {
    if (!id) {
      return undefined;
    }
    return this.templateService.getById(id)?.title;
  }

  trainPlanLabel(id: string | undefined): string | undefined {
    if (!id) {
      return undefined;
    }
    const plan = this.trainPlanService.getById(id);
    return plan ? `${plan.trainNumber} · ${plan.calendar.validFrom}` : undefined;
  }
}
