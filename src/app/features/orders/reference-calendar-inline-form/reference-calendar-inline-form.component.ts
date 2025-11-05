import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MATERIAL_IMPORTS } from '../../../core/material.imports.imports';
import { AnnualCalendarSelectorComponent } from '../../../shared/annual-calendar-selector/annual-calendar-selector.component';

@Component({
  selector: 'app-reference-calendar-inline-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AnnualCalendarSelectorComponent, ...MATERIAL_IMPORTS],
  templateUrl: './reference-calendar-inline-form.component.html',
  styleUrl: './reference-calendar-inline-form.component.scss',
})
export class ReferenceCalendarInlineFormComponent {
  @Input({ required: true }) yearControl!: FormControl<number>;
  @Input({ required: true }) datesControl!: FormControl<string[]>;
  @Input({ required: true }) excludedDatesControl!: FormControl<string[]>;
  @Input() title = 'Referenzkalender';
  @Input() description =
    'Wähle die Verkehrstage dieses Kalenders. Markiere mindestens einen Tag.';
  @Input() hint: string | null =
    'Tipp: Shift + Klick für Bereichsauswahl, Strg/Cmd + Klick um bestehende Auswahl zu erweitern.';
  @Input() exclusionHint =
    'Wähle Tage aus, die trotz Markierung nicht gefahren werden sollen.';

  readonly minYear = 1900;
  readonly maxYear = 2100;
  mode: 'include' | 'exclude' = 'include';

  get exclusionCount(): number {
    return this.excludedDatesControl.value?.length ?? 0;
  }

  get effectiveCount(): number {
    const exclude = new Set(this.excludedDatesControl.value ?? []);
    return (this.datesControl.value ?? []).filter((date) => !exclude.has(date)).length;
  }

  get resolvedYear(): number {
    const year = this.yearControl.value;
    if (!year || Number.isNaN(year)) {
      return new Date().getFullYear();
    }
    return Math.min(this.maxYear, Math.max(this.minYear, year));
  }

  setMode(mode: 'include' | 'exclude') {
    if (this.mode !== mode) {
      this.mode = mode;
    }
  }

  onDatesChange(dates: string[]) {
    const normalized = this.normalizeDates(dates);
    this.datesControl.setValue(normalized);
    this.datesControl.markAsDirty();
    this.datesControl.markAsTouched();
    this.syncExclusions(normalized);
  }

  onExcludedDatesChange(dates: string[]) {
    const includeSet = new Set(this.datesControl.value ?? []);
    const normalized = this
      .normalizeDates(dates)
      .filter((date) => includeSet.has(date));
    this.excludedDatesControl.setValue(normalized);
    this.excludedDatesControl.markAsDirty();
    this.excludedDatesControl.markAsTouched();
  }

  onYearBlur() {
    const year = this.yearControl.value;
    if (!year || Number.isNaN(year)) {
      this.yearControl.setValue(this.resolvedYear);
      return;
    }
    const clamped = Math.min(this.maxYear, Math.max(this.minYear, year));
    if (clamped !== year) {
      this.yearControl.setValue(clamped);
    }
  }

  private normalizeDates(dates: readonly string[]): string[] {
    return Array.from(
      new Set(
        dates
          .map((date) => date?.trim())
          .filter((date): date is string => !!date),
      ),
    ).sort();
  }

  private syncExclusions(includeDates: readonly string[]) {
    const includeSet = new Set(includeDates);
    const filtered = (this.excludedDatesControl.value ?? []).filter((date) =>
      includeSet.has(date),
    );
    if (filtered.length !== this.excludedDatesControl.value.length) {
      this.excludedDatesControl.setValue(filtered);
    }
  }
}
