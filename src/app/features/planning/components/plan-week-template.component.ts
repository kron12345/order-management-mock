import { ChangeDetectionStrategy, Component, Input, OnInit, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTableModule } from '@angular/material/table';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PlanWeekSlice, PlanWeekTemplate, PlanWeekValidity } from '../../../models/planning-template';
import { PlanWeekTemplateStoreService } from '../stores/plan-week-template.store';

@Component({
  selector: 'app-plan-week-template',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatListModule,
    MatTableModule,
    MatButtonToggleModule,
    MatTooltipModule,
  ],
  templateUrl: './plan-week-template.component.html',
  styleUrl: './plan-week-template.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanWeekTemplateComponent implements OnInit {
  private readonly store = inject(PlanWeekTemplateStoreService);
  private readonly fb = inject(FormBuilder);

  protected readonly templates = this.store.templates;
  protected readonly selectedTemplate = this.store.selectedTemplate;
  protected readonly validities = this.store.selectedValidities;
  protected readonly isLoading = this.store.isLoading;
  protected readonly error = this.store.error;
  protected readonly slices = computed(() => {
    const template = this.selectedTemplate();
    if (!template) {
      return [];
    }
    return [...(template.slices ?? [])].sort((a, b) => a.startIso.localeCompare(b.startIso));
  });
  protected readonly hasTemplateSelection = computed(() => !!this.selectedTemplate());
  protected readonly suggestedSlice = computed(() => this.computeNextSliceSuggestion());
  private lastPatchedTemplateId: string | null = null;
  private timetableYearRangeInternal: { startIso: string; endIso: string } | null = null;
  private readonly mondayValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (!value) {
      return null;
    }
    return this.isMonday(value) ? null : { notMonday: true };
  };
  private readonly withinYearValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (!value || !this.timetableYearRangeInternal) {
      return null;
    }
    return this.isWithinRange(value) ? null : { outOfRange: true };
  };

  protected readonly templateForm: FormGroup = this.fb.group({
    id: [''],
    label: ['', Validators.required],
    description: [''],
    baseWeekStartIso: ['', Validators.required],
    variant: [''],
  });

  protected readonly validityForm: FormGroup = this.fb.group({
    id: [''],
    templateId: [''],
    validFromIso: ['', Validators.required],
    validToIso: ['', Validators.required],
    status: ['draft', Validators.required],
  });
  protected readonly sliceForm: FormGroup = this.fb.group({
    id: [''],
    label: [''],
    startIso: ['', Validators.required],
    endIso: ['', Validators.required],
  });

  @Input()
  set timetableYearRange(range: { startIso: string; endIso: string } | null) {
    this.timetableYearRangeInternal = range;
    this.applyYearRangeConstraints();
  }

  protected get yearRangeStart(): string | null {
    return this.timetableYearRangeInternal?.startIso ?? null;
  }

  protected get yearRangeEnd(): string | null {
    return this.timetableYearRangeInternal?.endIso ?? null;
  }

  constructor() {
    this.templateForm.controls['baseWeekStartIso'].addValidators([
      this.mondayValidator,
      this.withinYearValidator,
    ]);

    effect(
      () => {
        const template = this.selectedTemplate();
        const templateId = template?.id ?? null;
        if (templateId === this.lastPatchedTemplateId) {
          return;
        }
        this.lastPatchedTemplateId = templateId;
        if (!template) {
          this.templateForm.reset({
            id: '',
            label: '',
            description: '',
            baseWeekStartIso: this.defaultBaseWeekStart(),
            variant: '',
          });
          this.resetSliceForm();
          this.applyYearRangeConstraints();
          return;
        }
        this.templateForm.reset({
          id: template.id,
          label: template.label,
          description: template.description ?? '',
          baseWeekStartIso: this.toLocalDate(template.baseWeekStartIso),
          variant: template.variant ?? '',
        });
        this.resetSliceForm();
        this.applyYearRangeConstraints();
      },
      { allowSignalWrites: true },
    );
  }

  ngOnInit(): void {}

  protected handleTemplateSelect(template: PlanWeekTemplate): void {
    this.store.selectTemplate(template.id);
    this.resetSliceForm();
  }

  protected submitTemplate(): void {
    if (this.templateForm.invalid) {
      this.templateForm.markAllAsTouched();
      return;
    }
    const value = this.templateForm.getRawValue();
    const templateId = this.resolveTemplateId(value.id);
    const template: PlanWeekTemplate = {
      ...value,
      id: templateId,
      slices: this.slices(),
      createdAtIso: this.selectedTemplate()?.createdAtIso ?? new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
      version: this.selectedTemplate()?.version ?? 'v1',
    } as PlanWeekTemplate;
    this.store.saveTemplate(template);
  }

  protected newTemplate(): void {
    this.templateForm.reset({
      id: '',
      label: '',
      description: '',
      baseWeekStartIso: '',
      variant: '',
    });
    this.resetSliceForm();
    this.store.selectTemplate(null);
  }

  protected deleteSelectedTemplate(): void {
    const selection = this.selectedTemplate();
    if (!selection) {
      return;
    }
    this.store.deleteTemplate(selection.id);
  }

  protected handleValiditySelect(validity: PlanWeekValidity): void {
    this.validityForm.patchValue({
      ...validity,
      validFromIso: this.toLocalDate(validity.validFromIso),
      validToIso: this.toLocalDate(validity.validToIso),
    });
  }

  protected submitValidity(): void {
    const templateId = this.selectedTemplate()?.id;
    if (!templateId || this.validityForm.invalid) {
      this.validityForm.markAllAsTouched();
      return;
    }
    const value = this.validityForm.getRawValue();
    const validFromIso = this.normalizeDate(value.validFromIso);
    const validToIso = this.normalizeDate(value.validToIso);
    const validity: PlanWeekValidity = {
      id: value.id || (crypto.randomUUID?.() ?? `validity-${Date.now()}`),
      templateId,
      validFromIso,
      validToIso,
      status: value.status,
    } as PlanWeekValidity;
    this.store.saveValidity(templateId, validity);
  }

  protected newValidity(): void {
    this.validityForm.reset({
      id: '',
      validFromIso: '',
      validToIso: '',
      status: 'draft',
    });
  }

  protected deleteValidity(validity: PlanWeekValidity): void {
    const templateId = this.selectedTemplate()?.id;
    if (!templateId) {
      return;
    }
    this.store.deleteValidity(templateId, validity.id);
  }

  protected newSlice(): void {
    this.resetSliceForm();
  }

  protected editSlice(slice: PlanWeekSlice): void {
    this.sliceForm.reset({
      id: slice.id,
      label: slice.label ?? '',
      startIso: this.toLocalDate(slice.startIso),
      endIso: this.toLocalDate(slice.endIso),
    });
    this.sliceForm.setErrors(null);
  }

  protected submitSlice(): void {
    const template = this.selectedTemplate();
    if (!template) {
      return;
    }
    if (this.sliceForm.invalid) {
      this.sliceForm.markAllAsTouched();
      return;
    }
    const value = this.sliceForm.getRawValue();
    const startIso = this.normalizeDate(value.startIso);
    const endIso = this.normalizeDate(value.endIso);
    if (endIso && startIso && endIso < startIso) {
      this.sliceForm.setErrors({ range: true });
      return;
    }
    if (
      (startIso && !this.isWithinRange(startIso)) ||
      (endIso && !this.isWithinRange(endIso))
    ) {
      this.sliceForm.setErrors({ outOfRange: true });
      return;
    }
    this.sliceForm.setErrors(null);
    const slice: PlanWeekSlice = {
      id: value.id || (crypto.randomUUID?.() ?? `slice-${Date.now()}`),
      templateId: template.id,
      label: value.label?.trim() || undefined,
      startIso,
      endIso,
    };
    const slices = this.upsertSlice(template.slices ?? [], slice);
    this.store.updateTemplateSlices(template.id, slices);
    this.resetSliceForm();
  }

  protected deleteSlice(slice: PlanWeekSlice): void {
    const template = this.selectedTemplate();
    if (!template) {
      return;
    }
    const slices = (template.slices ?? []).filter((entry) => entry.id !== slice.id);
    this.store.updateTemplateSlices(template.id, slices);
    if (this.sliceForm.getRawValue().id === slice.id) {
      this.resetSliceForm();
    }
  }

  protected formatSliceRange(slice: PlanWeekSlice): string {
    return `${this.formatDate(slice.startIso)} – ${this.formatDate(slice.endIso)}`;
  }

  protected trackSlice(_: number, slice: PlanWeekSlice): string {
    return slice.id;
  }

  protected applySuggestedSlice(): void {
    const suggestion = this.suggestedSlice();
    if (!suggestion) {
      return;
    }
    this.sliceForm.patchValue({
      id: '',
      label: suggestion.label ?? '',
      startIso: suggestion.startIso,
      endIso: suggestion.endIso,
    });
    this.sliceForm.setErrors(null);
  }

  private resetSliceForm(): void {
    this.sliceForm.reset({
      id: '',
      label: '',
      startIso: this.yearRangeStart ?? '',
      endIso: this.yearRangeEnd ?? '',
    });
    this.sliceForm.setErrors(null);
  }

  private resolveTemplateId(currentId: string | null | undefined): string {
    const existing = currentId?.trim() || this.selectedTemplate()?.id;
    if (existing && existing.length > 0) {
      return existing;
    }
    return crypto.randomUUID?.() ?? `plan-week-${Date.now()}`;
  }

  private upsertSlice(items: PlanWeekSlice[], slice: PlanWeekSlice): PlanWeekSlice[] {
    const index = items.findIndex((entry) => entry.id === slice.id);
    if (index === -1) {
      return [...items, slice];
    }
    const clone = [...items];
    clone.splice(index, 1, slice);
    return clone;
  }

  private toLocalDate(value: string): string {
    if (!value) {
      return '';
    }
    return this.formatDateISO(new Date(value));
  }

  private normalizeDate(value: string): string {
    if (!value) {
      return '';
    }
    return this.formatDateISO(new Date(value));
  }

  protected formatDate(value: string): string {
    if (!value) {
      return '';
    }
    const formatter = new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC' });
    return formatter.format(new Date(value));
  }

  private formatDateISO(date: Date): string {
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
      .toISOString()
      .slice(0, 10);
  }

  private defaultBaseWeekStart(): string {
    const start = this.yearRangeStart;
    if (!start) {
      return '';
    }
    const date = new Date(start);
    const weekday = this.getWeekday(date);
    const delta = (8 - weekday) % 7;
    date.setUTCDate(date.getUTCDate() + delta);
    return this.formatDateISO(date);
  }

  private isMonday(value: string): boolean {
    const date = new Date(value);
    return this.getWeekday(date) === 1;
  }

  private getWeekday(date: Date): number {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).getUTCDay() || 7;
  }

  private isWithinRange(value: string): boolean {
    if (!this.timetableYearRangeInternal) {
      return true;
    }
    return (
      value >= this.timetableYearRangeInternal.startIso &&
      value <= this.timetableYearRangeInternal.endIso
    );
  }

  private clampToRange(value: string): string {
    if (!this.timetableYearRangeInternal) {
      return value;
    }
    if (value < this.timetableYearRangeInternal.startIso) {
      return this.timetableYearRangeInternal.startIso;
    }
    if (value > this.timetableYearRangeInternal.endIso) {
      return this.timetableYearRangeInternal.endIso;
    }
    return value;
  }

  private applyYearRangeConstraints(): void {
    const baseControl = this.templateForm.controls['baseWeekStartIso'];
    const currentBase = baseControl.value;
    if (currentBase && !this.isWithinRange(currentBase)) {
      baseControl.setValue(this.clampToRange(currentBase));
    }
    baseControl.updateValueAndValidity({ emitEvent: false });
    const startControl = this.sliceForm.controls['startIso'];
    const endControl = this.sliceForm.controls['endIso'];
    [startControl, endControl].forEach((control) => {
      const value = control.value;
      if (value && !this.isWithinRange(value)) {
        control.setValue(this.clampToRange(value));
      }
    });
  }

  private computeNextSliceSuggestion(): { startIso: string; endIso: string; label?: string } | null {
    const range = this.timetableYearRangeInternal;
    const selectedTemplateId = this.selectedTemplate()?.id ?? null;
    if (!range) {
      return null;
    }
    const rangeStart = Date.parse(range.startIso);
    const rangeEnd = Date.parse(range.endIso);
    if (Number.isNaN(rangeStart) || Number.isNaN(rangeEnd)) {
      return null;
    }
    const dayMs = 24 * 60 * 60 * 1000;
    const occupied = this.templates()
      .filter((template) => template.id !== selectedTemplateId)
      .flatMap((template) => template.slices ?? [])
      .map((slice) => ({
        start: Math.max(rangeStart, Date.parse(slice.startIso)),
        end: Math.min(rangeEnd, Date.parse(slice.endIso)),
        label: slice.label,
      }))
      .filter((interval) => !(Number.isNaN(interval.start) || Number.isNaN(interval.end)) && interval.start <= interval.end)
      .sort((a, b) => a.start - b.start);

    let cursor = rangeStart;
    for (const interval of occupied) {
      if (interval.start > cursor) {
        const gapStart = cursor;
        const gapEnd = Math.min(interval.start - dayMs, rangeEnd);
        if (gapEnd >= gapStart) {
          return {
            startIso: this.formatDateISO(new Date(gapStart)),
            endIso: this.formatDateISO(new Date(gapEnd)),
          };
        }
      }
      cursor = Math.max(cursor, interval.end + dayMs);
      if (cursor > rangeEnd) {
        break;
      }
    }

    if (cursor <= rangeEnd) {
      return {
        startIso: this.formatDateISO(new Date(cursor)),
        endIso: this.formatDateISO(new Date(rangeEnd)),
      };
    }
    return null;
  }
}
