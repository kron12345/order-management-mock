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
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import { PlanningStoreService } from '../../shared/planning-store.service';
import { OpType, OperationalPoint } from '../../shared/planning-types';

const uid = () => crypto.randomUUID();

const OP_TYPES: OpType[] = ['STATION', 'JUNCTION', 'BORDER_POINT', 'SIDING_AREA'];

@Component({
  selector: 'app-operational-point-editor',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatListModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    ...MATERIAL_IMPORTS,
  ],
  template: `
    <div class="editor">
      <section class="editor__list">
        <header>
          <h2>Operational Points</h2>
          <span>{{ operationalPoints().length }} Einträge</span>
        </header>
        <mat-selection-list [multiple]="false">
          @for (op of operationalPoints(); track op.opId) {
            <mat-list-option
              [selected]="selectedId() === op.opId"
              (click)="select(op)"
              role="button"
            >
              <div mat-line>{{ op.name }}</div>
              <div mat-line class="secondary">{{ op.uniqueOpId }} · {{ op.opType }}</div>
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
              <mat-label>Unique OP ID</mat-label>
              <input matInput formControlName="uniqueOpId" required />
              <mat-error>Unique OP ID ist erforderlich.</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Name</mat-label>
              <input matInput formControlName="name" required />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Land</mat-label>
              <input matInput formControlName="countryCode" maxlength="2" required />
              <mat-hint>ISO-2 (z. B. DE)</mat-hint>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Typ</mat-label>
              <mat-select formControlName="opType" required>
                @for (type of opTypes; track type) {
                  <mat-option [value]="type">{{ type }}</mat-option>
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
              matTooltip="Löschen"
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

      .editor__list {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .editor__list header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
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
export class OperationalPointEditorComponent {
  private readonly store = inject(PlanningStoreService);
  private readonly fb = inject(FormBuilder);

  readonly opTypes = OP_TYPES;

  readonly operationalPoints = computed(() =>
    [...this.store.operationalPoints()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  readonly form: FormGroup = this.fb.group({
    uniqueOpId: ['', Validators.required],
    name: ['', Validators.required],
    countryCode: ['DE', [Validators.required, Validators.minLength(2), Validators.maxLength(2)]],
    opType: ['STATION', Validators.required],
    lat: [52.5, Validators.required],
    lng: [13.4, Validators.required],
  });

  readonly selectedId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  private readonly syncEffect = effect(
    () => {
      const id = this.selectedId();
      if (!id) {
        return;
      }
      const op = this.store.operationalPoints().find((item) => item.opId === id);
      if (!op) {
        this.selectedId.set(null);
        this.resetForm();
        return;
      }
      this.form.patchValue(
        {
          uniqueOpId: op.uniqueOpId,
          name: op.name,
          countryCode: op.countryCode,
          opType: op.opType,
          lat: op.position.lat,
          lng: op.position.lng,
        },
        { emitEvent: false },
      );
      this.error.set(null);
    },
    { allowSignalWrites: true },
  );

  select(op: OperationalPoint): void {
    this.selectedId.set(op.opId);
  }

  createNew(): void {
    this.selectedId.set(null);
    this.form.reset({
      uniqueOpId: '',
      name: '',
      countryCode: 'DE',
      opType: 'STATION',
      lat: 0,
      lng: 0,
    });
    this.error.set(null);
  }

  resetForm(): void {
    if (this.selectedId()) {
      const op = this.store.operationalPoints().find((item) => item.opId === this.selectedId());
      if (op) {
        this.form.patchValue(
          {
            uniqueOpId: op.uniqueOpId,
            name: op.name,
            countryCode: op.countryCode,
            opType: op.opType,
            lat: op.position.lat,
            lng: op.position.lng,
          },
          { emitEvent: false },
        );
      }
    } else {
      this.form.reset({
        uniqueOpId: '',
        name: '',
        countryCode: 'DE',
        opType: 'STATION',
        lat: 0,
        lng: 0,
      });
    }
    this.error.set(null);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const payload: OperationalPoint = {
      opId: this.selectedId() ?? uid(),
      uniqueOpId: value.uniqueOpId.trim(),
      name: value.name.trim(),
      countryCode: value.countryCode.trim().toUpperCase(),
      opType: value.opType,
      position: { lat: Number(value.lat), lng: Number(value.lng) },
    };

    try {
      if (this.selectedId()) {
        this.store.updateOperationalPoint(payload.opId, payload);
      } else {
        this.store.addOperationalPoint(payload);
        this.selectedId.set(payload.opId);
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
    this.store.removeOperationalPoint(id);
    this.selectedId.set(null);
    this.resetForm();
  }
}
