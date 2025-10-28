import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
} from '@angular/material/dialog';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import {
  CreatePlanOrderItemsPayload,
  CreateServiceOrderItemPayload,
  OrderService,
} from '../../core/services/order.service';
import { Order } from '../../core/models/order.model';
import { OrderItem } from '../../core/models/order-item.model';
import { ScheduleTemplateService } from '../../core/services/schedule-template.service';
import { TrafficPeriodService } from '../../core/services/traffic-period.service';

interface OrderPositionDialogData {
  order: Order;
}

@Component({
  selector: 'app-order-position-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS],
  templateUrl: './order-position-dialog.component.html',
  styleUrl: './order-position-dialog.component.scss',
})
export class OrderPositionDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<OrderPositionDialogComponent>);
  private readonly data = inject<OrderPositionDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly orderService = inject(OrderService);
  private readonly templateService = inject(ScheduleTemplateService);
  private readonly trafficPeriodService = inject(TrafficPeriodService);

  readonly modeControl = new FormControl<'service' | 'plan'>('service', {
    nonNullable: true,
  });

  readonly serviceForm = this.fb.group({
    name: ['', Validators.required],
    type: this.fb.nonNullable.control<OrderItem['type']>('TTT'),
    serviceType: ['', Validators.required],
    fromLocation: ['', Validators.required],
    toLocation: ['', Validators.required],
    start: ['', Validators.required],
    end: ['', Validators.required],
    responsible: [''],
    deviation: [''],
    trafficPeriodId: ['', Validators.required],
  });

  readonly planForm = this.fb.group({
    templateId: ['', Validators.required],
    trafficPeriodId: ['', Validators.required],
    startTime: ['04:00', Validators.required],
    intervalMinutes: [30, [Validators.required, Validators.min(1)]],
    count: [1, [Validators.required, Validators.min(1)]],
    namePrefix: [''],
    responsible: [''],
  });

  readonly templates = computed(() => this.templateService.templates());
  readonly trafficPeriods = computed(() => this.trafficPeriodService.periods());
  readonly mode = computed(() => this.modeControl.value);
  errorMessage = signal<string | null>(null);

  readonly order = this.data.order;

  constructor() {
    const periodList = this.trafficPeriodService.periods();
    const templateList = this.templateService.templates();

    const firstPeriod = periodList[0];
    const firstTemplate = templateList[0];

    if (firstPeriod) {
      this.serviceForm.controls.trafficPeriodId.setValue(firstPeriod.id);
      this.planForm.controls.trafficPeriodId.setValue(firstPeriod.id);
    }
    if (firstTemplate) {
      this.planForm.controls.templateId.setValue(firstTemplate.id);
      this.planForm.controls.namePrefix.setValue(firstTemplate.title);
    }

    this.serviceForm.controls.name.setValue(`${this.order.name} Position`);
  }

  cancel() {
    this.dialogRef.close();
  }

  save() {
    this.errorMessage.set(null);

    if (this.mode() === 'service') {
      if (this.serviceForm.invalid) {
        this.serviceForm.markAllAsTouched();
        return;
      }
      this.createServiceItem();
    } else {
      if (this.planForm.invalid) {
        this.planForm.markAllAsTouched();
        return;
      }
      this.createPlanItems();
    }
  }

  private createServiceItem() {
    const value = this.serviceForm.getRawValue();
    const start = this.toIso(value.start);
    const end = this.toIso(value.end);
    if (!start || !end) {
      this.errorMessage.set('Bitte gültige Start- und Endzeiten angeben.');
      return;
    }
    if (new Date(end).getTime() < new Date(start).getTime()) {
      this.errorMessage.set('Ende darf nicht vor dem Start liegen.');
      return;
    }

    const payload: CreateServiceOrderItemPayload = {
      orderId: this.order.id,
      name: value.name!,
      type: value.type!,
      serviceType: value.serviceType!,
      fromLocation: value.fromLocation!,
      toLocation: value.toLocation!,
      start,
      end,
      responsible: value.responsible?.trim() || undefined,
      deviation: value.deviation?.trim() || undefined,
      trafficPeriodId: value.trafficPeriodId!,
    };

    this.orderService.addServiceOrderItem(payload);
    this.dialogRef.close(true);
  }

  private createPlanItems() {
    const value = this.planForm.getRawValue();
    const planPayload: CreatePlanOrderItemsPayload = {
      orderId: this.order.id,
      templateId: value.templateId!,
      trafficPeriodId: value.trafficPeriodId!,
      startTime: value.startTime!,
      intervalMinutes: value.intervalMinutes!,
      count: value.count!,
      namePrefix: value.namePrefix?.trim() || undefined,
      responsible: value.responsible?.trim() || undefined,
      responsibleRu: value.responsible?.trim() || undefined,
    };

    try {
      const items = this.orderService.addPlanOrderItems(planPayload);
      if (!items.length) {
        this.errorMessage.set('Es konnten keine Auftragspositionen erzeugt werden.');
        return;
      }
      this.dialogRef.close(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      this.errorMessage.set(message);
    }
  }

  private toIso(value: string | null): string | null {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
}
