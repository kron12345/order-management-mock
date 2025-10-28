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
  MatDialogRef,
} from '@angular/material/dialog';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import {
  CreateScheduleTemplatePayload,
  CreateScheduleTemplateStopPayload,
} from '../../core/services/schedule-template.service';
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

  readonly activityOptions = [
    { code: '0001', label: 'Fahrgastwechsel (0001)' },
    { code: '0002', label: 'Betrieblicher Halt (0002)' },
    { code: '0005', label: 'Wende (0005)' },
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

  stopAt(index: number): StopFormGroup {
    return this.stops.at(index);
  }

  addIntermediateStop(afterIndex: number) {
    const group = this.createStopGroup('intermediate');
    this.stops.insert(afterIndex + 1, group);
  }

  removeStop(index: number) {
    if (this.stops.length <= 2) {
      return;
    }
    this.stops.removeAt(index);
  }

  toggleActivity(stopIndex: number, activity: string) {
    const control = this.stopAt(stopIndex).controls.activities;
    const current = new Set(control.value ?? []);
    if (current.has(activity)) {
      current.delete(activity);
    } else {
      current.add(activity);
    }
    control.setValue(Array.from(current));
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
