import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Resource } from '../models/resource';
import { TemporalValue } from '../models/master-data';

interface AttributeEntry {
  key: string;
  value: string;
}

@Component({
  selector: 'app-gantt-resources',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gantt-resources.component.html',
  styleUrl: './gantt-resources.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GanttResourcesComponent implements OnChanges {
  @Input({ required: true }) resource!: Resource;
  protected attributeEntries: AttributeEntry[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['resource'] && this.resource) {
      this.attributeEntries = this.buildAttributeEntries(this.resource);
    }
  }

  private buildAttributeEntries(resource: Resource): AttributeEntry[] {
    const attributes = resource.attributes;
    if (!attributes) {
      return [];
    }

    return Object.entries(attributes).map(([key, rawValue]) => ({
      key,
      value: this.formatAttributeValue(rawValue),
    }));
  }

  private formatAttributeValue(value: unknown): string {
    if (value == null) {
      return '—';
    }

    if (this.isTemporalValue(value)) {
      return this.stringifyValue(this.resolveTemporalValue([value]));
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return '—';
      }

      if (value.every((entry) => this.isTemporalValue(entry))) {
        return this.stringifyValue(this.resolveTemporalValue(value as TemporalValue<unknown>[]));
      }

      const formatted = value
        .map((entry) => this.stringifyValue(entry))
        .filter((entry) => entry.length > 0);

      return formatted.length > 0 ? formatted.join(', ') : '—';
    }

    return this.stringifyValue(value);
  }

  private resolveTemporalValue(entries: TemporalValue<unknown>[]): unknown | null {
    const normalized = entries
      .filter((entry): entry is TemporalValue<unknown> => !!entry && entry.value !== undefined && entry.value !== null)
      .map((entry) => ({
        value: entry.value,
        validFrom: entry.validFrom ?? '',
        validTo: entry.validTo ?? null,
      }));

    if (normalized.length === 0) {
      return null;
    }

    const today = this.currentDate();
    const active = normalized.find((entry) => this.isDateInRange(today, entry.validFrom, entry.validTo));
    const sorted = [...normalized].sort((a, b) => (b.validFrom ?? '').localeCompare(a.validFrom ?? ''));
    const current = active ?? sorted[0];

    return current?.value ?? null;
  }

  private stringifyValue(value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return '—';
    }

    if (typeof value === 'boolean') {
      return value ? 'Ja' : 'Nein';
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : '—';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return '—';
      }

      const formatted = value
        .map((entry) => this.stringifyValue(entry))
        .filter((entry) => entry.length > 0);

      return formatted.length > 0 ? formatted.join(', ') : '—';
    }

    try {
      return JSON.stringify(value);
    } catch (_error) {
      return '—';
    }
  }

  private isTemporalValue(entry: unknown): entry is TemporalValue<unknown> {
    if (!entry || typeof entry !== 'object') {
      return false;
    }

    const candidate = entry as Record<string, unknown>;
    return 'value' in candidate && 'validFrom' in candidate;
  }

  private currentDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private isDateInRange(date: string, from?: string | null, to?: string | null): boolean {
    const afterStart = !from || date >= from;
    const beforeEnd = !to || date <= to;
    return afterStart && beforeEnd;
  }
}
