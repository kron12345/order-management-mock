import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import {
  Timetable,
  TimetableMilestone,
  TimetablePhase,
  TimetableSourceType,
  TimetableStop,
} from '../../core/models/timetable.model';
import {
  TimetableService,
  TimetableSort,
  TimetableStopInput,
  UpdateOperationalTimingPayload,
} from '../../core/services/timetable.service';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { TimetableCreateDialogComponent } from './timetable-create-dialog.component';
import { TimetableOperationalDialogComponent } from './timetable-operational-dialog.component';
import {
  PlanAssemblyDialogComponent,
  PlanAssemblyDialogData,
  PlanAssemblyDialogResult,
} from '../orders/plan-assembly-dialog/plan-assembly-dialog.component';
import { TrainPlanStop } from '../../core/models/train-plan.model';

interface SortOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-timetable-manager',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS],
  templateUrl: './timetable-manager.component.html',
  styleUrl: './timetable-manager.component.scss',
})
export class TimetableManagerComponent {
  private readonly timetableService = inject(TimetableService);
  private readonly dialog = inject(MatDialog);

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly filters = computed(() => this.timetableService.filters());
  readonly sort = computed(() => this.timetableService.sort());
  readonly timetables = computed(() => this.timetableService.filteredTimetables());
  readonly responsibleRus = computed(() => this.timetableService.responsibleRus());

  readonly phaseLabels: Record<TimetablePhase, string> = {
    bedarf: 'Bedarf',
    path_request: 'Trassenanmeldung',
    offer: 'Angebot',
    contract: 'Vertrag',
    operational: 'Betrieb',
    archived: 'Archiv',
  };

  readonly sourceLabels: Record<TimetableSourceType, string> = {
    ttt_path_request: 'TTT Path Request',
    framework_agreement: 'Rahmenvertrag',
    manual: 'Manuell',
    imported: 'Import',
  };

  readonly statusOptions: { value: TimetablePhase | 'all'; label: string }[] = [
    { value: 'all', label: 'Alle Phasen' },
    { value: 'bedarf', label: 'Bedarf' },
    { value: 'path_request', label: 'Trassenanmeldung' },
    { value: 'offer', label: 'Angebot' },
    { value: 'contract', label: 'Vertrag' },
    { value: 'operational', label: 'Betrieb' },
    { value: 'archived', label: 'Archiv' },
  ];

  readonly sourceOptions: { value: TimetableSourceType | 'all'; label: string }[] = [
    { value: 'all', label: 'Alle Quellen' },
    { value: 'ttt_path_request', label: 'TTT Path Request' },
    { value: 'framework_agreement', label: 'Rahmenvertrag' },
    { value: 'manual', label: 'Manuell' },
    { value: 'imported', label: 'Import' },
  ];

  readonly sortOptions: SortOption[] = [
    { value: 'updatedAt:desc', label: 'Zuletzt aktualisiert' },
    { value: 'refTrainId:asc', label: 'RefTrainID' },
    { value: 'trainNumber:asc', label: 'Zugnummer' },
    { value: 'status:asc', label: 'Status' },
  ];

  readonly errorMessage = signal<string | null>(null);

  constructor() {
    this.searchControl.setValue(this.filters().search, { emitEvent: false });
    this.searchControl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => this.timetableService.setFilters({ search: value }));

    effect(() => {
      const current = this.filters().search;
      if (this.searchControl.value !== current) {
        this.searchControl.setValue(current, { emitEvent: false });
      }
    });
  }

  onStatusFilterChange(value: TimetablePhase | 'all') {
    this.timetableService.setFilters({ status: value });
  }

  onSourceFilterChange(value: TimetableSourceType | 'all') {
    this.timetableService.setFilters({ source: value });
  }

  onRuFilterChange(value: string | 'all') {
    this.timetableService.setFilters({ responsibleRu: value });
  }

  onSortChange(value: string) {
    const [field, direction] = value.split(':') as [
      TimetableSort['field'],
      TimetableSort['direction'],
    ];
    this.timetableService.setSort({ field, direction });
  }

  sortSelection(sort: TimetableSort): string {
    return `${sort.field}:${sort.direction}`;
  }

  createTimetable() {
    this.errorMessage.set(null);
    this.dialog.open(TimetableCreateDialogComponent, {
      width: '960px',
      maxWidth: '95vw',
      maxHeight: '95vh',
    });
  }

  editStops(timetable: Timetable) {
    const stops = timetable.stops.map((stop) => this.toTrainPlanStop(stop));
    this.dialog
      .open<
        PlanAssemblyDialogComponent,
        PlanAssemblyDialogData,
        PlanAssemblyDialogResult | undefined
      >(PlanAssemblyDialogComponent, {
        width: '1320px',
        maxWidth: '95vw',
        maxHeight: 'calc(100vh - 48px)',
        panelClass: 'plan-assembly-dialog-panel',
        data: { stops },
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result?.stops?.length) {
          return;
        }
        try {
          const inputs = result.stops.map((stop, index) => this.toTimetableStopInput(stop, index));
          this.timetableService.replaceStops(timetable.refTrainId, inputs);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Halte konnten nicht übernommen werden.';
          this.errorMessage.set(message);
        }
      });
  }

  editOperationalStop(timetable: Timetable, stop: TimetableStop) {
    this.dialog
      .open(TimetableOperationalDialogComponent, {
        width: '480px',
        maxWidth: '95vw',
        data: { stop },
      })
      .afterClosed()
      .subscribe((result: UpdateOperationalTimingPayload | undefined) => {
        if (!result) {
          return;
        }
        try {
          this.timetableService.updateOperationalTimings(timetable.refTrainId, [result]);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Änderung konnte nicht gespeichert werden.';
          this.errorMessage.set(message);
        }
      });
  }

  syncOperationalWithCommercial(timetable: Timetable) {
    try {
      const updates = timetable.stops.map((stop) => ({
        stopId: stop.id,
        arrivalTime: stop.commercial.arrivalTime,
        arrivalOffsetDays: stop.commercial.arrivalOffsetDays,
        departureTime: stop.commercial.departureTime,
        departureOffsetDays: stop.commercial.departureOffsetDays,
        dwellMinutes: stop.commercial.dwellMinutes,
        remarks: stop.commercial.remarks,
      }));
      this.timetableService.updateOperationalTimings(timetable.refTrainId, updates);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Betriebliche Zeiten konnten nicht synchronisiert werden.';
      this.errorMessage.set(message);
    }
  }

  formatTime(timing: { time?: string; offset?: number }): string {
    if (!timing.time) {
      return '–';
    }
    const offset = timing.offset ?? 0;
    return offset ? `${timing.time} (+${offset}T)` : timing.time;
  }

  arrivalDelta(stop: TimetableStop): string | null {
    const delta = this.computeDeltaMinutes(
      stop.commercial.arrivalTime,
      stop.commercial.arrivalOffsetDays,
      stop.operational.arrivalTime,
      stop.operational.arrivalOffsetDays,
    );
    return delta !== undefined ? this.formatDelta(delta) : null;
  }

  departureDelta(stop: TimetableStop): string | null {
    const delta = this.computeDeltaMinutes(
      stop.commercial.departureTime,
      stop.commercial.departureOffsetDays,
      stop.operational.departureTime,
      stop.operational.departureOffsetDays,
    );
    return delta !== undefined ? this.formatDelta(delta) : null;
  }

  deltaClass(delta: string | null): string {
    if (!delta || delta === '±0') {
      return 'delta-neutral';
    }
    return delta.startsWith('+') ? 'delta-positive' : 'delta-negative';
  }

  milestoneStatusClass(milestone: TimetableMilestone): string {
    switch (milestone.status) {
      case 'completed':
        return 'milestone--completed';
      case 'in_progress':
        return 'milestone--progress';
      case 'blocked':
        return 'milestone--blocked';
      default:
        return 'milestone--open';
    }
  }

  timetableStatusClass(timetable: Timetable): string {
    return `timetable-card__header--${timetable.status}`;
  }

  phaseChipIcon(phase: TimetablePhase): string {
    switch (phase) {
      case 'bedarf':
        return 'lightbulb';
      case 'path_request':
        return 'description';
      case 'offer':
        return 'local_offer';
      case 'contract':
        return 'task_alt';
      case 'operational':
        return 'directions_railway';
      case 'archived':
      default:
        return 'inventory_2';
    }
  }

  trackByTimetable(_: number, timetable: Timetable) {
    return timetable.refTrainId;
  }

  trackByStop(_: number, stop: TimetableStop) {
    return stop.id;
  }

  private toTrainPlanStop(stop: TimetableStop): TrainPlanStop {
    return {
      id: stop.id,
      sequence: stop.sequence,
      type: stop.type,
      locationCode: stop.locationCode,
      locationName: stop.locationName,
      countryCode: stop.countryCode,
      arrivalTime: stop.commercial.arrivalTime ?? stop.operational.arrivalTime,
      departureTime:
        stop.commercial.departureTime ?? stop.operational.departureTime,
      arrivalOffsetDays:
        stop.commercial.arrivalOffsetDays ?? stop.operational.arrivalOffsetDays,
      departureOffsetDays:
        stop.commercial.departureOffsetDays ??
        stop.operational.departureOffsetDays,
      dwellMinutes:
        stop.commercial.dwellMinutes ?? stop.operational.dwellMinutes,
      activities: [...stop.activities],
      platform: stop.platform,
      notes: stop.notes ?? stop.commercial.remarks ?? stop.operational.remarks,
    };
  }

  private toTimetableStopInput(
    stop: PlanAssemblyDialogResult['stops'][number],
    index: number,
  ): TimetableStopInput {
    return {
      sequence: index + 1,
      type: stop.type,
      locationCode: stop.locationCode,
      locationName: stop.locationName,
      countryCode: stop.countryCode,
      arrivalTime: stop.arrivalTime,
      departureTime: stop.departureTime,
      arrivalOffsetDays: stop.arrivalOffsetDays,
      departureOffsetDays: stop.departureOffsetDays,
      dwellMinutes: stop.dwellMinutes,
      activities: stop.activities?.length ? stop.activities : ['0001'],
      platform: stop.platform,
      notes: stop.notes,
    };
  }

  private computeDeltaMinutes(
    commercialTime?: string,
    commercialOffset?: number,
    operationalTime?: string,
    operationalOffset?: number,
  ): number | undefined {
    const commercialMinutes = this.toTotalMinutes(commercialTime, commercialOffset);
    const operationalMinutes = this.toTotalMinutes(operationalTime, operationalOffset);
    if (commercialMinutes === undefined || operationalMinutes === undefined) {
      return undefined;
    }
    return operationalMinutes - commercialMinutes;
  }

  private toTotalMinutes(time?: string, offset?: number): number | undefined {
    if (!time) {
      return undefined;
    }
    const parts = time.split(':');
    if (parts.length !== 2) {
      return undefined;
    }
    const hours = Number.parseInt(parts[0], 10);
    const minutes = Number.parseInt(parts[1], 10);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return undefined;
    }
    return (offset ?? 0) * 24 * 60 + hours * 60 + minutes;
  }

  private formatDelta(delta: number): string {
    if (delta === 0) {
      return '±0';
    }
    const prefix = delta > 0 ? '+' : '';
    return `${prefix}${delta}′`;
  }
}
