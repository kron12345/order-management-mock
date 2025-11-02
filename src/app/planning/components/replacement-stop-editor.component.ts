import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatListModule } from '@angular/material/list';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import { PlanningStoreService } from '../../shared/planning-store.service';
import { ReplacementStop } from '../../shared/planning-types';

const uid = () => crypto.randomUUID();

@Component({
  selector: 'app-replacement-stop-editor',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatListModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    ...MATERIAL_IMPORTS,
  ],
  template: `
    <div class="editor">
      <section class="editor__list">
        <header>
          <h2>Replacement Stops</h2>
          <span>{{ stops().length }} Einträge</span>
        </header>
        <mat-selection-list [multiple]="false">
          @for (stop of stops(); track stop.replacementStopId) {
            <mat-list-option
              [selected]="selectedId() === stop.replacementStopId"
              (click)="select(stop)"
            >
              <div mat-line>{{ stop.name }}</div>
              <div mat-line class="secondary">{{ stop.stopCode || 'ohne Code' }}</div>
            </mat-list-option>
          }
        </mat-selection-list>
        <button mat-stroked-button color="primary" type="button" (click)="createNew()">
          <mat-icon>add</mat-icon>
          Neu anlegen
        </button>
      </section>

      <section class="editor__detail">
        <form [formGroup]="form" (ngSubmit)="save()">
          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Name</mat-label>
              <input matInput formControlName="name" required />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Stop-Code</mat-label>
              <input matInput formControlName="stopCode" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Nächster OP</mat-label>
              <mat-select formControlName="nearestUniqueOpId">
                <mat-option [value]="null">Keiner</mat-option>
                @for (op of operationalPoints(); track op.uniqueOpId) {
                  <mat-option [value]="op.uniqueOpId">{{ op.name }} ({{ op.uniqueOpId }})</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Latitude</mat-label>
              <input type="number" matInput formControlName="lat" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Longitude</mat-label>
              <input type="number" matInput formControlName="lng" />
            </mat-form-field>
          </div>

          <div class="actions">
            <span class="error" *ngIf="error()">{{ error() }}</span>
            <button mat-stroked-button type="button" (click)="resetForm()">Zurücksetzen</button>
            <button mat-flat-button color="primary" type="submit">
              {{ selectedId() ? 'Speichern' : 'Anlegen' }}
            </button>
            <button
              mat-icon-button
              color="warn"
              type="button"
              (click)="deleteSelected()"
              [disabled]="!selectedId()"
            >
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        </form>
      </section>
    </div>
  `,
  styles: [
    `
      .editor {
        display: grid;
        grid-template-columns: 320px 1fr;
        gap: 24px;
        padding: 24px;
      }

      mat-selection-list {
        max-height: 320px;
        overflow: auto;
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 8px;
      }

      .secondary {
        font-size: 12px;
        opacity: 0.7;
      }

      .editor__detail {
        padding: 16px;
        border-radius: 12px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        background: rgba(255, 255, 255, 0.9);
      }

      .form-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
      }

      .actions {
        margin-top: 16px;
        display: flex;
        gap: 12px;
        align-items: center;
      }

      .error {
        color: #d32f2f;
        font-size: 12px;
        flex: 1;
      }

      @media (max-width: 960px) {
        .editor {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReplacementStopEditorComponent {
  private readonly store = inject(PlanningStoreService);
  private readonly fb = inject(FormBuilder);

  readonly operationalPoints = computed(() =>
    [...this.store.operationalPoints()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  readonly stops = computed(() =>
    [...this.store.replacementStops()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  readonly selectedId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    stopCode: [''],
    nearestUniqueOpId: [null as string | null],
    lat: [52.5, Validators.required],
    lng: [13.4, Validators.required],
  });

  private readonly syncEffect = effect(
    () => {
      const id = this.selectedId();
      if (!id) {
        return;
      }
      const stop = this.store.replacementStops().find((item) => item.replacementStopId === id);
      if (!stop) {
        this.selectedId.set(null);
        this.resetForm();
        return;
      }
      this.form.patchValue(
        {
          name: stop.name,
          stopCode: stop.stopCode ?? '',
          nearestUniqueOpId: stop.nearestUniqueOpId ?? null,
          lat: stop.position.lat,
          lng: stop.position.lng,
        },
        { emitEvent: false },
      );
      this.error.set(null);
    },
    { allowSignalWrites: true },
  );

  select(stop: ReplacementStop): void {
    this.selectedId.set(stop.replacementStopId);
  }

  createNew(): void {
    this.selectedId.set(null);
    this.form.reset({
      name: '',
      stopCode: '',
      nearestUniqueOpId: null,
      lat: 0,
      lng: 0,
    });
    this.error.set(null);
  }

  resetForm(): void {
    const id = this.selectedId();
    if (!id) {
      this.createNew();
      return;
    }
    const stop = this.store.replacementStops().find((item) => item.replacementStopId === id);
    if (stop) {
      this.form.patchValue(
        {
          name: stop.name,
          stopCode: stop.stopCode ?? '',
          nearestUniqueOpId: stop.nearestUniqueOpId ?? null,
          lat: stop.position.lat,
          lng: stop.position.lng,
        },
        { emitEvent: false },
      );
    }
    this.error.set(null);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const payload: ReplacementStop = {
      replacementStopId: this.selectedId() ?? uid(),
      name: value.name.trim(),
      stopCode: value.stopCode?.trim() || undefined,
      nearestUniqueOpId: value.nearestUniqueOpId ?? undefined,
      position: { lat: Number(value.lat), lng: Number(value.lng) },
    };

    try {
      if (this.selectedId()) {
        this.store.updateReplacementStop(payload.replacementStopId, payload);
      } else {
        this.store.addReplacementStop(payload);
        this.selectedId.set(payload.replacementStopId);
      }
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    }
  }

  deleteSelected(): void {
    const id = this.selectedId();
    if (!id) {
      return;
    }
    this.store.removeReplacementStop(id);
    this.selectedId.set(null);
    this.resetForm();
  }
}

