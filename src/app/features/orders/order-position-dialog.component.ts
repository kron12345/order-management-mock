import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import {
  CreatePlanOrderItemsPayload,
  CreateServiceOrderItemPayload,
  ImportedRailMlStop,
  ImportedRailMlTrain,
  OrderService,
} from '../../core/services/order.service';
import { Order } from '../../core/models/order.model';
import { ScheduleTemplateService } from '../../core/services/schedule-template.service';
import { TrafficPeriodService } from '../../core/services/traffic-period.service';
import { ScheduleTemplateCreateDialogComponent } from '../schedule-templates/schedule-template-create-dialog.component';
import { TrafficPeriodEditorComponent } from '../traffic-periods/traffic-period-editor.component';
import {
  OrderItemGeneralFieldsComponent,
  OrderItemGeneralLabels,
} from '../orders/shared/order-item-general-fields/order-item-general-fields.component';
import { OrderItemServiceFieldsComponent } from '../orders/shared/order-item-service-fields/order-item-service-fields.component';
import {
  PlanAssemblyDialogComponent,
  PlanAssemblyDialogData,
  PlanAssemblyDialogResult,
} from './plan-assembly-dialog/plan-assembly-dialog.component';
import { PlanModificationStopInput } from '../../core/services/train-plan.service';
import { TrainPlanStop } from '../../core/models/train-plan.model';

interface OrderPositionDialogData {
  order: Order;
}

@Component({
  selector: 'app-order-position-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ...MATERIAL_IMPORTS,
    OrderItemGeneralFieldsComponent,
    OrderItemServiceFieldsComponent,
  ],
  templateUrl: './order-position-dialog.component.html',
  styleUrl: './order-position-dialog.component.scss',
})
export class OrderPositionDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<OrderPositionDialogComponent>);
  private readonly data = inject<OrderPositionDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly orderService = inject(OrderService);
  private readonly templateService = inject(ScheduleTemplateService);
  private readonly trafficPeriodService = inject(TrafficPeriodService);
  private readonly dialog = inject(MatDialog);

  readonly modeControl = new FormControl<'service' | 'plan' | 'manualPlan' | 'import'>(
    'service',
    { nonNullable: true },
  );

  readonly serviceForm = this.fb.group({
    serviceType: ['', Validators.required],
    fromLocation: ['', Validators.required],
    toLocation: ['', Validators.required],
    start: ['', Validators.required],
    end: ['', Validators.required],
    trafficPeriodId: ['', Validators.required],
    deviation: [''],
    name: [''],
  });

  readonly planForm = this.fb.group({
    templateId: ['', Validators.required],
    trafficPeriodId: ['', Validators.required],
    startTime: ['04:00', Validators.required],
    endTime: ['23:00', Validators.required],
    intervalMinutes: [30, [Validators.required, Validators.min(1)]],
    namePrefix: [''],
    responsible: [''],
    otn: [''],
    otnInterval: [1, [Validators.min(1)]],
  });

  readonly manualPlanForm = this.fb.group({
    departureDate: [''],
    trafficPeriodId: [''],
    trainNumber: ['', Validators.required],
    name: [''],
    responsible: [''],
  });

  readonly importFilters = this.fb.group({
    search: [''],
    start: [''],
    end: [''],
  });
  readonly importOptionsForm = this.fb.group({
    trafficPeriodId: [''],
    namePrefix: [''],
    responsible: [''],
  });

  readonly templates = computed(() => this.templateService.templates());
  readonly trafficPeriods = computed(() => this.trafficPeriodService.periods());
  readonly mode = signal<'service' | 'plan' | 'manualPlan' | 'import'>(
    this.modeControl.value,
  );
  readonly manualTemplate = signal<PlanModificationStopInput[] | null>(null);
  readonly importError = signal<string | null>(null);
  readonly importedTrains = signal<ImportedRailMlTrain[]>([]);
  readonly selectedTrainIds = signal<Set<string>>(new Set());
  readonly expandedTrainIds = signal<Set<string>>(new Set());
  private readonly importFilterValues = signal<ImportFilterValues>({
    search: '',
    start: '',
    end: '',
  });
  readonly serviceFieldsConfig = {
    startControl: 'start',
    endControl: 'end',
    serviceTypeControl: 'serviceType',
    fromControl: 'fromLocation',
    toControl: 'toLocation',
    trafficPeriodControl: 'trafficPeriodId',
  } as const;
  readonly serviceGeneralLabels: OrderItemGeneralLabels = {
    name: 'Positionsname (optional)',
    responsible: 'Verantwortlich (optional)',
    deviation: 'Bemerkung',
  };
  readonly serviceGeneralDescriptions = {
    name: 'Optionaler Anzeigename. Ohne Eingabe wird der Leistungstyp als Name verwendet.',
    responsible: 'Wer führt die Leistung aus oder ist Ansprechpartner?',
    deviation: 'Kurze Notiz zu Besonderheiten, z. B. +3 min.',
  } as const;
  readonly serviceFieldDescriptions = {
    start: 'Startuhrzeit der Leistung (HH:MM). Das Datum ergibt sich aus der Verkehrsperiode.',
    end: 'Enduhrzeit. Liegt sie vor der Startzeit, wird automatisch der Folgetag verwendet.',
    serviceType: 'Art der Leistung, z. B. Werkstatt, Reinigung, Begleitung.',
    from: 'Ausgangsort oder Bereich, an dem die Leistung startet.',
    to: 'Zielort oder Bereich, an dem die Leistung endet.',
    trafficPeriod: 'Verkehrsperiode, in der die Leistung gelten soll.',
  } as const;
  readonly manualGeneralLabels: OrderItemGeneralLabels = {
    name: 'Positionsname',
    responsible: 'Verantwortlich',
    deviation: 'Bemerkung',
  };
  readonly manualGeneralDescriptions = {
    name: 'Titel der Fahrplanposition, z. B. Sonderzug 4711.',
    responsible: 'Verantwortliche Person oder Stelle für den Fahrplan.',
    deviation: 'Hinweise oder Abweichungen für den manuellen Fahrplan.',
  } as const;
  readonly planFieldDescriptions = {
    templateId: 'Vorlage mit Strecke und Zeiten, die für die Serie genutzt wird.',
    trafficPeriodId: 'Verkehrsperiode, in der die Serie generiert wird.',
    startTime: 'Erste Abfahrt am Tag der Serie (HH:MM).',
    endTime: 'Letzte Abfahrt am Tag der Serie (HH:MM).',
    intervalMinutes: 'Abstand zwischen den Zügen in Minuten.',
    namePrefix: 'Optionales Präfix für generierte Positionsnamen.',
    responsible: 'Verantwortlicher für die erzeugten Fahrpläne.',
    otn: 'Optionaler Startwert für die Zugnummer (OTN).',
    otnInterval: 'Differenz zwischen den OTN der nacheinander erzeugten Züge.',
  } as const;
  readonly manualFieldDescriptions = {
    departureDate: 'Datum, an dem der Fahrplan ausgeführt werden soll.',
    trafficPeriodId: 'Alternativ zur Einzeldatumsauswahl: Verkehrsperiode für wiederkehrende Fahrten.',
    trainNumber: 'Offizielle Zugnummer (OTN), unter der der Zug geführt wird.',
  } as const;
  readonly importOptionsDescriptions = {
    trafficPeriodId: 'Optional: überschreibt die aus der RailML-Datei erzeugte Verkehrsperiode.',
    namePrefix: 'Optionaler Zusatz für erzeugte Positionsnamen.',
    responsible: 'Verantwortliche Person für importierte Fahrpläne.',
  } as const;
  readonly importFilterDescriptions = {
    search: 'Suche nach Zugname oder ID innerhalb der importierten Datei.',
    start: 'Filtere nach Startort im RailML-Datensatz.',
    end: 'Filtere nach Zielort im RailML-Datensatz.',
  } as const;

  readonly filteredTrains = computed(() => {
    const filters = this.importFilterValues();
    const trains = this.importedTrains();
    const search = filters.search.trim().toLowerCase();
    const startFilter = filters.start.trim().toLowerCase();
    const endFilter = filters.end.trim().toLowerCase();
    return trains.filter((train) => {
      const matchesSearch =
        !search ||
        train.name.toLowerCase().includes(search) ||
        train.id.toLowerCase().includes(search);
      const matchesStart =
        !startFilter || train.start?.toLowerCase().includes(startFilter);
      const matchesEnd =
        !endFilter || train.end?.toLowerCase().includes(endFilter);
      return matchesSearch && matchesStart && matchesEnd;
    });
  });
  errorMessage = signal<string | null>(null);

  readonly order = this.data.order;

  constructor() {
    const periodList = this.trafficPeriodService.periods();
    const templateList = this.templateService.templates();

    const firstPeriod = periodList[0];
    const firstTemplate = templateList[0];

    if (firstPeriod) {
      this.planForm.controls.trafficPeriodId.setValue(firstPeriod.id);
      this.serviceForm.controls.trafficPeriodId.setValue(firstPeriod.id);
    }
    if (firstTemplate) {
      this.planForm.controls.templateId.setValue(firstTemplate.id);
      this.planForm.controls.namePrefix.setValue(firstTemplate.title);
    }

    this.importFilterValues.set({ search: '', start: '', end: '' });

    this.modeControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.mode.set(value);
      this.errorMessage.set(null);
      if (value !== 'import') {
        this.importError.set(null);
      }
    });

    this.importFilters.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => {
        this.importFilterValues.set({
          search: value?.search ?? '',
          start: value?.start ?? '',
          end: value?.end ?? '',
        });
      });

    this.manualPlanForm.controls.departureDate.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => {
        if (value) {
          this.manualPlanForm.controls.trafficPeriodId.setValue('', {
            emitEvent: false,
          });
        }
      });

    this.manualPlanForm.controls.trafficPeriodId.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => {
        if (value) {
          this.manualPlanForm.controls.departureDate.setValue('', {
            emitEvent: false,
          });
        }
      });
  }

  onImportFiltersReset() {
    this.importFilters.reset({ search: '', start: '', end: '' });
    this.importFilterValues.set({ search: '', start: '', end: '' });
  }

  openTemplateCreateDialog() {
    const dialogRef = this.dialog.open(ScheduleTemplateCreateDialogComponent, {
      width: '95vw',
      maxWidth: '1200px',
    });

    dialogRef.afterClosed().subscribe((payload) => {
      if (!payload) {
        return;
      }

      const template = this.templateService.createTemplate(payload);

      this.planForm.controls.templateId.setValue(template.id);
      if (!this.planForm.controls.namePrefix.value) {
        this.planForm.controls.namePrefix.setValue(template.title);
      }
      if (!this.planForm.controls.responsible.value) {
        this.planForm.controls.responsible.setValue(template.responsibleRu);
      }
      this.errorMessage.set(null);
    });
  }

  openManualPlanAssembly() {
    const dialogRef = this.dialog.open<
      PlanAssemblyDialogComponent,
      PlanAssemblyDialogData,
      PlanAssemblyDialogResult | undefined
    >(PlanAssemblyDialogComponent, {
      width: '1320px',
      maxWidth: '95vw',
      maxHeight: 'calc(100vh - 48px)',
      panelClass: 'plan-assembly-dialog-panel',
      data: {
        stops: this.manualAssemblyInputStops(),
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.stops?.length) {
        this.manualTemplate.set(result.stops);
        this.errorMessage.set(null);
      }
    });
  }

  openTrafficPeriodEditor(target: 'service' | 'plan' | 'import') {
    const dialogRef = this.dialog.open(TrafficPeriodEditorComponent, {
      width: '95vw',
      maxWidth: '1200px',
      data: {
        defaultYear: new Date().getFullYear(),
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (!result) {
        return;
      }

      let periodId = result.periodId;
      if (periodId) {
        this.trafficPeriodService.updatePeriod(periodId, result.payload);
      } else {
        periodId = this.trafficPeriodService.createPeriod(result.payload);
      }

      if (periodId) {
        this.setTrafficPeriodControl(target, periodId);
      }
    });
  }

  private setTrafficPeriodControl(
    target: 'service' | 'plan' | 'import',
    periodId: string,
  ) {
    switch (target) {
      case 'service':
        this.serviceForm.controls.trafficPeriodId.setValue(periodId);
        break;
      case 'plan':
        this.planForm.controls.trafficPeriodId.setValue(periodId);
        break;
      case 'import':
        this.importOptionsForm.controls.trafficPeriodId.setValue(periodId);
        break;
    }
  }

  clearManualTemplate() {
    this.manualTemplate.set(null);
  }

  cancel() {
    this.dialogRef.close();
  }

  save() {
    this.errorMessage.set(null);

    if (this.mode() === 'service') {
      if (this.serviceForm.invalid) {
        this.serviceForm.markAllAsTouched();
        return;
      }
      this.createServiceItem();
    } else if (this.mode() === 'plan') {
      if (this.planForm.invalid) {
        this.planForm.markAllAsTouched();
        return;
      }
      this.createPlanItems();
    } else if (this.mode() === 'manualPlan') {
      const stops = this.manualTemplate();
      if (!stops || !stops.length) {
        this.errorMessage.set('Bitte zuerst einen Fahrplan zusammenstellen.');
        return;
      }
      if (this.manualPlanForm.invalid) {
        this.manualPlanForm.markAllAsTouched();
        return;
      }
      this.createManualPlanItem();
    } else {
      this.createImportedPlanItems();
    }
  }

  private createServiceItem() {
    const value = this.serviceForm.getRawValue();
    const serviceType = value.serviceType?.trim();
    if (!serviceType) {
      this.errorMessage.set('Bitte einen Leistungstyp angeben.');
      return;
    }

    const startMinutes = this.parseTimeToMinutes(value.start);
    const endMinutes = this.parseTimeToMinutes(value.end);
    if (startMinutes === null || endMinutes === null) {
      this.errorMessage.set('Bitte Zeiten im Format HH:MM angeben.');
      return;
    }

    const baseDate = this.deriveServiceBaseDate(value.trafficPeriodId!);
    if (!baseDate) {
      this.errorMessage.set('Die Verkehrsperiode enthält kein gültiges Datum.');
      return;
    }

    const endOffsetDays = endMinutes < startMinutes ? 1 : 0;
    const start = this.buildIsoFromMinutes(baseDate, startMinutes);
    const end = this.buildIsoFromMinutes(baseDate, endMinutes, endOffsetDays);

    if (!start || !end) {
      this.errorMessage.set('Start/Ende konnten nicht berechnet werden.');
      return;
    }

    const fromLocation = value.fromLocation?.trim();
    const toLocation = value.toLocation?.trim();
    if (!fromLocation || !toLocation) {
      this.errorMessage.set('Bitte Herkunft und Ziel angeben.');
      return;
    }

    const payload: CreateServiceOrderItemPayload = {
      orderId: this.order.id,
      serviceType,
      fromLocation,
      toLocation,
      start,
      end,
      trafficPeriodId: value.trafficPeriodId!,
      deviation: value.deviation?.trim() || undefined,
      name: value.name?.trim() || undefined,
    };

    this.orderService.addServiceOrderItem(payload);
    this.dialogRef.close(true);
  }

  private createManualPlanItem() {
    const stops = this.manualTemplate();
    if (!stops?.length) {
      this.errorMessage.set('Bitte zuerst einen Fahrplan zusammenstellen.');
      return;
    }

    const value = this.manualPlanForm.getRawValue();
    const departureDate = value.departureDate?.trim() || '';
    const selectedPeriodId = value.trafficPeriodId?.trim() || '';

    if (!departureDate && !selectedPeriodId) {
      this.errorMessage.set('Bitte entweder einen Fahrtag oder eine Verkehrsperiode auswählen.');
      return;
    }

    if (departureDate && selectedPeriodId) {
      this.errorMessage.set('Fahrtag und Verkehrsperiode dürfen nicht gleichzeitig gewählt werden.');
      return;
    }

    let departureIso: string | null = null;
    let trafficPeriodId: string | undefined;

    if (departureDate) {
      const departure = new Date(`${departureDate}T00:00:00`);
      if (Number.isNaN(departure.getTime())) {
        this.errorMessage.set('Bitte ein gültiges Datum wählen.');
        return;
      }
      departureIso = departure.toISOString();
    } else {
      trafficPeriodId = selectedPeriodId;
      const periodDate = this.firstDateOfTrafficPeriod(trafficPeriodId);
      if (!periodDate) {
        this.errorMessage.set('Die ausgewählte Verkehrsperiode enthält keine verwertbaren Tage.');
        return;
      }
      const departure = new Date(`${periodDate}T00:00:00`);
      departureIso = departure.toISOString();
    }

    const trainNumber = value.trainNumber?.trim();
    if (!trainNumber) {
      this.errorMessage.set('Bitte eine Zugnummer angeben.');
      return;
    }

    try {
      const payload = {
        orderId: this.order.id,
        departure: departureIso,
        stops,
        trainNumber,
        name: value.name?.trim() || undefined,
        responsible: value.responsible?.trim() || undefined,
        trafficPeriodId,
      };
      this.orderService.addManualPlanOrderItem(payload);
      this.dialogRef.close(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      this.errorMessage.set(message);
    }
  }

  private createImportedPlanItems() {
    const trains = this.importedTrains();
    const selected = this.selectedTrainIds();
    if (!trains.length || !selected.size) {
      this.errorMessage.set('Bitte mindestens einen Zug auswählen.');
      return;
    }

    const items = trains.filter((train) => selected.has(train.id));
    if (!items.length) {
      this.errorMessage.set('Bitte mindestens einen Zug auswählen.');
      return;
    }

    const options = this.importOptionsForm.getRawValue();
    const namePrefix = options.namePrefix?.trim();
    const responsible = options.responsible?.trim() || undefined;
    const overridePeriodId = options.trafficPeriodId?.trim() || undefined;

    try {
      const missingPeriods: string[] = [];
      const payloads: Array<{ train: ImportedRailMlTrain; trafficPeriodId: string }> = [];

      items.forEach((train) => {
        const effectivePeriodId = overridePeriodId ?? train.trafficPeriodId;
        if (!effectivePeriodId) {
          missingPeriods.push(train.name ?? train.id);
          return;
        }
        payloads.push({ train, trafficPeriodId: effectivePeriodId });
      });

      if (missingPeriods.length) {
        this.errorMessage.set(
          `Für folgende Züge konnte keine Verkehrsperiode bestimmt werden: ${missingPeriods
            .slice(0, 5)
            .join(', ')}${missingPeriods.length > 5 ? ' …' : ''}`,
        );
        return;
      }

      const orderedPayloads: Array<{ train: ImportedRailMlTrain; trafficPeriodId: string }> = [];
      payloads.forEach((entry) => {
        if (!entry.train.variantOf) {
          orderedPayloads.push(entry);
        }
      });
      payloads.forEach((entry) => {
        if (entry.train.variantOf) {
          orderedPayloads.push(entry);
        }
      });

      const createdItemIds = new Map<string, string>();
      const groupRootIds = new Map<string, string>();

      orderedPayloads.forEach(({ train, trafficPeriodId }) => {
        let parentItemId: string | undefined;
        if (train.variantOf) {
          parentItemId =
            createdItemIds.get(train.variantOf) ??
            (train.groupId ? groupRootIds.get(train.groupId) : undefined);
        }
        const item = this.orderService.addImportedPlanOrderItem({
          orderId: this.order.id,
          train,
          trafficPeriodId,
          responsible,
          namePrefix,
          parentItemId,
        });
        createdItemIds.set(train.id, item.id);
        if (!train.variantOf) {
          groupRootIds.set(train.groupId ?? train.id, item.id);
        }
      });

      this.dialogRef.close(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      this.errorMessage.set(message);
    }
  }

  private createPlanItems() {
    const value = this.planForm.getRawValue();
    const startMinutes = this.parseTimeToMinutes(value.startTime);
    const endMinutes = this.parseTimeToMinutes(value.endTime);
    const interval = value.intervalMinutes ?? 0;

    if (startMinutes === null || endMinutes === null) {
      this.errorMessage.set('Bitte gültige Start- und Endzeiten im Format HH:MM angeben.');
      return;
    }

    if (startMinutes < 4 * 60 || endMinutes > 23 * 60) {
      this.errorMessage.set('Bitte Zeiten zwischen 04:00 und 23:00 Uhr wählen.');
      return;
    }

    if (endMinutes <= startMinutes) {
      this.errorMessage.set('Die Endzeit muss nach der Startzeit liegen.');
      return;
    }

    if (!interval || interval < 1) {
      this.errorMessage.set('Bitte einen gültigen Takt angeben.');
      return;
    }

    let count = 0;
    for (let current = startMinutes; current <= endMinutes; current += interval) {
      count += 1;
    }

    if (count <= 0) {
      this.errorMessage.set('Es konnte kein Zug im angegebenen Zeitraum erzeugt werden.');
      return;
    }

    const otnValue = value.otn?.toString().trim();
    let trainNumberStart: number | undefined;
    let trainNumberInterval: number | undefined;
    if (otnValue) {
      const parsedBase = Number.parseInt(otnValue, 10);
      if (Number.isNaN(parsedBase)) {
        this.errorMessage.set('Bitte eine gültige Zugnummer (OTN) angeben.');
        return;
      }
      trainNumberStart = parsedBase;
      const intervalRaw = Number(value.otnInterval ?? 1);
      if (!Number.isFinite(intervalRaw) || intervalRaw < 1) {
        this.errorMessage.set('Bitte ein gültiges OTN-Intervall ≥ 1 angeben.');
        return;
      }
      trainNumberInterval = Math.floor(intervalRaw);
    }

    const planPayload: CreatePlanOrderItemsPayload = {
      orderId: this.order.id,
      templateId: value.templateId!,
      trafficPeriodId: value.trafficPeriodId!,
      startTime: value.startTime!,
      intervalMinutes: value.intervalMinutes!,
      count,
      namePrefix: value.namePrefix?.trim() || undefined,
      responsible: value.responsible?.trim() || undefined,
      responsibleRu: value.responsible?.trim() || undefined,
    };

    if (trainNumberStart !== undefined) {
      planPayload.trainNumberStart = trainNumberStart;
      planPayload.trainNumberInterval = trainNumberInterval;
    }

    try {
      const items = this.orderService.addPlanOrderItems(planPayload);
      if (!items.length) {
        this.errorMessage.set('Es konnten keine Auftragspositionen erzeugt werden.');
        return;
      }
      this.dialogRef.close(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      this.errorMessage.set(message);
    }
  }

  private manualAssemblyInputStops(): TrainPlanStop[] {
    const stops = this.manualTemplate();
    if (stops?.length) {
      return this.manualStopsToPlanStops(stops);
    }
    return this.defaultManualStops();
  }

  private firstDateOfTrafficPeriod(periodId: string): string | null {
    const period = this.trafficPeriodService.getById(periodId);
    if (!period) {
      return null;
    }
    const includeDates = period.rules
      .flatMap((rule) => rule.includesDates ?? [])
      .filter((date): date is string => !!date)
      .sort();
    if (includeDates.length) {
      return includeDates[0];
    }
    const validityStarts = period.rules
      .map((rule) => rule.validityStart)
      .filter((date): date is string => !!date)
      .sort();
    return validityStarts[0] ?? null;
  }

  private manualStopsToPlanStops(stops: PlanModificationStopInput[]): TrainPlanStop[] {
    return stops.map((stop, index) => ({
      id: `MANUAL-ST-${String(index + 1).padStart(3, '0')}`,
      sequence: index + 1,
      type: stop.type,
      locationName: stop.locationName || `Ort ${index + 1}`,
      locationCode: stop.locationCode || `LOC-${index + 1}`,
      countryCode: stop.countryCode,
      arrivalTime: stop.arrivalTime || undefined,
      departureTime: stop.departureTime || undefined,
      arrivalOffsetDays: stop.arrivalOffsetDays,
      departureOffsetDays: stop.departureOffsetDays,
      dwellMinutes: stop.dwellMinutes,
      activities:
        stop.activities && stop.activities.length ? [...stop.activities] : ['0001'],
      platform: stop.platform,
      notes: stop.notes,
    }));
  }

  trafficPeriodName(periodId: string | null | undefined): string | null {
    if (!periodId) {
      return null;
    }
    return this.trafficPeriodService.getById(periodId)?.name ?? null;
  }

  trackByTrainId(_index: number, train: ImportedRailMlTrain): string {
    return train.id;
  }

  stopTimeLabel(stop: ImportedRailMlStop, type: 'arrival' | 'departure'): string {
    const earliest =
      type === 'arrival' ? stop.arrivalEarliest : stop.departureEarliest;
    const latest =
      type === 'arrival' ? stop.arrivalLatest : stop.departureLatest;
    if (earliest && latest && earliest !== latest) {
      return `${earliest} · ${latest}`;
    }
    return earliest ?? latest ?? '—';
  }

  private defaultManualStops(): TrainPlanStop[] {
    return [
      {
        id: 'MANUAL-ST-001',
        sequence: 1,
        type: 'origin',
        locationName: 'Start',
        locationCode: 'START',
        countryCode: 'CH',
        activities: ['0001'],
      },
      {
        id: 'MANUAL-ST-002',
        sequence: 2,
        type: 'destination',
        locationName: 'Ziel',
        locationCode: 'ZIEL',
        countryCode: 'CH',
        activities: ['0001'],
      },
    ];
  }

  onRailMlFileSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const trains = this.parseRailMl(text);
        if (!trains.length) {
          throw new Error('Im RailML konnten keine Züge gefunden werden.');
        }
        this.importedTrains.set(trains);
        this.selectedTrainIds.set(new Set(trains.map((train) => train.id)));
        this.importError.set(null);
        this.errorMessage.set(null);
        this.importFilters.reset({ search: '', start: '', end: '' });
        this.importFilterValues.set({ search: '', start: '', end: '' });
        if (input) {
          input.value = '';
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'RailML-Datei konnte nicht verarbeitet werden.';
        this.importError.set(message);
        this.importedTrains.set([]);
        this.selectedTrainIds.set(new Set());
      }
    };
    reader.onerror = () => {
      this.importError.set('RailML-Datei konnte nicht gelesen werden.');
      this.importedTrains.set([]);
      this.selectedTrainIds.set(new Set());
    };
    reader.readAsText(file, 'utf-8');
  }

  clearImportedData() {
    this.importedTrains.set([]);
    this.selectedTrainIds.set(new Set());
    this.importError.set(null);
    this.importFilters.reset({ search: '', start: '', end: '' });
    this.importFilterValues.set({ search: '', start: '', end: '' });
    this.importOptionsForm.patchValue(
      { namePrefix: '', responsible: '', trafficPeriodId: '' },
      { emitEvent: false },
    );
  }

  isTrainSelected(id: string): boolean {
    return this.selectedTrainIds().has(id);
  }

  toggleTrainSelection(id: string, selected: boolean) {
    this.selectedTrainIds.update((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  isTrainExpanded(id: string): boolean {
    return this.expandedTrainIds().has(id);
  }

  toggleTrainExpansion(id: string, event?: Event) {
    event?.stopPropagation();
    event?.preventDefault();
    this.expandedTrainIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  selectAllFiltered(selectAll: boolean) {
    const ids = this.filteredTrains().map((train) => train.id);
    this.selectedTrainIds.update((current) => {
      const next = new Set(current);
      ids.forEach((id) => {
        if (selectAll) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
  }

  private parseTimeToMinutes(value: string | null | undefined): number | null {
    if (!value) {
      return null;
    }
    const match = /^(\d{1,2}):([0-5]\d)$/.exec(value);
    if (!match) {
      return null;
    }
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    return hours * 60 + minutes;
  }

  private deriveServiceBaseDate(periodId: string): string | null {
    const period = this.trafficPeriodService.getById(periodId);
    if (!period?.rules?.length) {
      return null;
    }
    let candidate: string | null = null;
    period.rules.forEach((rule) => {
      const dates = [rule.validityStart, ...(rule.includesDates ?? [])];
      dates.forEach((date) => {
        if (date && (!candidate || date < candidate)) {
          candidate = date;
        }
      });
    });
    return candidate;
  }

  private buildIsoFromMinutes(
    baseDate: string,
    minutes: number,
    dayOffset = 0,
  ): string | null {
    const base = new Date(`${baseDate}T00:00:00`);
    if (Number.isNaN(base.getTime())) {
      return null;
    }
    base.setDate(base.getDate() + dayOffset);
    base.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return base.toISOString();
  }

  private toIso(value: string | null): string | null {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private parseRailMl(xml: string): ImportedRailMlTrain[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      throw new Error('Ungültiges RailML-Dokument.');
    }

    const operatingPeriods = this.extractRailMlOperatingPeriods(doc);
    const timetablePeriods = this.extractRailMlTimetablePeriods(doc);
    const ensuredPeriods = new Map<string, { id: string; name: string }>();

    const trainNodes = Array.from(
      doc.querySelectorAll('train, railml\\:train, ns1\\:train'),
    );
    const trains: ImportedRailMlTrain[] = [];

    trainNodes.forEach((node, index) => {
      const mapped = this.mapRailMlTrainParts(
        doc,
        node,
        index,
        operatingPeriods,
        timetablePeriods,
        ensuredPeriods,
      );
      mapped.forEach((train) => trains.push(train));
    });

    return trains;
  }

  private mapRailMlTrainParts(
    doc: Document,
    node: Element,
    index: number,
    operatingPeriods: Map<string, RailMlOperatingPeriod>,
    timetablePeriods: Map<string, RailMlTimetablePeriod>,
    ensuredPeriods: Map<string, { id: string; name: string }>,
  ): ImportedRailMlTrain[] {
    const trainId =
      node.getAttribute('id') ??
      node.getAttribute('trainID') ??
      `train-${index + 1}`;
    const trainName =
      node.getAttribute('name') ?? node.getAttribute('trainName') ?? trainId;
    const trainNumber = node.getAttribute('trainNumber') ?? trainId;
    const category =
      node.getAttribute('categoryRef') ?? node.getAttribute('category') ?? undefined;
    const timetablePeriodRef = node.getAttribute('timetablePeriodRef') ?? undefined;
    const partNodes = Array.from(
      node.querySelectorAll('trainPart, railml\\:trainPart, ns1\\:trainPart'),
    );
    const targetParts = partNodes.length ? partNodes : [node];

    const trains: ImportedRailMlTrain[] = [];

    targetParts.forEach((partNode, partIndex) => {
      const ocpNodes = Array.from(
        partNode.querySelectorAll('ocpTT, railml\\:ocpTT, ns1\\:ocpTT'),
      );
      if (!ocpNodes.length) {
        return;
      }
      const stops = ocpNodes.map((stop, idx) =>
        this.mapRailMlStop(doc, stop, idx),
      ) as ImportedRailMlStop[];
      if (!stops.length) {
        return;
      }
      stops[0].type = 'origin';
      stops[stops.length - 1].type = 'destination';
      for (let i = 1; i < stops.length - 1; i++) {
        stops[i].type = 'intermediate';
      }

      const operatingPeriodRef =
        partNode.getAttribute('operatingPeriodRef') ??
        node.getAttribute('operatingPeriodRef') ??
        undefined;
      const operatingPeriod = operatingPeriodRef
        ? operatingPeriods.get(operatingPeriodRef)
        : undefined;
      const timetablePeriod = timetablePeriodRef
        ? timetablePeriods.get(timetablePeriodRef)
        : undefined;
      const startDate =
        partNode.getAttribute('startDate') ??
        operatingPeriod?.startDate ??
        timetablePeriod?.startDate ??
        node.getAttribute('startDate') ??
        new Date().toISOString().slice(0, 10);

      const firstDeparture =
        stops.find((stop) => stop.departureEarliest || stop.departureLatest)
          ?.departureEarliest ??
        stops[0].departureEarliest ??
        stops[0].departureLatest ??
        '00:00';
      const lastArrival =
        [...stops]
          .reverse()
          .find((stop) => stop.arrivalLatest || stop.arrivalEarliest)?.arrivalLatest ??
        stops[stops.length - 1].arrivalLatest ??
        stops[stops.length - 1].arrivalEarliest ??
        firstDeparture;

      const departureIso = this.combineDateTime(startDate, firstDeparture);
      const arrivalIso = this.combineDateTime(startDate, lastArrival);

      const trafficSourceId =
        operatingPeriodRef ??
        timetablePeriodRef ??
        `${trainId}-part-${partIndex + 1}`;
      let trafficPeriodId: string | undefined;
      let trafficPeriodName: string | undefined;
      if (trafficSourceId) {
        const cached = ensuredPeriods.get(trafficSourceId);
        const ensured =
          cached ??
          this.ensureTrafficPeriodForRailMl(
            trafficSourceId,
            operatingPeriod,
            timetablePeriod,
          );
        if (ensured) {
          ensuredPeriods.set(trafficSourceId, ensured);
          trafficPeriodId = ensured.id;
          trafficPeriodName = ensured.name;
        }
      }

      const variantLabel = partIndex === 0 ? undefined : this.resolveVariantLabel(
        partNode,
        operatingPeriod,
      );
      const displayName =
        partIndex === 0 || !variantLabel
          ? trainName
          : `${trainName} (${variantLabel})`;
      const variantId =
        partIndex === 0
          ? trainId
          : partNode.getAttribute('id') ?? `${trainId}-variant-${partIndex + 1}`;

      trains.push({
        id: variantId,
        groupId: trainId,
        variantOf: partIndex === 0 ? undefined : trainId,
        variantLabel,
        operatingPeriodRef,
        timetablePeriodRef,
        trainPartId: partNode === node ? undefined : partNode.getAttribute('id') ?? undefined,
        name: displayName,
        number: trainNumber,
        category,
        start: stops[0].locationName ?? stops[0].locationCode,
        end:
          stops[stops.length - 1].locationName ??
          stops[stops.length - 1].locationCode,
        departureIso,
        arrivalIso,
        departureTime: firstDeparture,
        arrivalTime: lastArrival,
        stops,
        trafficPeriodId,
        trafficPeriodName,
        trafficPeriodSourceId: trafficSourceId,
      });
    });

    return trains;
  }

  private mapRailMlStop(
    doc: Document,
    node: Element,
    index: number,
  ): ImportedRailMlStop {
    const ocpRef = node.getAttribute('ocpRef');
    const locationName = this.resolveLocationName(doc, ocpRef);
    const locationCode =
      ocpRef ??
      node.getAttribute('operationControlPointRef') ??
      `ocp-${index + 1}`;
    const resolvedName = locationName ?? locationCode;

    const arrivalNode =
      node.querySelector('arrival') ??
      node.querySelector('railml\\:arrival') ??
      node.querySelector('ns1\\:arrival');
    const departureNode =
      node.querySelector('departure') ??
      node.querySelector('railml\\:departure') ??
      node.querySelector('ns1\\:departure');
    const timesNode =
      node.querySelector('times') ??
      node.querySelector('railml\\:times') ??
      node.querySelector('ns1\\:times');

    const arrivalEarliest =
      this.sanitizeTime(timesNode?.getAttribute('arrival')) ??
      this.sanitizeTime(arrivalNode?.getAttribute('time')) ??
      this.sanitizeTime(node.getAttribute('arrival'));
    const arrivalLatest =
      this.sanitizeTime(timesNode?.getAttribute('arrivalLatest')) ??
      this.sanitizeTime(arrivalNode?.getAttribute('timeLatest')) ??
      this.sanitizeTime(arrivalNode?.getAttribute('time'));
    const departureEarliest =
      this.sanitizeTime(timesNode?.getAttribute('departure')) ??
      this.sanitizeTime(departureNode?.getAttribute('time')) ??
      this.sanitizeTime(node.getAttribute('departure'));
    const departureLatest =
      this.sanitizeTime(timesNode?.getAttribute('departureLatest')) ??
      this.sanitizeTime(departureNode?.getAttribute('timeLatest')) ??
      this.sanitizeTime(departureNode?.getAttribute('time'));

    const activitiesAttr =
      node.getAttribute('activities') ??
      arrivalNode?.getAttribute('activities') ??
      departureNode?.getAttribute('activities') ??
      '';
    const activities = activitiesAttr
      ? activitiesAttr.split(' ').filter(Boolean)
      : ['0001'];

    return {
      type: 'intermediate',
      locationCode,
      locationName: resolvedName,
      countryCode: undefined,
      arrivalEarliest,
      arrivalLatest,
      departureEarliest,
      departureLatest,
      offsetDays: undefined,
      dwellMinutes: undefined,
      activities,
      platformWish: undefined,
      notes: undefined,
    };
  }

  private resolveVariantLabel(
    partNode: Element,
    operatingPeriod: RailMlOperatingPeriod | undefined,
  ): string | undefined {
    return (
      partNode.getAttribute('name') ??
      partNode.getAttribute('description') ??
      operatingPeriod?.description ??
      partNode.getAttribute('operatingPeriodRef') ??
      undefined
    );
  }

  private extractRailMlOperatingPeriods(doc: Document): Map<string, RailMlOperatingPeriod> {
    const nodes = Array.from(
      doc.querySelectorAll('operatingPeriod, railml\\:operatingPeriod, ns1\\:operatingPeriod'),
    );
    const periods = new Map<string, RailMlOperatingPeriod>();
    nodes.forEach((node) => {
      const id = node.getAttribute('id');
      if (!id) {
        return;
      }
      const description = node.getAttribute('description') ?? undefined;
      const dayNodes = Array.from(
        node.querySelectorAll('operatingDay, railml\\:operatingDay, ns1\\:operatingDay'),
      );
      const firstCode = dayNodes.find((day) => day.getAttribute('operatingCode'));
      const operatingCode = firstCode?.getAttribute('operatingCode') ?? '1111111';
      const startDates = dayNodes
        .map((day) => day.getAttribute('startDate'))
        .filter((date): date is string => !!date)
        .sort();
      const endDates = dayNodes
        .map((day) => day.getAttribute('endDate'))
        .filter((date): date is string => !!date)
        .sort();
      const startDate = startDates[0];
      const endDate = endDates.length ? endDates[endDates.length - 1] : undefined;
      periods.set(id, {
        id,
        description,
        operatingCode,
        startDate,
        endDate,
      });
    });
    return periods;
  }

  private extractRailMlTimetablePeriods(doc: Document): Map<string, RailMlTimetablePeriod> {
    const nodes = Array.from(
      doc.querySelectorAll('timetablePeriod, railml\\:timetablePeriod, ns1\\:timetablePeriod'),
    );
    const periods = new Map<string, RailMlTimetablePeriod>();
    nodes.forEach((node) => {
      const id = node.getAttribute('id');
      if (!id) {
        return;
      }
      periods.set(id, {
        id,
        startDate: node.getAttribute('startDate') ?? undefined,
        endDate: node.getAttribute('endDate') ?? undefined,
      });
    });
    return periods;
  }

  private ensureTrafficPeriodForRailMl(
    sourceId: string,
    operatingPeriod: RailMlOperatingPeriod | undefined,
    timetablePeriod: RailMlTimetablePeriod | undefined,
  ): { id: string; name: string } | undefined {
    if (!sourceId) {
      return undefined;
    }
    const defaultDate = new Date().toISOString().slice(0, 10);
    const validityStart =
      operatingPeriod?.startDate ?? timetablePeriod?.startDate ?? defaultDate;
    const validityEnd =
      operatingPeriod?.endDate ?? timetablePeriod?.endDate ?? validityStart;
    const name = operatingPeriod?.description?.trim() || `RailML ${sourceId}`;
    const period = this.trafficPeriodService.ensureRailMlPeriod({
      sourceId,
      name,
      description: operatingPeriod?.description,
      daysBitmap: this.sanitizeDaysBitmap(operatingPeriod?.operatingCode),
      validityStart,
      validityEnd,
      reason: operatingPeriod?.description,
    });
    return { id: period.id, name: period.name };
  }

  private sanitizeDaysBitmap(code: string | null | undefined): string {
    if (!code) {
      return '1111111';
    }
    const cleaned = code
      .split('')
      .map((char) => (char === '1' ? '1' : '0'))
      .join('');
    if (/^[01]{7}$/.test(cleaned)) {
      return cleaned;
    }
    const compact = code.replace(/[^01]/g, '');
    if (/^[01]{7}$/.test(compact)) {
      return compact;
    }
    return '1111111';
  }

  private resolveLocationName(doc: Document, ocpRef: string | null): string | undefined {
    if (!ocpRef) {
      return undefined;
    }
    const selector = `[id="${ocpRef}"]`;
    const ocp =
      doc.querySelector(`operationControlPoint${selector}`) ??
      doc.querySelector(`ocp${selector}`) ??
      doc.querySelector(`railml\\:operationControlPoint${selector}`) ??
      doc.querySelector(`railml\\:ocp${selector}`) ??
      doc.querySelector(`ns1\\:operationControlPoint${selector}`) ??
      doc.querySelector(`ns1\\:ocp${selector}`) ??
      Array.from(doc.querySelectorAll(selector)).find((element) => {
        const localName = element.localName?.toLowerCase();
        return localName === 'ocp' || localName === 'operationcontrolpoint';
      });
    if (!ocp) {
      return undefined;
    }
    const nameAttr = ocp.getAttribute('name') ?? ocp.getAttribute('label');
    if (nameAttr) {
      return nameAttr;
    }
    const nameNode = ocp.querySelector('name') ?? ocp.querySelector('railml\\:name');
    return nameNode?.textContent?.trim() || undefined;
  }

  private combineDateTime(date: string, time: string | undefined): string {
    const baseTime = time && time.length >= 5 ? time.slice(0, 5) : '00:00';
    const iso = `${date}T${baseTime}`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }

  private sanitizeTime(value: string | null | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    const match = value.match(/(\d{1,2}:\d{2})/);
    return match ? match[1] : undefined;
  }
}

interface ImportFilterValues {
  search: string;
  start: string;
  end: string;
}

interface RailMlOperatingPeriod {
  id: string;
  description?: string;
  operatingCode: string;
  startDate?: string;
  endDate?: string;
}

interface RailMlTimetablePeriod {
  id: string;
  startDate?: string;
  endDate?: string;
}
