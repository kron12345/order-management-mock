import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import {
  CreateScheduleTemplatePayload,
  CreateScheduleTemplateStopPayload,
} from '../../core/services/schedule-template.service';
import { TrainPlanStop } from '../../core/models/train-plan.model';
import { PlanModificationStopInput } from '../../core/services/train-plan.service';
import {
  PlanAssemblyDialogComponent,
  PlanAssemblyDialogData,
  PlanAssemblyDialogResult,
} from '../orders/plan-assembly-dialog/plan-assembly-dialog.component';
import {
  ScheduleTemplateCategory,
  ScheduleTemplateDay,
  ScheduleTemplateStatus,
} from '../../core/models/schedule-template.model';

export interface ScheduleTemplateCreateDialogData {
  defaultStartTime?: string;
  defaultEndTime?: string;
}

type StopFormValue = {
  type: 'origin' | 'intermediate' | 'destination';
  locationName: string;
  locationCode: string;
  countryCode: string | null;
  arrivalEarliest: string | null;
  arrivalLatest: string | null;
  departureEarliest: string | null;
  departureLatest: string | null;
  offsetDays: number | null;
  dwellMinutes: number | null;
  activities: string[];
  platformWish: string | null;
  notes: string | null;
};

type StopFormGroup = FormGroup<{
  type: FormControl<'origin' | 'intermediate' | 'destination'>;
  locationName: FormControl<string>;
  locationCode: FormControl<string>;
  countryCode: FormControl<string | null>;
  arrivalEarliest: FormControl<string | null>;
  arrivalLatest: FormControl<string | null>;
  departureEarliest: FormControl<string | null>;
  departureLatest: FormControl<string | null>;
  offsetDays: FormControl<number | null>;
  dwellMinutes: FormControl<number | null>;
  activities: FormControl<string[]>;
  platformWish: FormControl<string | null>;
  notes: FormControl<string | null>;
}>;

@Component({
  selector: 'app-schedule-template-create-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS],
  templateUrl: './schedule-template-create-dialog.component.html',
  styleUrl: './schedule-template-create-dialog.component.scss',
})
export class ScheduleTemplateCreateDialogComponent {
  private readonly dialogRef = inject<
    MatDialogRef<
      ScheduleTemplateCreateDialogComponent,
      CreateScheduleTemplatePayload | undefined
    >
  >(MatDialogRef);
  private readonly data =
    inject<ScheduleTemplateCreateDialogData>(MAT_DIALOG_DATA, {
      optional: true,
    }) ?? {};
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);

  readonly categoryOptions: ScheduleTemplateCategory[] = [
    'S-Bahn',
    'RegionalExpress',
    'Fernverkehr',
    'Güterverkehr',
    'Sonderverkehr',
  ];

  readonly statusOptions: ScheduleTemplateStatus[] = [
    'draft',
    'active',
    'archived',
  ];

  readonly dayOptions: { value: ScheduleTemplateDay; label: string }[] = [
    { value: 'Mo', label: 'Mo' },
    { value: 'Di', label: 'Di' },
    { value: 'Mi', label: 'Mi' },
    { value: 'Do', label: 'Do' },
    { value: 'Fr', label: 'Fr' },
    { value: 'Sa', label: 'Sa' },
    { value: 'So', label: 'So' },
  ];

  readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', Validators.required),
    description: [''],
    trainNumber: this.fb.nonNullable.control('', Validators.required),
    responsibleRu: this.fb.nonNullable.control('', Validators.required),
    status: this.fb.nonNullable.control<ScheduleTemplateStatus>('draft'),
    category: this.fb.nonNullable.control<ScheduleTemplateCategory>('S-Bahn'),
    startDate: this.fb.nonNullable.control(new Date(), Validators.required),
    endDate: new FormControl<Date | null>(null),
    tags: [''],
    recurrenceEnabled: this.fb.nonNullable.control(true),
    recurrenceStart: this.fb.nonNullable.control(
      this.data.defaultStartTime ?? '04:00',
      Validators.required,
    ),
    recurrenceEnd: this.fb.nonNullable.control(
      this.data.defaultEndTime ?? '23:00',
      Validators.required,
    ),
    recurrenceInterval: this.fb.nonNullable.control(30, [
      Validators.required,
      Validators.min(1),
      Validators.max(720),
    ]),
    recurrenceDays: this.fb.nonNullable.control<ScheduleTemplateDay[]>([
      'Mo',
      'Di',
      'Mi',
      'Do',
      'Fr',
    ]),
    stops: this.fb.array<StopFormGroup>([
      this.createStopGroup('origin'),
      this.createStopGroup('destination'),
    ]),
  });

  get stops(): FormArray<StopFormGroup> {
    return this.form.controls.stops;
  }

  openPlanAssembly() {
    const stops = this.toTrainPlanStops();
    this.dialog
      .open<PlanAssemblyDialogComponent, PlanAssemblyDialogData, PlanAssemblyDialogResult | undefined>(
        PlanAssemblyDialogComponent,
        {
          width: '1320px',
          maxWidth: '95vw',
          maxHeight: 'calc(100vh - 48px)',
          panelClass: 'plan-assembly-dialog-panel',
          data: { stops },
        },
      )
      .afterClosed()
      .subscribe((result) => {
        if (result?.stops?.length) {
          this.applyAssemblyStops(result.stops);
        }
      });
  }

  stopCount(): number {
    return this.stops.length;
  }

  startStopLabel(): string {
    return this.stopLabelAt(0);
  }

  endStopLabel(): string {
    return this.stopLabelAt(this.stops.length - 1);
  }

  stopPreview(): { sequence: number; name: string; time?: string; type: string }[] {
    return this.stops.controls.map((stop, index) => {
      const time = this.firstNonEmpty([
        stop.controls.departureEarliest.value,
        stop.controls.departureLatest.value,
        stop.controls.arrivalEarliest.value,
        stop.controls.arrivalLatest.value,
      ]);
      return {
        sequence: index + 1,
        name: stop.controls.locationName.value || '–',
        type: stop.controls.type.value,
        time: time || undefined,
      };
    });
  }

  private stopLabelAt(index: number): string {
    const preview = this.stopPreview();
    const item = preview[index];
    if (!item) {
      return '–';
    }
    return item.time ? `${item.name} (${item.time})` : item.name;
  }

  private toTrainPlanStops(): TrainPlanStop[] {
    const baseDate = this.form.controls.startDate.value ?? new Date();
    return this.stops.controls.map((group, index) => {
      const raw = group.getRawValue() as StopFormValue;
      const offset = raw.offsetDays ?? 0;
      return {
        id: `TPL-${index}`,
        sequence: index + 1,
        type: raw.type,
        locationName: raw.locationName || '',
        locationCode: raw.locationCode || '',
        countryCode: raw.countryCode ?? undefined,
        arrivalTime: this.combineWithBase(baseDate, raw.arrivalEarliest ?? raw.arrivalLatest, offset),
        departureTime: this.combineWithBase(baseDate, raw.departureEarliest ?? raw.departureLatest, offset),
        arrivalOffsetDays: raw.offsetDays ?? undefined,
        departureOffsetDays: raw.offsetDays ?? undefined,
        dwellMinutes: raw.dwellMinutes ?? undefined,
        activities: raw.activities?.length ? raw.activities : ['0001'],
        platform: raw.platformWish ?? undefined,
        notes: raw.notes ?? undefined,
      } satisfies TrainPlanStop;
    });
  }

  private applyAssemblyStops(stops: PlanModificationStopInput[]): void {
    if (!stops.length) {
      return;
    }
    this.stops.clear();
    stops.forEach((stop) => {
      this.stops.push(this.createStopGroupFromAssembly(stop));
    });
    this.form.markAsDirty();
  }

  private createStopGroupFromAssembly(stop: PlanModificationStopInput): StopFormGroup {
    const group = this.createStopGroup(stop.type);
    const arrivalTime = this.isoToTime(stop.arrivalTime);
    const departureTime = this.isoToTime(stop.departureTime);
    const offset = stop.arrivalOffsetDays ?? stop.departureOffsetDays ?? null;

    group.patchValue({
      locationName: stop.locationName,
      locationCode: stop.locationCode,
      countryCode: stop.countryCode ?? 'CH',
      arrivalEarliest: arrivalTime,
      arrivalLatest: arrivalTime,
      departureEarliest: departureTime,
      departureLatest: departureTime,
      offsetDays: offset,
      dwellMinutes: stop.dwellMinutes ?? null,
      activities: stop.activities?.length ? [...stop.activities] : ['0001'],
      platformWish: stop.platform ?? null,
      notes: stop.notes ?? null,
    });

    return group;
  }

  private combineWithBase(
    baseDate: Date,
    time: string | null | undefined,
    offsetDays: number | null | undefined,
  ): string | undefined {
    if (!time) {
      return undefined;
    }
    const [hours, minutes] = time.split(':').map((value) => Number.parseInt(value, 10));
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return undefined;
    }
    const date = new Date(
      Date.UTC(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        baseDate.getDate(),
        hours,
        minutes,
        0,
        0,
      ),
    );
    if (offsetDays) {
      date.setUTCDate(date.getUTCDate() + offsetDays);
    }
    return date.toISOString();
  }

  private isoToTime(value: string | undefined): string | null {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString().slice(11, 16);
  }

  private firstNonEmpty(values: Array<string | null>): string | null {
    for (const value of values) {
      if (value && value.trim().length) {
        return value;
      }
    }
    return null;
  }

  toggleRecurrenceDay(day: ScheduleTemplateDay) {
    if (!this.form.controls.recurrenceEnabled.value) {
      return;
    }
    const current = new Set(this.form.controls.recurrenceDays.value);
    if (current.has(day)) {
      current.delete(day);
    } else {
      current.add(day);
    }
    const ordered = this.dayOptions
      .map((option) => option.value)
      .filter((value) => current.has(value));
    this.form.controls.recurrenceDays.setValue(ordered);
  }

  cancel() {
    this.dialogRef.close();
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.stops.controls.forEach((group) => group.markAllAsTouched());
      return;
    }

    const value = this.form.getRawValue();
    const payload: CreateScheduleTemplatePayload = {
      title: value.title,
      description: value.description ?? undefined,
      trainNumber: value.trainNumber,
      responsibleRu: value.responsibleRu,
      status: value.status,
      category: value.category,
      startDate: value.startDate,
      endDate: value.endDate ?? undefined,
      tags: this.parseTags(value.tags),
      recurrence: value.recurrenceEnabled
        ? {
            startTime: value.recurrenceStart,
            endTime: value.recurrenceEnd,
            intervalMinutes: value.recurrenceInterval,
            days: value.recurrenceDays,
          }
        : undefined,
      stops: this.stops.controls.map((stop, index) =>
        this.mapStopValue(stop.getRawValue() as StopFormValue, index),
      ),
    };

    this.dialogRef.close(payload);
  }

  private parseTags(value: string | null | undefined): string[] | undefined {
    if (!value?.trim()) {
      return undefined;
    }
    const tags = value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    return tags.length ? Array.from(new Set(tags)) : undefined;
  }

  private mapStopValue(
    stop: StopFormValue,
    index: number,
  ): CreateScheduleTemplateStopPayload {
    return {
      type: stop.type,
      locationCode: stop.locationCode,
      locationName: stop.locationName,
      countryCode: stop.countryCode || undefined,
      arrivalEarliest: stop.arrivalEarliest || undefined,
      arrivalLatest: stop.arrivalLatest || undefined,
      departureEarliest: stop.departureEarliest || undefined,
      departureLatest: stop.departureLatest || undefined,
      offsetDays: stop.offsetDays ?? undefined,
      dwellMinutes: stop.dwellMinutes ?? undefined,
      activities:
        stop.activities?.length && stop.activities[0]
          ? stop.activities
          : ['0001'],
      platformWish: stop.platformWish || undefined,
      notes: stop.notes || undefined,
    };
  }

  private createStopGroup(
    type: 'origin' | 'intermediate' | 'destination',
  ): StopFormGroup {
    return this.fb.group({
      type: this.fb.nonNullable.control(type),
      locationName: this.fb.nonNullable.control('', Validators.required),
      locationCode: this.fb.nonNullable.control('', Validators.required),
      countryCode: new FormControl<string | null>('CH'),
      arrivalEarliest: new FormControl<string | null>(null),
      arrivalLatest: new FormControl<string | null>(null),
      departureEarliest: new FormControl<string | null>(null),
      departureLatest: new FormControl<string | null>(null),
      offsetDays: new FormControl<number | null>(null),
      dwellMinutes: new FormControl<number | null>(null),
      activities: this.fb.nonNullable.control<string[]>(['0001']),
      platformWish: new FormControl<string | null>(null),
      notes: new FormControl<string | null>(null),
    });
  }
}
