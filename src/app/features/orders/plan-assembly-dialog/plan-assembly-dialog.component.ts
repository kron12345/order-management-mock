import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  Inject,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
} from '@angular/material/dialog';
import { MATERIAL_IMPORTS } from '../../../core/material.imports.imports';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { TrainPlanStop } from '../../../core/models/train-plan.model';
import { PlanModificationStopInput } from '../../../core/services/train-plan.service';

export interface PlanAssemblyDialogData {
  stops: TrainPlanStop[];
}

export interface PlanAssemblyDialogResult {
  stops: PlanModificationStopInput[];
}

type StopForm = FormGroup<{
  type: FormControl<TrainPlanStop['type']>;
  locationName: FormControl<string>;
  locationCode: FormControl<string>;
  countryCode: FormControl<string>;
  arrivalTime: FormControl<string>;
  departureTime: FormControl<string>;
  arrivalOffsetDays: FormControl<string>;
  departureOffsetDays: FormControl<string>;
  dwellMinutes: FormControl<string>;
  activities: FormControl<string>;
  platform: FormControl<string>;
  notes: FormControl<string>;
}>;

@Component({
  selector: 'app-plan-assembly-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ScrollingModule, ...MATERIAL_IMPORTS],
  templateUrl: './plan-assembly-dialog.component.html',
  styleUrl: './plan-assembly-dialog.component.scss',
})
export class PlanAssemblyDialogComponent {
  private readonly dialogRef = inject<
    MatDialogRef<PlanAssemblyDialogComponent, PlanAssemblyDialogResult | undefined>
  >(MatDialogRef);
  private readonly fb = inject(FormBuilder);
  private readonly data = inject<PlanAssemblyDialogData>(MAT_DIALOG_DATA);
  private readonly cdr = inject(ChangeDetectorRef);
  @ViewChild(CdkVirtualScrollViewport)
  private readonly viewport?: CdkVirtualScrollViewport;

  readonly form = this.fb.group({
    stops: this.fb.array(
      this.data.stops.map((stop) => this.createStopForm(stop)),
    ) as FormArray<StopForm>,
  });
  readonly errorMessage = signal<string | null>(null);
  readonly selectedIndex = signal(0);
  readonly stopList = signal<StopForm[]>([]);

  constructor() {
    this.stopList.set([...this.stopsArray.controls]);
  }

  get stopsControls(): StopForm[] {
    return this.stopsArray.controls;
  }

  get stopsArray(): FormArray<StopForm> {
    return this.form.controls.stops as FormArray<StopForm>;
  }

  selectStop(index: number) {
    if (index < 0 || index >= this.stopsArray.length) {
      return;
    }
    this.selectedIndex.set(index);
  }

  selectedStopControl(): StopForm | null {
    const index = this.selectedIndex();
    return this.stopsControls[index] ?? null;
  }

  addStop(afterIndex: number) {
    const base = this.stopsControls[Math.max(0, afterIndex)];
    const newStop = this.createStopForm({
      id: '',
      sequence: afterIndex + 2,
      type: base.controls.type.value,
      locationName: base.controls.locationName.value,
      locationCode: base.controls.locationCode.value,
      countryCode: base.controls.countryCode.value || undefined,
      activities: base.controls.activities.value
        ? base.controls.activities.value.split(',').map((v) => v.trim()).filter(Boolean)
        : ['0001'],
    } as TrainPlanStop);
    const insertIndex = Math.min(afterIndex + 1, this.stopsArray.length);
    this.stopsArray.insert(insertIndex, newStop);
    this.resequenceStops();
    this.selectStop(insertIndex);
    this.refreshList();
  }

  removeStop(index: number) {
    if (this.stopsArray.length <= 2) {
      this.errorMessage.set('Ein Fahrplan benötigt mindestens zwei Halte.');
      return;
    }
    this.stopsArray.removeAt(index);
    this.resequenceStops();
    const nextIndex = Math.min(this.stopsArray.length - 1, Math.max(0, this.selectedIndex()));
    this.selectStop(nextIndex);
    this.refreshList();
  }

  moveStop(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= this.stopsArray.length) {
      return;
    }
    const control = this.stopsArray.at(index);
    this.stopsArray.removeAt(index);
    this.stopsArray.insert(target, control);
    this.resequenceStops();
    this.selectStop(target);
    this.refreshList();
  }

  cancel() {
    this.dialogRef.close();
  }

  submit() {
    if (this.form.invalid) {
      this.errorMessage.set('Bitte alle Pflichtfelder der Halte prüfen.');
      this.form.markAllAsTouched();
      return;
    }
    const stops = this.stopsControls.map((group, index) => this.toStopInput(group, index));
    this.dialogRef.close({
      stops,
    });
  }

  private createStopForm(stop: TrainPlanStop): StopForm {
    return this.fb.group({
      type: this.fb.nonNullable.control(stop.type, {
        validators: [Validators.required],
      }),
      locationName: this.fb.nonNullable.control(stop.locationName, {
        validators: [Validators.required],
      }),
      locationCode: this.fb.nonNullable.control(stop.locationCode, {
        validators: [Validators.required],
      }),
      countryCode: this.fb.nonNullable.control(stop.countryCode ?? ''),
      arrivalTime: this.fb.nonNullable.control(stop.arrivalTime ?? ''),
      departureTime: this.fb.nonNullable.control(stop.departureTime ?? ''),
      arrivalOffsetDays: this.fb.nonNullable.control(
        stop.arrivalOffsetDays?.toString() ?? '',
      ),
      departureOffsetDays: this.fb.nonNullable.control(
        stop.departureOffsetDays?.toString() ?? '',
      ),
      dwellMinutes: this.fb.nonNullable.control(stop.dwellMinutes?.toString() ?? ''),
      activities: this.fb.nonNullable.control(stop.activities.join(', ')),
      platform: this.fb.nonNullable.control(stop.platform ?? ''),
      notes: this.fb.nonNullable.control(stop.notes ?? ''),
    }) as StopForm;
  }

  private resequenceStops() {
    this.stopsControls.forEach((group, index) => {
      const typeControl = group.controls.type;
      if (index === 0) {
        typeControl.setValue('origin');
      } else if (index === this.stopsArray.length - 1) {
        typeControl.setValue('destination');
      } else if (typeControl.value === 'origin' || typeControl.value === 'destination') {
        typeControl.setValue('intermediate');
      }
    });
  }

  private toStopInput(group: StopForm, index: number): PlanModificationStopInput {
    return {
      sequence: index + 1,
      type: group.controls.type.value,
      locationName: group.controls.locationName.value.trim(),
      locationCode: group.controls.locationCode.value.trim(),
      countryCode: group.controls.countryCode.value.trim() || undefined,
      arrivalTime: group.controls.arrivalTime.value.trim() || undefined,
      departureTime: group.controls.departureTime.value.trim() || undefined,
      arrivalOffsetDays: this.toNumber(group.controls.arrivalOffsetDays.value),
      departureOffsetDays: this.toNumber(group.controls.departureOffsetDays.value),
      dwellMinutes: this.toNumber(group.controls.dwellMinutes.value),
      activities: this.parseActivities(group.controls.activities.value),
      platform: group.controls.platform.value.trim() || undefined,
      notes: group.controls.notes.value.trim() || undefined,
    };
  }

  private toNumber(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return undefined;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private parseActivities(value: string): string[] {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  private refreshList() {
    this.stopList.set([...this.stopsArray.controls]);
    this.viewport?.checkViewportSize();
    this.cdr.detectChanges();
  }

  stopName(control: StopForm): string {
    return control.controls.locationName.value.trim() || control.controls.locationCode.value.trim() || 'Unbekannter Halt';
  }

  stopTimes(control: StopForm): string {
    const arrival = control.controls.arrivalTime.value.trim();
    const departure = control.controls.departureTime.value.trim();
    const arrivalOffset = control.controls.arrivalOffsetDays.value.trim();
    const departureOffset = control.controls.departureOffsetDays.value.trim();
    const parts: string[] = [];

    if (arrival) {
      parts.push(`An ${arrival}${arrivalOffset ? ` (+${arrivalOffset}T)` : ''}`);
    }
    if (departure) {
      parts.push(`Ab ${departure}${departureOffset ? ` (+${departureOffset}T)` : ''}`);
    }
    if (!parts.length) {
      return 'Zeitfenster noch offen';
    }
    return parts.join(' • ');
  }

  stopTypeLabel(control: StopForm): string {
    const type = control.controls.type.value;
    switch (type) {
      case 'origin':
        return 'Start';
      case 'destination':
        return 'Ziel';
      default:
        return 'Zwischenhalt';
    }
  }

  stopTypeIcon(control: StopForm): string {
    const type = control.controls.type.value;
    switch (type) {
      case 'origin':
        return 'play_arrow';
      case 'destination':
        return 'flag';
      default:
        return 'more_horiz';
    }
  }

  isEdgeStop(index: number): boolean {
    return index === 0 || index === this.stopsControls.length - 1;
  }

  trackByIndex(index: number, _control: StopForm): number {
    return index;
  }
}
