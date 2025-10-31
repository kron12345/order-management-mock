import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  computed,
  signal,
} from '@angular/core';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';

interface CalendarCell {
  date: string | null;
  label: string;
  weekday: number | null;
  kind: 'day' | 'leading' | 'trailing';
}

@Component({
  selector: 'app-annual-calendar-selector',
  standalone: true,
  imports: [CommonModule, ...MATERIAL_IMPORTS],
  templateUrl: './annual-calendar-selector.component.html',
  styleUrl: './annual-calendar-selector.component.scss',
})
export class AnnualCalendarSelectorComponent implements OnChanges {
  @Input() title = 'Kalender';
  @Input({ required: true }) year!: number;
  @Input() hint =
    'Tipp: Shift + Klick für Bereichsauswahl, Strg/Cmd + Klick um bestehende Auswahl zu erweitern.';
  @Input() selectedDates: readonly string[] | null = [];

  @Output() selectedDatesChange = new EventEmitter<string[]>();

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

  private readonly yearSignal = signal<number>(new Date().getFullYear());
  private readonly selected = signal<Set<string>>(new Set());
  private lastSelectedDate: string | null = null;

  readonly selectedCount = computed(() => this.selected().size);
  readonly weekGroups = computed(() => this.computeWeeks(this.yearSignal()));
  readonly maxColumnCount = computed(() =>
    this.weekGroups().reduce((max, month) => Math.max(max, month.cells.length), 0),
  );
  readonly headerLabels = computed(() =>
    Array.from({ length: this.maxColumnCount() }, (_, index) =>
      this.weekdayNames[index % this.weekdayNames.length],
    ),
  );

  readonly emptyArrayCache = new Map<number, number[]>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['year']) {
      const nextYear = this.normalizeYear(this.year);
      if (this.yearSignal() !== nextYear) {
        this.yearSignal.set(nextYear);
        this.lastSelectedDate = null;
      }
    }
    if (changes['selectedDates']) {
      const incoming = new Set(
        (this.selectedDates ?? []).map((date) => date.trim()).filter(Boolean),
      );
      this.selected.set(incoming);
    }
  }

  isSelected(date: string | null): boolean {
    if (!date) {
      return false;
    }
    return this.selected().has(date);
  }

  currentYear(): number {
    return this.yearSignal();
  }

  toggleCell(cell: CalendarCell, event: MouseEvent) {
    if (!cell.date || cell.kind !== 'day') {
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

  clearSelection() {
    const next = new Set<string>();
    this.updateSelection(next);
    this.lastSelectedDate = null;
  }

  selectWorkdays() {
    const next = this.collectByPredicate((weekday) => weekday < 5, false);
    this.updateSelection(next);
  }

  selectWeekends() {
    const next = this.collectByPredicate((weekday) => weekday >= 5, false);
    this.updateSelection(next);
  }

  toggleWeekday(weekday: number) {
    const dates = this.datesForWeekday(this.yearSignal(), weekday);
    if (!dates.length) {
      return;
    }
    const next = new Set(this.selected());
    const activate = !dates.every((date) => next.has(date));
    if (activate) {
      dates.forEach((date) => next.add(date));
    } else {
      dates.forEach((date) => next.delete(date));
    }
    this.updateSelection(next);
  }

  weekdaySelected(weekday: number): boolean {
    const dates = this.datesForWeekday(this.yearSignal(), weekday);
    if (!dates.length) {
      return false;
    }
    const selected = this.selected();
    return dates.every((date) => selected.has(date));
  }

  headerLabelsForRender(): string[] {
    return this.headerLabels();
  }

  extraColumns(count: number): number[] {
    if (count <= 0) {
      return [];
    }
    if (!this.emptyArrayCache.has(count)) {
      this.emptyArrayCache.set(count, Array.from({ length: count }, (_, index) => index));
    }
    return this.emptyArrayCache.get(count)!;
  }

  private updateSelection(next: Set<string>) {
    this.selected.set(next);
    this.emitSelection(next);
  }

  private toggleDate(date: string, additive: boolean) {
    const next = new Set(this.selected());
    if (next.has(date) && !additive) {
      next.delete(date);
    } else {
      next.add(date);
    }
    this.updateSelection(next);
  }

  private applyRangeSelection(start: string, end: string, additive: boolean) {
    const [rangeStart, rangeEnd] = start <= end ? [start, end] : [end, start];
    const cursor = new Date(rangeStart);
    const target = new Date(rangeEnd);

    const base = additive ? new Set(this.selected()) : new Set<string>();
    if (additive) {
      this.selected().forEach((value) => base.add(value));
    }

    while (cursor <= target) {
      base.add(this.formatDateString(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    this.updateSelection(base);
  }

  private collectByPredicate(
    predicate: (weekday: number) => boolean,
    additive: boolean,
  ): Set<string> {
    const year = this.yearSignal();
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const cursor = new Date(start);
    const next = additive ? new Set(this.selected()) : new Set<string>();

    while (cursor <= end) {
      const weekday = (cursor.getDay() + 6) % 7;
      if (predicate(weekday)) {
        next.add(this.formatDateString(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return next;
  }

  private datesForWeekday(year: number, weekday: number): string[] {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const cursor = new Date(start);
    const result: string[] = [];
    while (cursor <= end) {
      const current = (cursor.getDay() + 6) % 7;
      if (current === weekday) {
        result.push(this.formatDateString(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  private emitSelection(set: Set<string>) {
    this.selectedDatesChange.emit(
      Array.from(set)
        .map((date) => date.trim())
        .filter(Boolean)
        .sort(),
    );
  }

  private computeWeeks(year: number) {
    const weeksPerMonth: { cells: CalendarCell[]; weekCount: number }[] = [];

    for (let month = 0; month < 12; month++) {
      const cells: CalendarCell[] = [];
      const firstDay = new Date(year, month, 1);
      const offset = (firstDay.getDay() + 6) % 7;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const weekCount = Math.ceil((offset + daysInMonth) / 7);
      const totalCells = weekCount * 7;

      for (let index = 0; index < totalCells; index++) {
        const dayNumber = index - offset + 1;
        if (index < offset) {
          cells.push({ date: null, label: '', weekday: null, kind: 'leading' });
        } else if (dayNumber > daysInMonth) {
          cells.push({ date: null, label: '', weekday: null, kind: 'trailing' });
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

  private formatDateString(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private normalizeYear(year: number | undefined | null): number {
    if (!year || Number.isNaN(year)) {
      return new Date().getFullYear();
    }
    return Math.min(2100, Math.max(1900, Math.trunc(year)));
  }
}
