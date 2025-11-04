import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
} from '@angular/material/dialog';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import { TrafficPeriodCreatePayload } from '../../core/services/traffic-period.service';
import {
  TrafficPeriod,
  TrafficPeriodType,
  TrafficPeriodVariantType,
  TrafficPeriodVariantScope,
} from '../../core/models/traffic-period.model';
import { AnnualCalendarSelectorComponent } from '../../shared/annual-calendar-selector/annual-calendar-selector.component';

interface TrafficPeriodEditorData {
  defaultYear: number;
  period?: TrafficPeriod;
}

interface TrafficPeriodEditorResult {
  periodId?: string;
  payload: TrafficPeriodCreatePayload;
}

@Component({
  selector: 'app-traffic-period-editor',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ...MATERIAL_IMPORTS,
    AnnualCalendarSelectorComponent,
  ],
  templateUrl: './traffic-period-editor.component.html',
  styleUrl: './traffic-period-editor.component.scss',
})
export class TrafficPeriodEditorComponent {
  private readonly dialogRef = inject<
    MatDialogRef<TrafficPeriodEditorComponent, TrafficPeriodEditorResult | undefined>
  >(MatDialogRef);
  private readonly data =
    inject<TrafficPeriodEditorData>(MAT_DIALOG_DATA, { optional: true }) ??
    ({ defaultYear: new Date().getFullYear() } as TrafficPeriodEditorData);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.group({
    name: ['', Validators.required],
    type: this.fb.nonNullable.control<TrafficPeriodType>('standard'),
    description: [''],
    responsible: [''],
    tags: [''],
    year: this.fb.nonNullable.control(this.data.defaultYear, [
      Validators.required,
      Validators.min(1900),
      Validators.max(2100),
    ]),
    variantType: this.fb.nonNullable.control<TrafficPeriodVariantType>('series'),
    appliesTo: this.fb.nonNullable.control<TrafficPeriodVariantScope>('both'),
    variantNumber: ['00', [Validators.required, Validators.maxLength(8)]],
    reason: [''],
  });

  readonly typeOptions: { value: TrafficPeriodType; label: string }[] = [
    { value: 'standard', label: 'Standard' },
    { value: 'special', label: 'Sonderverkehr' },
    { value: 'construction', label: 'Bauphase' },
  ];

  private readonly existingPeriod = this.data.period;
  readonly isEditMode = !!this.existingPeriod;
  readonly selectedDates = signal<string[]>([]);
  readonly excludedDates = signal<string[]>([]);

  readonly variantTypeOptions: { value: TrafficPeriodVariantType; label: string }[] = [
    { value: 'series', label: 'Serie' },
    { value: 'special_day', label: 'Sondertag' },
    { value: 'block', label: 'Block/Sperre' },
    { value: 'replacement', label: 'Ersatz' },
  ];

  readonly appliesOptions: { value: TrafficPeriodVariantScope; label: string }[] = [
    { value: 'commercial', label: 'Kommerziell' },
    { value: 'operational', label: 'Betrieb' },
    { value: 'both', label: 'Beides' },
  ];

  constructor() {
    if (this.existingPeriod) {
      this.patchFromExisting(this.existingPeriod);
    }

    this.form.controls.year.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.selectedDates.set([]);
        this.excludedDates.set([]);
      });
  }

  onSelectedDatesChange(dates: string[]) {
    this.selectedDates.set(dates);
  }

  onExcludedDatesChange(dates: string[]) {
    this.excludedDates.set(dates);
  }

  selectedYear(): number {
    return this.form.controls.year.value ?? new Date().getFullYear();
  }

  cancel(): void {
    this.dialogRef.close();
  }

  save(): void {
    if (this.form.invalid || this.selectedDates().length === 0) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const dates = [...this.selectedDates()].sort();
    const excluded = [...this.excludedDates()].sort();

    const payload: TrafficPeriodCreatePayload = {
      name: value.name!,
      type: value.type,
      description: value.description ?? undefined,
      responsible: value.responsible ?? undefined,
      tags: this.parseTags(value.tags),
      year: value.year,
      selectedDates: dates,
      excludedDates: excluded,
      variantType: value.variantType ?? 'series',
      appliesTo: value.appliesTo ?? 'both',
      variantNumber: this.normalizeVariantNumber(value.variantNumber),
      reason: value.reason?.trim() || undefined,
    };

    const result: TrafficPeriodEditorResult = {
      periodId: this.existingPeriod?.id,
      payload,
    };

    this.dialogRef.close(result);
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

  private patchFromExisting(period: TrafficPeriod) {
    const rule = period.rules[0];
    const year = rule?.validityStart
      ? Number.parseInt(rule.validityStart.slice(0, 4), 10)
      : this.data.defaultYear;

    this.form.patchValue(
      {
        name: period.name,
        type: period.type,
        description: period.description ?? '',
        responsible: period.responsible ?? '',
        tags: period.tags?.join(', ') ?? '',
        year,
        variantType: rule?.variantType ?? 'series',
        appliesTo: rule?.appliesTo ?? 'both',
        variantNumber: rule?.variantNumber ?? '00',
        reason: rule?.reason ?? '',
      },
      { emitEvent: false },
    );

    const includes = rule?.includesDates ?? [];
    this.selectedDates.set([...includes]);
    const excludes = rule?.excludesDates ?? [];
    this.excludedDates.set([...excludes]);
  }

  private normalizeVariantNumber(value: string | null | undefined): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      return '00';
    }
    return trimmed.toUpperCase();
  }
}
