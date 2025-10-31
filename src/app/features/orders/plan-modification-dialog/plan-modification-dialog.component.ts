import { CommonModule } from '@angular/common';
import { Component, Inject, computed, inject, signal } from '@angular/core';
import {
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
import { MATERIAL_IMPORTS } from '../../../core/material.imports.imports';
import { OrderItem } from '../../../core/models/order-item.model';
import { TrainPlan, TrainPlanStop } from '../../../core/models/train-plan.model';
import {
  PlanModificationStopInput,
  TrainPlanService,
} from '../../../core/services/train-plan.service';
import { TrafficPeriodService } from '../../../core/services/traffic-period.service';
import { OrderService } from '../../../core/services/order.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TrafficPeriod } from '../../../core/models/traffic-period.model';
import { ScheduleTemplate } from '../../../core/models/schedule-template.model';
import { ScheduleTemplateService } from '../../../core/services/schedule-template.service';
import {
  PlanAssemblyDialogComponent,
  PlanAssemblyDialogData,
  PlanAssemblyDialogResult,
} from '../plan-assembly-dialog/plan-assembly-dialog.component';
import { AnnualCalendarSelectorComponent } from '../../../shared/annual-calendar-selector/annual-calendar-selector.component';

interface PlanModificationDialogData {
  orderId: string;
  item: OrderItem;
  plan: TrainPlan;
}

type ValidityMode = 'trafficPeriod' | 'custom';

interface PlanModificationFormModel {
  title: FormControl<string>;
  trainNumber: FormControl<string>;
  responsibleRu: FormControl<string>;
  notes: FormControl<string>;
  templateId: FormControl<string>;
  templateStartTime: FormControl<string>;
  validityMode: FormControl<ValidityMode>;
  trafficPeriodId: FormControl<string>;
  validFrom: FormControl<string>;
  validTo: FormControl<string>;
  daysBitmap: FormControl<string>;
  customYear: FormControl<number>;
}

@Component({
  selector: 'app-plan-modification-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS, AnnualCalendarSelectorComponent],
  templateUrl: './plan-modification-dialog.component.html',
  styleUrl: './plan-modification-dialog.component.scss',
})
export class PlanModificationDialogComponent {
  private readonly dialogRef =
    inject(MatDialogRef<PlanModificationDialogComponent>);
  private readonly fb = inject(FormBuilder);
  private readonly trainPlanService = inject(TrainPlanService);
  private readonly trafficPeriodService = inject(TrafficPeriodService);
  private readonly orderService = inject(OrderService);
  private readonly templateService = inject(ScheduleTemplateService);
  private readonly dialogService = inject(MatDialog);
  private readonly data = inject<PlanModificationDialogData>(MAT_DIALOG_DATA);

  readonly plan = this.data.plan;
  readonly item = this.data.item;
  readonly orderId = this.data.orderId;

  readonly periods = computed(() => this.trafficPeriodService.periods());
  readonly templates = computed(() => this.templateService.templates());
  readonly validityMode = signal<ValidityMode>(
    this.plan.trafficPeriodId ? 'trafficPeriod' : 'custom',
  );
  readonly form: FormGroup<PlanModificationFormModel>;
  readonly errorMessage = signal<string | null>(null);
  readonly assembledStops = signal<PlanModificationStopInput[] | null>(null);
  readonly customSelectedDates = signal<string[]>([]);

  constructor() {
    const initialTrafficPeriod = this.plan.trafficPeriodId ?? '';
    const initialValidFrom = this.plan.calendar.validFrom;
    const initialValidTo = this.plan.calendar.validTo ?? this.plan.calendar.validFrom;
    const initialDaysBitmap =
      this.plan.calendar.daysBitmap && this.plan.calendar.daysBitmap.length === 7
        ? this.plan.calendar.daysBitmap
        : '1111111';

    const initialYear = this.deriveInitialCustomYear(initialValidFrom);

    this.form = this.fb.group({
      title: this.fb.nonNullable.control(this.plan.title, {
        validators: [Validators.required, Validators.maxLength(120)],
      }),
      trainNumber: this.fb.nonNullable.control(this.plan.trainNumber, {
        validators: [Validators.required, Validators.maxLength(40)],
      }),
      responsibleRu: this.fb.nonNullable.control(this.plan.responsibleRu, {
        validators: [Validators.required, Validators.maxLength(80)],
      }),
      notes: this.fb.nonNullable.control(this.plan.notes ?? ''),
      templateId: this.fb.nonNullable.control(''),
      templateStartTime: this.fb.nonNullable.control('04:00', {
        validators: [Validators.pattern(/^([01]?\d|2[0-3]):[0-5]\d$/)],
      }),
      validityMode: this.fb.nonNullable.control<ValidityMode>(
        this.plan.trafficPeriodId ? 'trafficPeriod' : 'custom',
      ),
      trafficPeriodId: this.fb.nonNullable.control(initialTrafficPeriod),
      validFrom: this.fb.nonNullable.control(initialValidFrom, {
        validators: [Validators.required],
      }),
      validTo: this.fb.nonNullable.control(initialValidTo),
      daysBitmap: this.fb.nonNullable.control(initialDaysBitmap, {
        validators: [Validators.required, Validators.pattern(/^[01]{7}$/)],
      }),
      customYear: this.fb.nonNullable.control(initialYear, {
        validators: [Validators.required, Validators.min(1900), Validators.max(2100)],
      }),
    });

    this.form.controls.validityMode.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((mode) => this.onValidityModeChange(mode));

    this.form.controls.trafficPeriodId.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((periodId) => {
        if (this.validityMode() === 'trafficPeriod' && periodId) {
          this.applyTrafficPeriod(periodId);
        }
      });

    this.form.controls.customYear.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((year) => {
        if (!year) {
          this.customSelectedDates.set([]);
          this.updateCustomCalendarFields([]);
          return;
        }
        const filtered = this.customSelectedDates().filter((date) =>
          date.startsWith(String(year)),
        );
        this.customSelectedDates.set(filtered);
        this.updateCustomCalendarFields(filtered);
      });

    this.initializeCustomCalendarState(initialYear);
    this.onValidityModeChange(this.validityMode());
  }

  trackByPeriodId(_: number, period: { id: string }): string {
    return period.id;
  }

  customYearValue(): number {
    return (
      this.form.controls.customYear.value ??
      this.deriveInitialCustomYear(this.plan.calendar.validFrom)
    );
  }

  onCustomDatesChange(dates: string[]) {
    const year = this.customYearValue();
    const filtered = dates.filter((date) => date.startsWith(String(year)));
    this.customSelectedDates.set(filtered);
    this.updateCustomCalendarFields(filtered);
  }

  applyTemplate() {
    this.errorMessage.set(null);
    const templateId = this.form.controls.templateId.value.trim();
    if (!templateId) {
      this.errorMessage.set('Bitte eine Fahrplanvorlage auswählen.');
      return;
    }
    const template = this.templateService.getById(templateId);
    if (!template) {
      this.errorMessage.set('Ausgewählte Fahrplanvorlage wurde nicht gefunden.');
      return;
    }
    const startTime = this.form.controls.templateStartTime.value.trim();
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      this.errorMessage.set('Bitte eine gültige Startzeit im Format HH:MM angeben.');
      return;
    }

    const referenceIso = this.operationReferenceIso();
    const departure = this.combineDateWithTime(referenceIso, startTime);
    if (Number.isNaN(departure.getTime())) {
      this.errorMessage.set('Startzeit konnte nicht verarbeitet werden.');
      return;
    }

    const stops = this.buildStopsFromTemplate(template, departure);
    if (!stops.length) {
      this.errorMessage.set('Die Fahrplanvorlage enthält keine Halte.');
      return;
    }

    this.assembledStops.set(stops);
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
    const mode = value.validityMode;
    if (mode === 'trafficPeriod') {
      if (!value.trafficPeriodId) {
        this.errorMessage.set('Bitte eine Verkehrsperiode auswählen.');
        return;
      }
    } else {
      if (!this.customSelectedDates().length) {
        this.errorMessage.set('Bitte mindestens einen Verkehrstag auswählen.');
        return;
      }
    }

    try {
      const calendar =
        mode === 'trafficPeriod'
          ? this.calendarFromPeriod(value.trafficPeriodId!)
          : this.calendarFromCustomSelection(this.customSelectedDates());

      const newPlan = this.trainPlanService.createPlanModification({
        originalPlanId: this.plan.id,
        title: value.title.trim(),
        trainNumber: value.trainNumber.trim(),
        responsibleRu: value.responsibleRu.trim(),
        notes: value.notes.trim() ? value.notes.trim() : undefined,
        trafficPeriodId:
          mode === 'trafficPeriod' ? value.trafficPeriodId || undefined : undefined,
        calendar,
        stops: this.assembledStops() ?? undefined,
      });

      this.orderService.applyPlanModification({
        orderId: this.orderId,
        itemId: this.item.id,
        plan: newPlan,
      });

      this.dialogRef.close({
        updatedPlanId: newPlan.id,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Der Fahrplan konnte nicht aktualisiert werden.';
      this.errorMessage.set(message);
    }
  }

  private onValidityModeChange(mode: ValidityMode) {
    this.validityMode.set(mode);
    if (mode === 'trafficPeriod') {
      this.form.controls.trafficPeriodId.addValidators(Validators.required);
      this.form.controls.customYear.disable({ emitEvent: false });
      this.form.controls.validFrom.disable({ emitEvent: false });
      this.form.controls.validTo.disable({ emitEvent: false });
      this.form.controls.daysBitmap.disable({ emitEvent: false });
      if (this.form.controls.trafficPeriodId.value) {
        this.applyTrafficPeriod(this.form.controls.trafficPeriodId.value);
      }
    } else {
      this.form.controls.trafficPeriodId.removeValidators(Validators.required);
      this.form.controls.customYear.enable({ emitEvent: false });
      this.form.controls.validFrom.disable({ emitEvent: false });
      this.form.controls.validTo.disable({ emitEvent: false });
      this.form.controls.daysBitmap.disable({ emitEvent: false });
      const currentDates = this.customSelectedDates();
      if (!currentDates.length) {
        const year =
          this.form.controls.customYear.value ??
          this.deriveInitialCustomYear(this.plan.calendar.validFrom);
        this.initializeCustomCalendarState(year);
      } else {
        this.updateCustomCalendarFields(currentDates);
      }
    }
    this.form.controls.trafficPeriodId.updateValueAndValidity({
      emitEvent: false,
    });
  }

  private applyTrafficPeriod(periodId: string) {
    const period = this.trafficPeriodService.getById(periodId);
    if (!period) {
      return;
    }
    const calendar = this.calendarFromPeriod(periodId);
    this.form.patchValue(
      {
        validFrom: calendar.validFrom,
        validTo: calendar.validTo ?? calendar.validFrom,
        daysBitmap: calendar.daysBitmap,
      },
      { emitEvent: false },
    );
  }

  private operationReferenceIso(): string {
    const firstDeparture = this.plan.stops.find((stop) => stop.departureTime)?.departureTime;
    if (firstDeparture) {
      return firstDeparture;
    }
    const firstArrival = this.plan.stops.find((stop) => stop.arrivalTime)?.arrivalTime;
    if (firstArrival) {
      return firstArrival;
    }
    return `${this.plan.calendar.validFrom}T00:00:00.000Z`;
  }

  private combineDateWithTime(referenceIso: string, time: string): Date {
    const reference = new Date(referenceIso);
    const [hours, minutes] = time.split(':').map((value) => Number.parseInt(value, 10));
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return new Date(NaN);
    }
    if (Number.isNaN(reference.getTime())) {
      return new Date(`${this.plan.calendar.validFrom}T${time}:00.000Z`);
    }
    const result = new Date(reference);
    result.setUTCHours(hours, minutes, 0, 0);
    return result;
  }

  private buildStopsFromTemplate(
    template: ScheduleTemplate,
    departure: Date,
  ): PlanModificationStopInput[] {
    const baseMinutes = this.extractReferenceMinutes(template.stops) ?? 0;
    return template.stops.map((stop) => {
      const arrivalMinutes = this.extractTime(stop.arrival?.earliest ?? stop.arrival?.latest);
      const departureMinutes = this.extractTime(
        stop.departure?.earliest ?? stop.departure?.latest,
      );

      const offsetMinutes = (stop.offsetDays ?? 0) * 1440;
      const arrivalTime =
        arrivalMinutes !== undefined
          ? this.addMinutesToDate(departure, arrivalMinutes - baseMinutes + offsetMinutes)
          : undefined;
      const departureTime =
        departureMinutes !== undefined
          ? this.addMinutesToDate(departure, departureMinutes - baseMinutes + offsetMinutes)
          : undefined;

      return {
        sequence: stop.sequence,
        type: stop.type,
        locationCode: stop.locationCode,
        locationName: stop.locationName,
        countryCode: stop.countryCode,
        arrivalTime: arrivalTime ? arrivalTime.toISOString() : undefined,
        departureTime: departureTime ? departureTime.toISOString() : undefined,
        arrivalOffsetDays: arrivalTime ? this.offsetDays(departure, arrivalTime) : undefined,
        departureOffsetDays: departureTime
          ? this.offsetDays(departure, departureTime)
          : undefined,
        dwellMinutes: stop.dwellMinutes,
        activities:
          stop.activities && stop.activities.length ? [...stop.activities] : ['0001'],
        platform: stop.platformWish,
        notes: stop.notes,
      } satisfies PlanModificationStopInput;
    });
  }

  private extractReferenceMinutes(stops: ScheduleTemplate['stops']): number | undefined {
    for (const stop of stops) {
      const candidate =
        stop.departure?.earliest ??
        stop.departure?.latest ??
        stop.arrival?.earliest ??
        stop.arrival?.latest;
      const minutes = this.extractTime(candidate);
      if (minutes !== undefined) {
        return minutes + (stop.offsetDays ?? 0) * 1440;
      }
    }
    return undefined;
  }

  private extractTime(value: string | undefined): number | undefined {
    if (!value) {
      return undefined;
    }
    return this.parseTimeToMinutes(value);
  }

  private parseTimeToMinutes(time: string): number | undefined {
    const match = /^([0-9]{1,2}):([0-9]{2})$/.exec(time);
    if (!match) {
      return undefined;
    }
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    return hours * 60 + minutes;
  }

  private addMinutesToDate(base: Date, deltaMinutes: number): Date {
    const result = new Date(base.getTime());
    result.setMinutes(result.getMinutes() + deltaMinutes);
    return result;
  }

  private offsetDays(base: Date, target: Date): number | undefined {
    const diff = target.getTime() - base.getTime();
    const days = Math.round(diff / 86400000);
    return days === 0 ? undefined : days;
  }

  private initializeCustomCalendarState(targetYear: number) {
    const calendarDates = this.deriveDatesFromCalendar(this.plan.calendar);
    const filtered = calendarDates.filter((date) => date.startsWith(String(targetYear)));
    this.customSelectedDates.set(filtered);
    this.updateCustomCalendarFields(filtered);
  }

  private updateCustomCalendarFields(dates: string[]) {
    if (!dates.length) {
      this.form.patchValue(
        {
          validFrom: '',
          validTo: '',
          daysBitmap: '0000000',
        },
        { emitEvent: false },
      );
      return;
    }
    const calendar = this.calendarFromCustomSelection(dates);
    this.form.patchValue(
      {
        validFrom: calendar.validFrom,
        validTo: calendar.validTo ?? calendar.validFrom,
        daysBitmap: calendar.daysBitmap,
      },
      { emitEvent: false },
    );
  }

  private calendarFromCustomSelection(dates: string[]): {
    validFrom: string;
    validTo?: string;
    daysBitmap: string;
  } {
    const sorted = [...dates].sort();
    const validFrom = sorted[0];
    const validTo = sorted[sorted.length - 1];
    return {
      validFrom,
      validTo: validTo !== validFrom ? validTo : undefined,
      daysBitmap: this.bitmapFromDates(sorted),
    };
  }

  private deriveInitialCustomYear(validFrom: string | undefined): number {
    if (validFrom && /^\d{4}-/.test(validFrom)) {
      const parsed = Number.parseInt(validFrom.slice(0, 4), 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    return new Date().getFullYear();
  }

  private deriveDatesFromCalendar(calendar: TrainPlan['calendar']): string[] {
    const { validFrom } = calendar;
    if (!validFrom) {
      return [];
    }
    const start = new Date(validFrom);
    if (Number.isNaN(start.getTime())) {
      return [];
    }
    const end = calendar.validTo ? new Date(calendar.validTo) : new Date(validFrom);
    if (Number.isNaN(end.getTime())) {
      return [];
    }
    const bitmap =
      calendar.daysBitmap && /^[01]{7}$/.test(calendar.daysBitmap)
        ? calendar.daysBitmap
        : '1111111';
    const result: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const weekday = (cursor.getDay() + 6) % 7;
      if (bitmap[weekday] === '1') {
        result.push(this.formatDate(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  private bitmapFromDates(dates: string[]): string {
    const bits = ['0', '0', '0', '0', '0', '0', '0'];
    dates.forEach((date) => {
      const parsed = new Date(date);
      if (!Number.isNaN(parsed.getTime())) {
        const weekday = (parsed.getDay() + 6) % 7;
        bits[weekday] = '1';
      }
    });
    return bits.join('');
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private calendarFromPeriod(
    periodId: string,
  ): { validFrom: string; validTo?: string; daysBitmap: string } {
    const period = this.trafficPeriodService.getById(periodId);
    if (!period) {
      throw new Error('Verkehrsperiode nicht gefunden.');
    }
    let earliest: string | undefined;
    let latest: string | undefined;
    let combinedBitmap = '0000000';

    period.rules.forEach((rule: TrafficPeriod['rules'][number]) => {
      const start = rule.validityStart;
      const end = rule.validityEnd ?? rule.validityStart;
      if (!earliest || start < earliest) {
        earliest = start;
      }
      if (!latest || end > latest) {
        latest = end;
      }
      if (rule.daysBitmap?.length === 7) {
        combinedBitmap = this.mergeBitmap(combinedBitmap, rule.daysBitmap);
      }
    });

    return {
      validFrom: earliest ?? new Date().toISOString().slice(0, 10),
      validTo: latest,
      daysBitmap: combinedBitmap.includes('1') ? combinedBitmap : '1111111',
    };
  }

  private mergeBitmap(a: string, b: string): string {
    const result: string[] = [];
    for (let i = 0; i < 7; i++) {
      const bitA = a[i] === '1';
      const bitB = b[i] === '1';
      result.push(bitA || bitB ? '1' : '0');
    }
    return result.join('');
  }

  openAssemblyDialog() {
    const baseStops = this.previewStops().map((stop) => this.toTrainPlanStop(stop));

    this.dialogService
      .open<
        PlanAssemblyDialogComponent,
        PlanAssemblyDialogData,
        PlanAssemblyDialogResult | undefined
      >(PlanAssemblyDialogComponent, {
        width: '1320px',
        maxWidth: '95vw',
        maxHeight: 'calc(100vh - 48px)',
        panelClass: 'plan-assembly-dialog-panel',
        data: {
          stops: baseStops,
        },
      })
      .afterClosed()
      .subscribe((result) => {
        if (result?.stops) {
          this.assembledStops.set(result.stops);
        }
      });
  }

  hasCustomStops(): boolean {
    return this.assembledStops() !== null;
  }

  private toTrainPlanStop(stop: PlanModificationStopInput): TrainPlanStop {
    return {
      id: `${this.plan.id}-TMP-${String(stop.sequence).padStart(3, '0')}`,
      sequence: stop.sequence,
      type: stop.type,
      locationCode: stop.locationCode,
      locationName: stop.locationName,
      countryCode: stop.countryCode,
      arrivalTime: stop.arrivalTime,
      departureTime: stop.departureTime,
      arrivalOffsetDays: stop.arrivalOffsetDays,
      departureOffsetDays: stop.departureOffsetDays,
      dwellMinutes: stop.dwellMinutes,
      activities: stop.activities,
      platform: stop.platform,
      notes: stop.notes,
    };
  }

  stopCount(): number {
    return this.previewStops().length;
  }

  startStopLabel(): string {
    const stops = this.previewStops();
    if (!stops.length) {
      return '–';
    }
    return this.stopLabel(stops[0], true);
  }

  endStopLabel(): string {
    const stops = this.previewStops();
    if (!stops.length) {
      return '–';
    }
    return this.stopLabel(stops[stops.length - 1], false);
  }

  private stopLabel(stop: PlanModificationStopInput, preferDeparture: boolean): string {
    const primary = preferDeparture ? stop.departureTime : stop.arrivalTime;
    const fallback = preferDeparture ? stop.arrivalTime : stop.departureTime;
    const time = primary || fallback || '–';
    return `${stop.locationName} (${time})`;
  }

  private previewStops(): PlanModificationStopInput[] {
    if (this.assembledStops()) {
      return this.assembledStops() as PlanModificationStopInput[];
    }
    return this.plan.stops.map((stop) => this.mapPlanStop(stop));
  }

  private mapPlanStop(stop: TrainPlanStop): PlanModificationStopInput {
    return {
      sequence: stop.sequence,
      type: stop.type,
      locationCode: stop.locationCode,
      locationName: stop.locationName,
      countryCode: stop.countryCode,
      arrivalTime: stop.arrivalTime,
      departureTime: stop.departureTime,
      arrivalOffsetDays: stop.arrivalOffsetDays,
      departureOffsetDays: stop.departureOffsetDays,
      dwellMinutes: stop.dwellMinutes,
      activities: [...stop.activities],
      platform: stop.platform,
      notes: stop.notes,
    };
  }
}
