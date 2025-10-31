import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { inject } from '@angular/core';
import { MATERIAL_IMPORTS } from '../../../core/material.imports.imports';
import { OrderItem } from '../../../core/models/order-item.model';
import {
  OrderItemUpdateData,
  OrderService,
  SplitOrderItemPayload,
} from '../../../core/services/order.service';
import { TrafficPeriodService } from '../../../core/services/traffic-period.service';
import { TrainPlanService } from '../../../core/services/train-plan.service';
import { TrainPlan } from '../../../core/models/train-plan.model';
import { ScheduleTemplateService } from '../../../core/services/schedule-template.service';
import { ScheduleTemplate } from '../../../core/models/schedule-template.model';
import { PlanModificationDialogComponent } from '../plan-modification-dialog/plan-modification-dialog.component';
import { OrderItemGeneralFieldsComponent } from '../shared/order-item-general-fields/order-item-general-fields.component';
import { OrderItemServiceFieldsComponent } from '../shared/order-item-service-fields/order-item-service-fields.component';
import { OrderItemRangeFieldsComponent } from '../shared/order-item-range-fields/order-item-range-fields.component';

interface OrderItemEditDialogData {
  orderId: string;
  item: OrderItem;
}

interface OrderItemEditFormModel {
  rangeStart: FormControl<string>;
  rangeEnd: FormControl<string>;
  name: FormControl<string>;
  responsible: FormControl<string>;
  deviation: FormControl<string>;
  serviceType: FormControl<string>;
  fromLocation: FormControl<string>;
  toLocation: FormControl<string>;
  trafficPeriodId: FormControl<string>;
  startDateTime: FormControl<string>;
  endDateTime: FormControl<string>;
  linkedTrainPlanId: FormControl<string>;
  linkedTemplateId: FormControl<string>;
}

@Component({
  selector: 'app-order-item-edit-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ...MATERIAL_IMPORTS,
    OrderItemGeneralFieldsComponent,
    OrderItemServiceFieldsComponent,
    OrderItemRangeFieldsComponent,
  ],
  templateUrl: './order-item-edit-dialog.component.html',
  styleUrl: './order-item-edit-dialog.component.scss',
})
export class OrderItemEditDialogComponent {
  private readonly dialogRef =
    inject<MatDialogRef<OrderItemEditDialogComponent>>(MatDialogRef);
  private readonly data = inject<OrderItemEditDialogData>(MAT_DIALOG_DATA);
  private readonly orderService = inject(OrderService);
  private readonly trafficPeriodService = inject(TrafficPeriodService);
  private readonly trainPlanService = inject(TrainPlanService);
  private readonly templateService = inject(ScheduleTemplateService);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);

  readonly form: FormGroup<OrderItemEditFormModel>;
  readonly errorMessage = signal<string | null>(null);
  readonly availablePeriods = computed(() =>
    this.trafficPeriodService.periods(),
  );
  readonly availablePlans = computed<TrainPlan[]>(() =>
    this.trainPlanService.plans(),
  );
  readonly availableTemplates = computed<ScheduleTemplate[]>(() =>
    this.templateService.templates(),
  );
  readonly item = this.data.item;
  readonly orderId = this.data.orderId;
  readonly isServiceItem = this.item.type === 'Leistung';
  readonly isPlanItem = this.item.type === 'Fahrplan';
  readonly serviceFieldsConfig = {
    startControl: 'startDateTime',
    endControl: 'endDateTime',
    serviceTypeControl: 'serviceType',
    fromControl: 'fromLocation',
    toControl: 'toLocation',
    trafficPeriodControl: 'trafficPeriodId',
  } as const;

  constructor() {
    const defaultValidity = this.determineDefaultValidity();
    this.form = this.fb.group({
      rangeStart: this.fb.control(defaultValidity.start, {
        nonNullable: true,
        validators: [Validators.required],
      }),
      rangeEnd: this.fb.control(defaultValidity.end, {
        nonNullable: true,
        validators: [Validators.required],
      }),
      name: this.fb.control(this.item.name ?? '', { nonNullable: true }),
      responsible: this.fb.control(this.item.responsible ?? '', {
        nonNullable: true,
      }),
      deviation: this.fb.control(this.item.deviation ?? '', {
        nonNullable: true,
      }),
      serviceType: this.fb.control(this.item.serviceType ?? '', {
        nonNullable: true,
        validators: this.isServiceItem ? [Validators.required] : [],
      }),
      fromLocation: this.fb.control(this.item.fromLocation ?? '', {
        nonNullable: true,
        validators: this.isServiceItem ? [Validators.required] : [],
      }),
      toLocation: this.fb.control(this.item.toLocation ?? '', {
        nonNullable: true,
        validators: this.isServiceItem ? [Validators.required] : [],
      }),
      trafficPeriodId: this.fb.control(this.item.trafficPeriodId ?? '', {
        nonNullable: true,
        validators: this.isServiceItem ? [Validators.required] : [],
      }),
      startDateTime: this.fb.control(
        this.normalizeDateTimeForInput(this.item.start),
        {
          nonNullable: true,
          validators: this.isServiceItem ? [Validators.required] : [],
        },
      ),
      endDateTime: this.fb.control(
        this.normalizeDateTimeForInput(this.item.end),
        {
          nonNullable: true,
          validators: this.isServiceItem ? [Validators.required] : [],
        },
      ),
      linkedTrainPlanId: this.fb.control(this.item.linkedTrainPlanId ?? '', {
        nonNullable: true,
      }),
      linkedTemplateId: this.fb.control(this.item.linkedTemplateId ?? '', {
        nonNullable: true,
      }),
    });

    if (!this.isServiceItem) {
      this.form.controls.serviceType.disable();
      this.form.controls.fromLocation.disable();
      this.form.controls.toLocation.disable();
      this.form.controls.startDateTime.disable();
      this.form.controls.endDateTime.disable();
    }
    if (!this.isPlanItem) {
      this.form.controls.linkedTrainPlanId.disable();
      this.form.controls.linkedTemplateId.disable();
    }
    if (this.isPlanItem) {
      this.form.controls.rangeStart.disable();
      this.form.controls.rangeEnd.disable();
      this.form.controls.trafficPeriodId.disable();
    }
  }

  currentPlan(): TrainPlan | undefined {
    const planId = this.item.linkedTrainPlanId;
    return planId ? this.trainPlanService.getById(planId) : undefined;
  }

  openPlanModificationDialog() {
    const plan = this.currentPlan();
    if (!plan) {
      this.errorMessage.set('Für diese Auftragsposition ist kein Fahrplan verknüpft.');
      return;
    }

    this.dialog
      .open(PlanModificationDialogComponent, {
        width: '95vw',
        maxWidth: '1200px',
        maxHeight: '95vh',
        data: {
          orderId: this.orderId,
          item: this.item,
          plan,
        },
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result?.updatedPlanId) {
          return;
        }
        this.syncItemState();
      });
  }

  private syncItemState() {
    const order = this.orderService.getOrderById(this.orderId);
    const refreshed = order?.items.find((entry) => entry.id === this.item.id);
    if (!refreshed) {
      return;
    }
    Object.assign(this.item, refreshed);
    this.form.patchValue(
      {
        responsible: this.item.responsible ?? '',
        trafficPeriodId: this.item.trafficPeriodId ?? '',
      },
      { emitEvent: false },
    );
  }

  cancel() {
    this.dialogRef.close();
  }

  submit() {
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    if (this.isServiceItem) {
      const startIso = this.toIsoDateTime(value.startDateTime);
      const endIso = this.toIsoDateTime(value.endDateTime);
      if (!startIso || !endIso) {
        this.errorMessage.set('Bitte gültige Start- und Endzeiten angeben.');
        return;
      }
      if (new Date(endIso).getTime() < new Date(startIso).getTime()) {
        this.errorMessage.set('Ende darf nicht vor dem Start liegen.');
        return;
      }
    }

    const payload: SplitOrderItemPayload = {
      orderId: this.data.orderId,
      itemId: this.item.id,
      rangeStart: value.rangeStart,
      rangeEnd: value.rangeEnd,
      updates: this.buildUpdates(value),
    };

    try {
      const result = this.orderService.splitOrderItem(payload);
      this.handlePostSplitAdjustments(result.created, value);
      this.dialogRef.close(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Auftragsposition konnte nicht bearbeitet werden.';
      this.errorMessage.set(message);
    }
  }

  validityLabel(): string {
    if (this.isPlanItem) {
      const plan = this.currentPlan();
      if (!plan) {
        return 'Aktuelle Gültigkeit: Kein Fahrplan gefunden.';
      }
      const labelParts: string[] = [];
      if (plan.trafficPeriodId) {
        const period =
          this.trafficPeriodService.getById(plan.trafficPeriodId)?.name ??
          plan.trafficPeriodId;
        labelParts.push(`Verkehrsperiode ${period}`);
      }
      const rangeParts: string[] = [];
      if (plan.calendar.validFrom) {
        rangeParts.push(plan.calendar.validFrom);
      }
      if (plan.calendar.validTo && plan.calendar.validTo !== plan.calendar.validFrom) {
        rangeParts.push(plan.calendar.validTo);
      }
      if (rangeParts.length) {
        labelParts.push(
          `Kalender ${rangeParts.join(' – ')}`,
        );
      }
      if (!labelParts.length) {
        return 'Aktuelle Gültigkeit: Wird vom Fahrplan gesteuert.';
      }
      return `Aktuelle Gültigkeit: ${labelParts.join(' · ')}`;
    }

    if (!this.item.validity?.length) {
      return 'Keine Gültigkeitstage hinterlegt';
    }
    const segments = this.item.validity
      .map((segment) => `${segment.startDate} – ${segment.endDate}`)
      .join(', ');
    return `Aktuelle Gültigkeit: ${segments}`;
  }

  planLabel(plan: TrainPlan): string {
    return `${plan.trainNumber} · ${plan.calendar.validFrom}`;
  }

  templateLabel(template: ScheduleTemplate): string {
    return `${template.title} · ${template.id}`;
  }

  private determineDefaultValidity(): { start: string; end: string } {
    if (this.isPlanItem) {
      const plan = this.currentPlan();
      if (plan?.calendar.validFrom) {
        const startDate = plan.calendar.validFrom;
        const endDate = plan.calendar.validTo ?? plan.calendar.validFrom;
        return {
          start: startDate,
          end: endDate,
        };
      }
    }

    const firstSegment = this.item.validity?.[0];
    if (firstSegment) {
      const lastSegment =
        this.item.validity?.[this.item.validity.length - 1] ?? firstSegment;
      return {
        start: firstSegment.startDate,
        end: lastSegment.endDate,
      };
    }
    const fallback = this.item.start?.slice(0, 10);
    return {
      start: fallback ?? '',
      end: this.item.end?.slice(0, 10) ?? fallback ?? '',
    };
  }

  private buildUpdates(
    value: ReturnType<FormGroup<OrderItemEditFormModel>['getRawValue']>,
  ): Partial<OrderItemUpdateData> | undefined {
    const updates: Partial<OrderItemUpdateData> = {};
    const controls = this.form.controls;

    if (controls.name.dirty) {
      updates.name = this.normalizeOptionalString(value.name);
    }
    if (controls.responsible.dirty) {
      updates.responsible = this.normalizeOptionalString(value.responsible);
    }
    if (controls.deviation.dirty) {
      updates.deviation = this.normalizeOptionalString(value.deviation);
    }
    if (this.isServiceItem && controls.serviceType.dirty) {
      updates.serviceType = this.normalizeOptionalString(value.serviceType);
    }
    if (this.isServiceItem && controls.fromLocation.dirty) {
      updates.fromLocation = this.normalizeOptionalString(value.fromLocation);
    }
    if (this.isServiceItem && controls.toLocation.dirty) {
      updates.toLocation = this.normalizeOptionalString(value.toLocation);
    }
    if (controls.trafficPeriodId.dirty) {
      updates.trafficPeriodId = this.normalizeOptionalString(
        value.trafficPeriodId,
      );
    }
    if (this.isServiceItem && controls.startDateTime.dirty) {
      updates.start = this.toIsoDateTime(value.startDateTime);
    }
    if (this.isServiceItem && controls.endDateTime.dirty) {
      updates.end = this.toIsoDateTime(value.endDateTime);
    }
    if (this.isPlanItem && controls.linkedTrainPlanId.dirty) {
      updates.linkedTrainPlanId = this.normalizeOptionalString(
        value.linkedTrainPlanId,
      );
    }
    if (this.isPlanItem && controls.linkedTemplateId.dirty) {
      updates.linkedTemplateId = this.normalizeOptionalString(
        value.linkedTemplateId,
      );
    }

    return Object.keys(updates).length ? updates : undefined;
  }

  private normalizeOptionalString(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }

  private normalizeDateTimeForInput(value: string | undefined): string {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const year = date.getFullYear().toString().padStart(4, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  private toIsoDateTime(value: string): string | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }
    return parsed.toISOString();
  }

  private handlePostSplitAdjustments(
    created: OrderItem,
    formValue: ReturnType<FormGroup<OrderItemEditFormModel>['getRawValue']>,
  ) {
    if (!this.isPlanItem) {
      return;
    }
    const newPlanId = this.normalizeOptionalString(formValue.linkedTrainPlanId);
    const prevPlanId = this.item.linkedTrainPlanId;
    if (newPlanId && newPlanId !== prevPlanId) {
      this.orderService.linkTrainPlanToItem(newPlanId, created.id);
    }
  }
}
