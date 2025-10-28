import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { TrafficPeriodCreatePayload } from '../../core/services/traffic-period.service';
import { TrafficPeriod, TrafficPeriodType } from '../../core/models/traffic-period.model';

interface TrafficPeriodEditorData {
  defaultYear: number;
  period?: TrafficPeriod;
}

interface CalendarCell {
  date: string | null;
  label: string;
  weekday: number | null;
  kind: 'day' | 'leading' | 'trailing';
}

interface TrafficPeriodEditorResult {
  periodId?: string;
  payload: TrafficPeriodCreatePayload;
}

@Component({
  selector: 'app-traffic-period-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS],
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
  });

  readonly typeOptions: { value: TrafficPeriodType; label: string }[] = [
    { value: 'standard', label: 'Standard' },
    { value: 'special', label: 'Sonderverkehr' },
    { value: 'construction', label: 'Bauphase' },
  ];

  private readonly selected = signal<Set<string>>(new Set());
  private lastSelectedDate: string | null = null;
  private readonly existingPeriod = this.data.period;
  readonly isEditMode = !!this.existingPeriod;

  readonly monthNames = [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ];

  readonly weekdayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  private readonly year = signal(this.form.controls.year.value);
  readonly weekGroups = computed(() => this.computeWeeks(this.year()));
  readonly maxColumnCount = computed(() =>
    this.weekGroups().reduce((max, month) => Math.max(max, month.cells.length), 0),
  );
  readonly headerLabels = computed(() =>
    Array.from({ length: this.maxColumnCount() }, (_, index) =>
      this.weekdayNames[index % this.weekdayNames.length],
    ),
  );
  readonly emptyArrayCache = new Map<number, number[]>();

  constructor() {
    if (this.existingPeriod) {
      this.patchFromExisting(this.existingPeriod);
    }

    this.form.controls.year.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((year) => {
        this.year.set(year ?? new Date().getFullYear());
        this.lastSelectedDate = null;
        this.selected.set(new Set());
      });
  }

  private computeWeeks(year: number) {
    const weeksPerMonth: { cells: CalendarCell[]; weekCount: number }[] = [];

    for (let month = 0; month < 12; month++) {
      const cells: CalendarCell[] = [];
      const firstDay = new Date(year, month, 1);
      const offset = (firstDay.getDay() + 6) % 7; // 0=Mo

      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const weekCount = Math.ceil((offset + daysInMonth) / 7);
      const totalCells = weekCount * 7;

      for (let i = 0; i < totalCells; i++) {
        const dayNumber = i - offset + 1;
        if (dayNumber <= 0 || dayNumber > daysInMonth) {
          const kind = dayNumber <= 0 ? 'leading' : 'trailing';
          cells.push({ date: null, label: '', weekday: null, kind });
        } else {
          const date = new Date(year, month, dayNumber);
          const iso = this.formatDateString(date);
          const weekday = (date.getDay() + 6) % 7;
          cells.push({
            date: iso,
            label: dayNumber.toString().padStart(2, '0'),
            weekday,
            kind: 'day',
          });
        }
      }
      let lastIndex = cells.length - 1;
      while (lastIndex >= 0 && cells[lastIndex].kind !== 'day') {
        lastIndex--;
      }
      const trimmed = lastIndex >= 0 ? cells.slice(0, lastIndex + 1) : cells;
      weeksPerMonth.push({ cells: trimmed, weekCount });
    }
    return weeksPerMonth;
  }

  isSelected(date: string | null): boolean {
    if (!date) {
      return false;
    }
    return this.selected().has(date);
  }

  toggleCell(cell: CalendarCell, event: MouseEvent) {
    if (!cell.date) {
      return;
    }

    if (cell.kind !== 'day') {
      return;
    }

    const year = this.form.controls.year.value;
    if (!cell.date.startsWith(String(year))) {
      return;
    }

    const additive = event.ctrlKey || event.metaKey;

    if (event.shiftKey && this.lastSelectedDate) {
      this.applyRangeSelection(this.lastSelectedDate, cell.date, additive);
    } else {
      this.toggleDate(cell.date, additive);
    }

    this.lastSelectedDate = cell.date;
  }

  private toggleDate(date: string, additive: boolean) {
    this.selected.update((current) => {
      const next = new Set(current);
      if (next.has(date) && !additive) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }

  private applyRangeSelection(start: string, end: string, additive: boolean) {
    const [startDate, endDate] = start <= end ? [start, end] : [end, start];
    const cursor = new Date(startDate);
    const target = new Date(endDate);

    this.selected.update((current) => {
      const next = additive ? new Set(current) : new Set<string>();
      if (additive) {
        current.forEach((value) => next.add(value));
      }
      while (cursor <= target) {
        next.add(this.formatDateString(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      return next;
    });
  }

  selectWeekday(weekday: number) {
    const year = this.form.controls.year.value;
    const next = new Set(this.selected());
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const cursor = new Date(start);

    while (cursor <= end) {
      const currentWeekday = (cursor.getDay() + 6) % 7;
      if (currentWeekday === weekday) {
        next.add(this.formatDateString(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    this.selected.set(next);
  }

  clearSelection() {
    this.selected.set(new Set());
    this.lastSelectedDate = null;
  }

  selectWorkdays() {
    const year = this.form.controls.year.value;
    const next = new Set<string>();
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const cursor = new Date(start);
    while (cursor <= end) {
      const weekday = (cursor.getDay() + 6) % 7;
      if (weekday < 5) {
        next.add(this.formatDateString(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    this.selected.set(next);
  }

  selectWeekends() {
    const year = this.form.controls.year.value;
    const next = new Set<string>();
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const cursor = new Date(start);
    while (cursor <= end) {
      const weekday = (cursor.getDay() + 6) % 7;
      if (weekday >= 5) {
        next.add(this.formatDateString(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    this.selected.set(next);
  }

  onYearChange(yearControl: FormControl<number>) {
    yearControl.markAsTouched();
  }

  cancel(): void {
    this.dialogRef.close();
  }

  save(): void {
    if (this.form.invalid || this.selected().size === 0) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload: TrafficPeriodCreatePayload = {
      name: value.name!,
      type: value.type,
      description: value.description ?? undefined,
      responsible: value.responsible ?? undefined,
      tags: this.parseTags(value.tags),
      year: value.year,
      selectedDates: Array.from(this.selected()).sort(),
    };

    const result: TrafficPeriodEditorResult = {
      periodId: this.existingPeriod?.id,
      payload,
    };

    this.dialogRef.close(result);
  }

  selectedCount(): number {
    return this.selected().size;
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

  private formatDateString(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  extraColumns(count: number): number[] {
    if (count <= 0) {
      return [];
    }
    if (!this.emptyArrayCache.has(count)) {
      this.emptyArrayCache.set(count, Array.from({ length: count }, (_, i) => i));
    }
    return this.emptyArrayCache.get(count)!;
  }

  private patchFromExisting(period: TrafficPeriod) {
    const rule = period.rules[0];
    const year = rule?.validityStart
      ? Number.parseInt(rule.validityStart.slice(0, 4), 10)
      : this.data.defaultYear;

    this.form.patchValue({
      name: period.name,
      type: period.type,
      description: period.description ?? '',
      responsible: period.responsible ?? '',
      tags: period.tags?.join(', ') ?? '',
      year,
    });

    this.year.set(year);

    const includes = rule?.includesDates ?? [];
    if (includes.length) {
      this.selected.set(new Set(includes));
    }
  }
}
