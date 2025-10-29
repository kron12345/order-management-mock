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
import { ScheduleTemplate } from '../../core/models/schedule-template.model';
import { TrafficPeriodService } from '../../core/services/traffic-period.service';
import { ScheduleTemplateCreateDialogComponent } from '../schedule-templates/schedule-template-create-dialog.component';
import { TrafficPeriodEditorComponent } from '../traffic-periods/traffic-period-editor.component';

interface OrderPositionDialogData {
  order: Order;
}

@Component({
  selector: 'app-order-position-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS],
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
    responsible: [''],
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
  });

  readonly manualPlanForm = this.fb.group({
    trafficPeriodId: ['', Validators.required],
    departure: ['', Validators.required],
    name: [''],
    responsible: [''],
  });

  readonly importFilters = this.fb.group({
    search: [''],
    start: [''],
    end: [''],
  });
  readonly importOptionsForm = this.fb.group({
    trafficPeriodId: ['', Validators.required],
    namePrefix: [''],
    responsible: [''],
  });

  readonly templates = computed(() => this.templateService.templates());
  readonly trafficPeriods = computed(() => this.trafficPeriodService.periods());
  readonly mode = signal<'service' | 'plan' | 'manualPlan' | 'import'>(
    this.modeControl.value,
  );
  readonly manualTemplate = signal<ScheduleTemplate | null>(null);
  readonly importError = signal<string | null>(null);
  readonly importedTrains = signal<ImportedRailMlTrain[]>([]);
  readonly selectedTrainIds = signal<Set<string>>(new Set());
  private readonly importFilterValues = signal<ImportFilterValues>({
    search: '',
    start: '',
    end: '',
  });

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
      this.manualPlanForm.controls.trafficPeriodId.setValue(firstPeriod.id);
      this.importOptionsForm.controls.trafficPeriodId.setValue(firstPeriod.id);
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
  }

  onImportFiltersReset() {
    this.importFilters.reset({ search: '', start: '', end: '' });
    this.importFilterValues.set({ search: '', start: '', end: '' });
  }

  openTemplateCreateDialog(target: 'plan' | 'manualPlan') {
    const dialogRef = this.dialog.open(ScheduleTemplateCreateDialogComponent, {
      width: '95vw',
      maxWidth: '1200px',
    });

    dialogRef.afterClosed().subscribe((payload) => {
      if (!payload) {
        return;
      }

      const template = this.templateService.createTemplate(payload);

      if (target === 'plan') {
        this.planForm.controls.templateId.setValue(template.id);
        if (!this.planForm.controls.namePrefix.value) {
          this.planForm.controls.namePrefix.setValue(template.title);
        }
        if (!this.planForm.controls.responsible.value) {
          this.planForm.controls.responsible.setValue(template.responsibleRu);
        }
      } else {
        this.manualTemplate.set(template);
        if (!this.manualPlanForm.controls.name.value) {
          this.manualPlanForm.controls.name.setValue(template.title);
        }
        if (!this.manualPlanForm.controls.responsible.value) {
          this.manualPlanForm.controls.responsible.setValue(template.responsibleRu);
        }
        if (!this.manualPlanForm.controls.departure.value) {
          const baseDate = template.validity.startDate;
          const time = template.recurrence?.startTime ?? '04:00';
          this.manualPlanForm.controls.departure.setValue(`${baseDate}T${time}`);
        }
      }
      this.errorMessage.set(null);
    });
  }

  openTrafficPeriodEditor(target: 'service' | 'plan' | 'manualPlan' | 'import') {
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
    target: 'service' | 'plan' | 'manualPlan' | 'import',
    periodId: string,
  ) {
    switch (target) {
      case 'service':
        this.serviceForm.controls.trafficPeriodId.setValue(periodId);
        break;
      case 'plan':
        this.planForm.controls.trafficPeriodId.setValue(periodId);
        break;
      case 'manualPlan':
        this.manualPlanForm.controls.trafficPeriodId.setValue(periodId);
        break;
      case 'import':
        this.importOptionsForm.controls.trafficPeriodId.setValue(periodId);
        break;
    }
  }

  clearManualTemplate() {
    this.manualTemplate.set(null);
    this.manualPlanForm.controls.name.reset('');
    this.manualPlanForm.controls.departure.reset('');
    this.manualPlanForm.controls.responsible.reset('');
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
      if (!this.manualTemplate()) {
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

    const start = this.toIso(value.start);
    const end = this.toIso(value.end);
    if (!start || !end) {
      this.errorMessage.set('Bitte gültige Start- und Endzeiten angeben.');
      return;
    }

    if (new Date(end).getTime() < new Date(start).getTime()) {
      this.errorMessage.set('Ende darf nicht vor dem Start liegen.');
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
      responsible: value.responsible?.trim() || undefined,
      deviation: value.deviation?.trim() || undefined,
      name: value.name?.trim() || undefined,
    };

    this.orderService.addServiceOrderItem(payload);
    this.dialogRef.close(true);
  }

  private createManualPlanItem() {
    const template = this.manualTemplate();
    if (!template) {
      this.errorMessage.set('Bitte zuerst einen Fahrplan zusammenstellen.');
      return;
    }

    const value = this.manualPlanForm.getRawValue();
    const departure = this.toIso(value.departure);

    if (!departure) {
      this.errorMessage.set('Bitte eine gültige Abfahrtszeit wählen.');
      return;
    }

    try {
      this.orderService.addManualPlanOrderItem({
        orderId: this.order.id,
        template,
        departure,
        trafficPeriodId: value.trafficPeriodId!,
        name: value.name?.trim() || undefined,
        responsible: value.responsible?.trim() || undefined,
      });
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

    if (this.importOptionsForm.invalid) {
      this.importOptionsForm.markAllAsTouched();
      this.errorMessage.set('Bitte eine Verkehrsperiode auswählen.');
      return;
    }

    const options = this.importOptionsForm.getRawValue();
    const namePrefix = options.namePrefix?.trim();
    const responsible = options.responsible?.trim() || undefined;

    try {
      items.forEach((train) => {
        this.orderService.addImportedPlanOrderItem({
          orderId: this.order.id,
          train,
          trafficPeriodId: options.trafficPeriodId!,
          responsible,
          namePrefix,
        });
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
      { namePrefix: '', responsible: '' },
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

    const trainNodes = Array.from(
      doc.querySelectorAll('train, railml\\:train'),
    );
    const trains: ImportedRailMlTrain[] = [];

    trainNodes.forEach((node, index) => {
      const mapped = this.mapRailMlTrain(doc, node, index);
      if (mapped) {
        trains.push(mapped);
      }
    });

    return trains;
  }

  private mapRailMlTrain(
    doc: Document,
    node: Element,
    index: number,
  ): ImportedRailMlTrain | null {
    const id =
      node.getAttribute('id') ??
      node.getAttribute('trainID') ??
      `train-${index + 1}`;
    const name =
      node.getAttribute('name') ??
      node.getAttribute('trainName') ??
      id;
    const number = node.getAttribute('trainNumber') ?? id;
    const category =
      node.getAttribute('categoryRef') ?? node.getAttribute('category') ?? undefined;

    const ocpNodes = Array.from(node.querySelectorAll('ocpTT'));
    if (!ocpNodes.length) {
      return null;
    }

    const stops = ocpNodes.map((stop, idx) =>
      this.mapRailMlStop(doc, stop, idx),
    ) as ImportedRailMlStop[];
    if (!stops.length) {
      return null;
    }

    stops[0].type = 'origin';
    stops[stops.length - 1].type = 'destination';
    for (let i = 1; i < stops.length - 1; i++) {
      stops[i].type = 'intermediate';
    }

    const startDate =
      node.getAttribute('startDate') ??
      node.getAttribute('operatingPeriodStart') ??
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

    return {
      id,
      name,
      number,
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
    };
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
      node.querySelector('arrival') ?? node.querySelector('railml\\:arrival');
    const departureNode =
      node.querySelector('departure') ?? node.querySelector('railml\\:departure');

    const arrivalEarliest =
      this.sanitizeTime(arrivalNode?.getAttribute('time')) ??
      this.sanitizeTime(node.getAttribute('arrival'));
    const arrivalLatest =
      this.sanitizeTime(arrivalNode?.getAttribute('timeLatest')) ??
      this.sanitizeTime(arrivalNode?.getAttribute('time'));
    const departureEarliest =
      this.sanitizeTime(departureNode?.getAttribute('time')) ??
      this.sanitizeTime(node.getAttribute('departure'));
    const departureLatest =
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

  private resolveLocationName(doc: Document, ocpRef: string | null): string | undefined {
    if (!ocpRef) {
      return undefined;
    }
    const selector = `[id="${ocpRef}"]`;
    const ocp =
      doc.querySelector(`operationControlPoint${selector}`) ??
      doc.querySelector(`ocp${selector}`) ??
      doc.querySelector(`railml\\:operationControlPoint${selector}`) ??
      doc.querySelector(`railml\\:ocp${selector}`);
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
