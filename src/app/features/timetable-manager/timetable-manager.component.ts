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
  TimetableRollingStock,
  TimetableRollingStockSegment,
  TimetableRollingStockSegmentRole,
  TimetableRollingStockOperation,
  TimetableCalendarModification,
  TimetableCalendarVariant,
  TimetableCalendarVariantType,
  TimetableResponsibility,
  TimetableAuditEntry,
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
import { VehicleComposition, VehicleType } from '../../models/master-data';
import { DEMO_MASTER_DATA } from '../../data/demo-master-data';
import {
  TimetableRollingStockDialogComponent,
  RollingStockDialogData,
} from './timetable-rolling-stock-dialog.component';
import { TimetableResponsibilitiesDialogComponent } from './timetable-responsibilities-dialog.component';
import { TimetableCalendarVariantsDialogComponent } from './timetable-calendar-variants-dialog.component';
import {
  TimetableAuditDialogComponent,
  TimetableAuditDialogData,
  TimetableAuditDialogResult,
} from './timetable-audit-dialog.component';
import {
  TimetableTttSyncDialogComponent,
} from './timetable-ttt-sync-dialog.component';
import { ActivatedRoute } from '@angular/router';

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
  private readonly route = inject(ActivatedRoute);

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

  private readonly vehicleTypeMap = new Map<string, VehicleType>(
    DEMO_MASTER_DATA.vehicleTypes.map((type) => [type.id, type]),
  );
  private readonly vehicleCompositionMap = new Map<string, VehicleComposition>(
    DEMO_MASTER_DATA.vehicleCompositions.map((composition) => [composition.id, composition]),
  );

  private readonly tiltingLabels: Record<'none' | 'passive' | 'active', string> = {
    none: 'Keine',
    passive: 'Passiv',
    active: 'Aktiv',
  };

  private readonly segmentRoleLabels: Record<TimetableRollingStockSegmentRole, string> = {
    leading: 'Führend',
    intermediate: 'Mittelteil',
    trailing: 'Schiebend',
    powercar: 'Triebkopf',
  };

  private readonly calendarModificationTypeLabels: Record<
    TimetableCalendarModification['type'],
    string
  > = {
    cancelled: 'Ausfall',
    modified_timetable: 'Geänderter Fahrplan',
    rolling_stock_change: 'Rolling Stock Wechsel',
    replacement_service: 'Ersatzverkehr',
  };

  private readonly calendarModificationTypeIcons: Record<
    TimetableCalendarModification['type'],
    string
  > = {
    cancelled: 'cancel',
    modified_timetable: 'schedule',
    rolling_stock_change: 'train',
    replacement_service: 'directions_bus',
  };

  private readonly calendarVariantTypeLabels: Record<TimetableCalendarVariantType, string> = {
    series: 'Serie',
    special_day: 'Sondertag',
    block: 'Sperrtag',
    replacement: 'Ersatztag',
  };

  private readonly calendarVariantTypeIcons: Record<TimetableCalendarVariantType, string> = {
    series: 'event_repeat',
    special_day: 'event',
    block: 'block',
    replacement: 'sync_alt',
  };

  private readonly calendarVariantAppliesLabels: Record<'commercial' | 'operational' | 'both', string> = {
    commercial: 'Kommerziell',
    operational: 'Betrieblich',
    both: 'Kommerziell & Betrieblich',
  };

  private readonly rollingStockOperationLabels: Record<
    TimetableRollingStockOperation['type'],
    string
  > = {
    split: 'Flügeln',
    join: 'Vereinen',
    reconfigure: 'Rekonfiguration',
  };

  private readonly rollingStockOperationIcons: Record<
    TimetableRollingStockOperation['type'],
    string
  > = {
    split: 'call_split',
    join: 'call_merge',
    reconfigure: 'settings',
  };

  private readonly responsibilityScopeLabels: Record<
    TimetableResponsibility['scope'],
    string
  > = {
    calendar: 'Kalender',
    rolling_stock: 'Fahrzeuge',
    operations: 'Betrieb',
    commercial: 'Kommerziell',
    integration: 'Integration',
  };

  private readonly responsibilityStatusLabels: Record<
    NonNullable<TimetableResponsibility['status']>,
    string
  > = {
    open: 'Offen',
    in_progress: 'In Arbeit',
    completed: 'Abgeschlossen',
  };

  private readonly responsibilityStatusClasses: Record<
    NonNullable<TimetableResponsibility['status']>,
    string
  > = {
    open: 'responsibility-status--open',
    in_progress: 'responsibility-status--progress',
    completed: 'responsibility-status--completed',
  };

  private readonly auditEntityLabels: Record<
    NonNullable<TimetableAuditEntry['relatedEntity']>,
    string
  > = {
    calendar: 'Kalender',
    rolling_stock: 'Fahrzeuge',
    milestone: 'Meilensteine',
    responsibility: 'Aufgaben',
    operations: 'Betrieb',
    other: 'Allgemein',
  };

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

    const initialSearch = this.route.snapshot.queryParamMap.get('search');
    if (initialSearch) {
      this.timetableService.setFilters({ search: initialSearch });
    }
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const search = params.get('search');
        if (search !== null && search !== this.filters().search) {
          this.timetableService.setFilters({ search });
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

  editRollingStock(timetable: Timetable) {
    this.errorMessage.set(null);
    this.dialog
      .open<TimetableRollingStockDialogComponent, RollingStockDialogData, TimetableRollingStock | null>(
        TimetableRollingStockDialogComponent,
        {
        width: '980px',
        maxWidth: '95vw',
        data: {
          rollingStock: timetable.rollingStock,
          vehicleTypes: DEMO_MASTER_DATA.vehicleTypes,
          vehicleCompositions: DEMO_MASTER_DATA.vehicleCompositions,
          stops: timetable.stops.map((stop) => ({
            id: stop.id,
            locationName: stop.locationName,
            sequence: stop.sequence,
          })),
        },
        },
      )
      .afterClosed()
      .subscribe((result) => {
        if (result === undefined) {
          return;
        }
        try {
          this.timetableService.updateRollingStock(timetable.refTrainId, result);
          this.errorMessage.set(null);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Fahrzeugdaten konnten nicht gespeichert werden.';
          this.errorMessage.set(message);
        }
      });
  }

  editCalendarVariants(timetable: Timetable) {
    this.errorMessage.set(null);
    this.dialog
      .open<
        TimetableCalendarVariantsDialogComponent,
        { variants: TimetableCalendarVariant[]; calendar: Timetable['calendar'] },
        TimetableCalendarVariant[] | null
      >(TimetableCalendarVariantsDialogComponent, {
        width: '880px',
        maxWidth: '95vw',
        data: {
          variants: timetable.calendarVariants ?? [],
          calendar: timetable.calendar,
        },
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }
        try {
          this.timetableService.updateCalendarVariants(timetable.refTrainId, result);
          this.errorMessage.set(null);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Kalender-Varianten konnten nicht gespeichert werden.';
          this.errorMessage.set(message);
        }
      });
  }

  editResponsibilities(timetable: Timetable) {
    this.errorMessage.set(null);
    this.dialog
      .open<
        TimetableResponsibilitiesDialogComponent,
        { responsibilities: TimetableResponsibility[]; responsibleRu: string },
        TimetableResponsibility[] | null
      >(TimetableResponsibilitiesDialogComponent, {
        width: '860px',
        maxWidth: '95vw',
        data: {
          responsibilities: timetable.responsibilities ?? [],
          responsibleRu: timetable.responsibleRu,
        },
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }
        try {
          this.timetableService.updateResponsibilities(timetable.refTrainId, result);
          this.errorMessage.set(null);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Verantwortlichkeiten konnten nicht gespeichert werden.';
          this.errorMessage.set(message);
        }
      });
  }

  addAuditEntry(timetable: Timetable) {
    this.errorMessage.set(null);
    this.dialog
      .open<
        TimetableAuditDialogComponent,
        TimetableAuditDialogData,
        TimetableAuditDialogResult | undefined
      >(TimetableAuditDialogComponent, {
        width: '560px',
        maxWidth: '95vw',
        data: {
          defaultActor: timetable.responsibleRu,
        },
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }
        try {
          this.timetableService.appendAuditEntry(timetable.refTrainId, result);
          this.errorMessage.set(null);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Audit-Eintrag konnte nicht gespeichert werden.';
          this.errorMessage.set(message);
        }
      });
  }

  syncWithTtt(timetable: Timetable) {
    this.errorMessage.set(null);
    this.dialog
      .open<TimetableTttSyncDialogComponent, { timetable: Timetable }, { applied: boolean } | undefined>(
        TimetableTttSyncDialogComponent,
        {
          width: '900px',
          maxWidth: '95vw',
          data: { timetable },
        },
      )
      .afterClosed()
      .subscribe((result) => {
        if (result?.applied) {
          this.errorMessage.set('TTT-Import erfolgreich übernommen.');
        }
      });
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

  trackByRollingStockSegment(
    _: number,
    segment: TimetableRollingStockSegment,
  ) {
    return `${segment.position}-${segment.vehicleTypeId}`;
  }

  vehicleTypeLabel(typeId: string): string {
    return this.vehicleTypeMap.get(typeId)?.label ?? typeId;
  }

  segmentRoleLabel(role: TimetableRollingStockSegmentRole | undefined | null): string {
    if (!role) {
      return '—';
    }
    return this.segmentRoleLabels[role] ?? role;
  }

  tiltingLabel(tilting: TimetableRollingStock['tiltingCapability'] | undefined | null): string {
    if (!tilting) {
      return '—';
    }
    return this.tiltingLabels[tilting] ?? tilting;
  }

  formatList(values: string[] | undefined | null): string {
    if (!values || !values.length) {
      return '—';
    }
    return values.join(', ');
  }

  rollingStockCompositionLabel(rolling: TimetableRollingStock): string {
    if (!rolling.compositionId) {
      return '—';
    }
    const composition = this.vehicleCompositionMap.get(rolling.compositionId);
    if (!composition) {
      return rolling.compositionId;
    }
    return `${composition.name} (${composition.id})`;
  }

  calendarVariantLabel(type: TimetableCalendarVariantType): string {
    return this.calendarVariantTypeLabels[type] ?? type;
  }

  calendarVariantIcon(type: TimetableCalendarVariantType): string {
    return this.calendarVariantTypeIcons[type] ?? 'event';
  }

  calendarVariantScopeLabel(scope: 'commercial' | 'operational' | 'both'): string {
    return this.calendarVariantAppliesLabels[scope] ?? scope;
  }

  variantDatesLabel(variant: TimetableCalendarVariant): string {
    if (!variant.dates?.length) {
      return '—';
    }
    return variant.dates.join(', ');
  }

  calendarModificationLabel(type: TimetableCalendarModification['type']): string {
    return this.calendarModificationTypeLabels[type] ?? type;
  }

  calendarModificationIcon(type: TimetableCalendarModification['type']): string {
    return this.calendarModificationTypeIcons[type] ?? 'info';
  }

  modificationStopsLabel(
    timetable: Timetable,
    modification: TimetableCalendarModification,
  ): string {
    if (!modification.affectedStopIds?.length) {
      return '—';
    }
    const lookup = new Map(timetable.stops.map((stop) => [stop.id, stop]));
    const names = modification.affectedStopIds
      .map((id) => lookup.get(id)?.locationName ?? id)
      .filter(Boolean);
    return names.length ? names.join(', ') : '—';
  }

  stopLabel(timetable: Timetable, stopId: string): string {
    const stop = timetable.stops.find((entry) => entry.id === stopId);
    if (!stop) {
      return stopId;
    }
    return `#${stop.sequence} · ${stop.locationName}`;
  }

  rollingStockOperationLabel(type: TimetableRollingStockOperation['type']): string {
    return this.rollingStockOperationLabels[type] ?? type;
  }

  rollingStockOperationIcon(type: TimetableRollingStockOperation['type']): string {
    return this.rollingStockOperationIcons[type] ?? 'info';
  }

  responsibilityScopeLabel(scope: TimetableResponsibility['scope']): string {
    return this.responsibilityScopeLabels[scope] ?? scope;
  }

  responsibilityStatusLabel(
    status: TimetableResponsibility['status'] | undefined,
  ): string {
    if (!status) {
      return 'Unbekannt';
    }
    return this.responsibilityStatusLabels[status] ?? status;
  }

  responsibilityStatusClass(
    status: TimetableResponsibility['status'] | undefined,
  ): string {
    if (!status) {
      return '';
    }
    return this.responsibilityStatusClasses[status] ?? '';
  }

  auditEntityLabel(entry: TimetableAuditEntry): string {
    if (!entry.relatedEntity) {
      return this.auditEntityLabels.other;
    }
    return this.auditEntityLabels[entry.relatedEntity] ?? entry.relatedEntity;
  }

  trackByResponsibility(_: number, responsibility: TimetableResponsibility): string {
    return responsibility.id;
  }

  trackByVariant(_: number, variant: TimetableCalendarVariant): string {
    return variant.id;
  }

  trackByAudit(_: number, entry: TimetableAuditEntry): string {
    return entry.id;
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
