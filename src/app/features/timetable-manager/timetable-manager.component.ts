import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import {
  TimetableHubRecord,
  TimetableHubRouteMetadata,
  TimetableHubSectionKey,
  TimetableHubService,
  TimetableHubStopSummary,
  TimetableHubTechnicalSummary,
} from '../../core/services/timetable-hub.service';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TimetableYearService } from '../../core/services/timetable-year.service';
import { MatDialog } from '@angular/material/dialog';
import {
  TimetableTestTrainDialogComponent,
  TimetableTestTrainDialogResult,
} from './timetable-test-train-dialog.component';

type DialogStopValue = TimetableTestTrainDialogResult['stops'][number];

@Component({
  selector: 'app-timetable-manager',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS],
  templateUrl: './timetable-manager.component.html',
  styleUrl: './timetable-manager.component.scss',
})
export class TimetableManagerComponent {
  private readonly hubService = inject(TimetableHubService);
  private readonly route = inject(ActivatedRoute);
  private readonly yearService = inject(TimetableYearService);
  private readonly dialog = inject(MatDialog);

  readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchTerm = signal('');

  readonly records = computed(() => this.hubService.records());
  readonly filteredRecords = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const items = this.records();
    if (!term) {
      return items;
    }
    return items.filter((record) => {
      const haystack = `${record.refTrainId} ${record.trainNumber} ${record.title}`.toLowerCase();
      return haystack.includes(term);
    });
  });
  readonly activeRecord = signal<TimetableHubRecord | null>(null);
  readonly activeSection = signal<TimetableHubSectionKey>('commercial');

  readonly sectionTabs: { key: TimetableHubSectionKey; label: string }[] = [
    { key: 'commercial', label: 'Kommerzieller Fahrplan' },
    { key: 'operational', label: 'Betrieblicher Fahrplan' },
    { key: 'actual', label: 'Ist-Fahrdaten' },
  ];
  constructor() {
    this.searchControl.valueChanges
      .pipe(debounceTime(150), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => this.searchTerm.set(value));

    const initialSearch = this.route.snapshot.queryParamMap.get('search');
    if (initialSearch) {
      this.searchControl.setValue(initialSearch);
      this.searchTerm.set(initialSearch);
    }

    effect(() => {
      const list = this.filteredRecords();
      const current = this.activeRecord();
      if (!list.length) {
        this.activeRecord.set(null);
        return;
      }
      if (!current || !list.some((record) => record.refTrainId === current.refTrainId)) {
        this.activeRecord.set(list[0]);
        this.activeSection.set('commercial');
      }
    });
  }

  selectRecord(record: TimetableHubRecord) {
    if (this.activeRecord()?.refTrainId === record.refTrainId) {
      return;
    }
    this.activeRecord.set(record);
    this.activeSection.set('commercial');
  }

  selectSection(section: TimetableHubSectionKey) {
    this.activeSection.set(section);
  }

  clearSearch() {
    if (!this.searchControl.value) {
      return;
    }
    this.searchControl.setValue('');
    this.searchTerm.set('');
  }

  trackRecord(_: number, record: TimetableHubRecord): string {
    return record.refTrainId;
  }

  calendarPreview(record: TimetableHubRecord): string[] {
    return record.calendarDays.slice(0, 8);
  }

  calendarOverflow(record: TimetableHubRecord): number {
    return Math.max(record.calendarDays.length - 8, 0);
  }

  activeSectionData = computed(() => {
    const record = this.activeRecord();
    if (!record) {
      return null;
    }
    switch (this.activeSection()) {
      case 'operational':
        return record.operational;
      case 'actual':
        return record.actual;
      default:
        return record.commercial;
    }
  });

  stopTimeLabel(stop: TimetableHubStopSummary): string {
    if (stop.arrivalTime && stop.departureTime) {
      return `${this.formatClock(stop.arrivalTime)} / ${this.formatClock(stop.departureTime)}`;
    }
    if (stop.arrivalTime) {
      return this.formatClock(stop.arrivalTime);
    }
    if (stop.departureTime) {
      return this.formatClock(stop.departureTime);
    }
    return '—';
  }

  private formatClock(value: string | undefined): string {
    if (!value) {
      return '—';
    }
    if (!value.includes('T')) {
      return value.length ? value : '—';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value.length >= 5 ? value.slice(0, 5) : '—';
    }
    return date.toISOString().slice(11, 16);
  }

  yearOptions(): string[] {
    const labels = new Set<string>();
    this.records().forEach((record) => labels.add(record.timetableYearLabel));
    if (!labels.size) {
      labels.add(this.yearService.defaultYearBounds().label);
    }
    return Array.from(labels).sort();
  }

  openCreationDialog() {
    const ref = this.dialog.open(TimetableTestTrainDialogComponent, {
      width: '720px',
      data: {
        yearOptions: this.yearOptions(),
        sectionTabs: this.sectionTabs,
        defaultYearLabel: this.yearService.defaultYearBounds().label,
      },
    });
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed())
      .subscribe((result?: TimetableTestTrainDialogResult) => {
        if (result) {
          this.createPlanFromDialog(result);
        }
      });
  }

  private expandDateRange(startIso: string, endIso: string): string[] {
    if (!startIso || !endIso) {
      return [];
    }
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return [];
    }
    const result: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end && result.length <= 1096) {
      result.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  private generateRefTrainId(yearLabel: string): string {
    const yearDigits = yearLabel.replace(/\D/g, '').slice(0, 4) || '0000';
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `TT-${yearDigits}-${random}`;
  }

  hasTechnicalData(record: TimetableHubRecord | null): boolean {
    const technical = record?.technical;
    if (!technical) {
      return false;
    }
    const numericFields = [technical.maxSpeed, technical.lengthMeters, technical.weightTons];
    if (numericFields.some((value) => value !== null && value !== undefined && !Number.isNaN(value))) {
      return true;
    }
    return Boolean(
      (technical.trainType ?? '').trim() ||
        (technical.traction ?? '').trim() ||
        (technical.energyType ?? '').trim() ||
        (technical.brakeType ?? '').trim() ||
        (technical.etcsLevel ?? '').trim(),
    );
  }

  technicalValue(value: number | null | undefined, unit?: string): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '—';
    }
    return unit ? `${value} ${unit}` : `${value}`;
  }

  textValue(value?: string | null): string {
    return value?.trim() || '—';
  }

  hasRouteMetadata(record: TimetableHubRecord | null): boolean {
    const metadata = record?.routeMetadata;
    if (!metadata) {
      return false;
    }
    return Boolean(
      (metadata.originBorderPoint ?? '').trim() ||
        (metadata.destinationBorderPoint ?? '').trim() ||
        (metadata.borderNotes ?? '').trim(),
    );
  }

  routePointLabel(
    metadata: TimetableHubRouteMetadata | undefined,
    key: 'originBorderPoint' | 'destinationBorderPoint',
  ): string {
    if (!metadata) {
      return '—';
    }
    return metadata[key]?.trim() || '—';
  }

  routeNotes(metadata: TimetableHubRouteMetadata | undefined): string {
    if (!metadata) {
      return '—';
    }
    return metadata.borderNotes?.trim() || '—';
  }

  private createPlanFromDialog(result: TimetableTestTrainDialogResult) {
    const calendarDays = this.expandDateRange(result.calendarStart, result.calendarEnd);
    if (!calendarDays.length) {
      return;
    }
    const stops = this.buildStopsFromDialog(result.stops, calendarDays[0]);
    if (!stops.length) {
      return;
    }
    const refTrainId = this.generateRefTrainId(result.timetableYearLabel);
    this.hubService.registerPlanUpdate({
      refTrainId,
      trainNumber: result.trainNumber.trim(),
      title: result.title.trim(),
      timetableYearLabel: result.timetableYearLabel,
      calendarDays,
      section: result.section,
      stops,
      notes: 'Manuell erstellt im Fahrplanmanager',
      technical: result.technical,
      routeMetadata: result.routeMetadata,
    });
    const newlyCreated = this.hubService.findByRefTrainId(refTrainId);
    if (newlyCreated) {
      this.selectRecord(newlyCreated);
      this.activeSection.set(result.section);
      this.searchControl.setValue(refTrainId);
      this.searchTerm.set(refTrainId);
    }
  }

  private buildStopsFromDialog(
    stops: DialogStopValue[],
    referenceDay: string,
  ): TimetableHubStopSummary[] {
    return stops.map((stop, index) => ({
      sequence: index + 1,
      locationName: stop.locationName.trim(),
      type: stop.type,
      arrivalTime: this.combineDateWithTime(referenceDay, stop.arrivalTime),
      departureTime: this.combineDateWithTime(referenceDay, stop.departureTime),
      holdReason: 'Planhalt',
      responsibleRu: 'TTT',
      vehicleInfo: 'n/a',
    }));
  }

  private combineDateWithTime(date: string, time?: string | null): string | undefined {
    if (!time) {
      return undefined;
    }
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
    if (!match) {
      return undefined;
    }
    const [year, month, day] = date.split('-').map((part) => Number.parseInt(part, 10));
    if ([year, month, day].some((value) => Number.isNaN(value))) {
      return undefined;
    }
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    const composed = new Date(year, month - 1, day, hours, minutes, 0, 0);
    return Number.isNaN(composed.getTime()) ? undefined : composed.toISOString();
  }
}
