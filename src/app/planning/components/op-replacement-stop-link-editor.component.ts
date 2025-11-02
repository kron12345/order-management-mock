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
import { OpReplacementStopLink, OpReplRelation } from '../../shared/planning-types';

const uid = () => crypto.randomUUID();
const RELATIONS: OpReplRelation[] = ['PRIMARY_SEV_STOP', 'ALTERNATIVE', 'TEMPORARY'];

@Component({
  selector: 'app-op-replacement-stop-link-editor',
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
          <h2>OP ↔ Replacement Stop Links</h2>
          <span>{{ links().length }} Einträge</span>
        </header>
        <mat-selection-list [multiple]="false">
          @for (link of links(); track link.linkId) {
            <mat-list-option
              [selected]="selectedId() === link.linkId"
              (click)="select(link)"
            >
              <div mat-line>
                {{ link.uniqueOpId }} → {{ link.replacementStopId }}
              </div>
              <div mat-line class="secondary">{{ link.relationType }}</div>
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
              <mat-label>Operational Point</mat-label>
              <mat-select formControlName="uniqueOpId" required>
                @for (op of operationalPoints(); track op.uniqueOpId) {
                  <mat-option [value]="op.uniqueOpId">{{ op.name }} ({{ op.uniqueOpId }})</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Replacement Stop</mat-label>
              <mat-select formControlName="replacementStopId" required>
                @for (stop of stops(); track stop.replacementStopId) {
                  <mat-option [value]="stop.replacementStopId">{{ stop.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Relation</mat-label>
              <mat-select formControlName="relationType" required>
                @for (type of relations; track type) {
                  <mat-option [value]="type">{{ type }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Fußweg (Sek.)</mat-label>
              <input type="number" matInput formControlName="walkingTimeSec" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Distanz (Meter)</mat-label>
              <input type="number" matInput formControlName="distanceM" />
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
export class OpReplacementStopLinkEditorComponent {
  private readonly store = inject(PlanningStoreService);
  private readonly fb = inject(FormBuilder);

  readonly relations = RELATIONS;
  readonly operationalPoints = computed(() =>
    [...this.store.operationalPoints()].sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly stops = computed(() =>
    [...this.store.replacementStops()].sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly links = computed(() =>
    [...this.store.opReplacementStopLinks()].sort((a, b) => {
      const opCompare = a.uniqueOpId.localeCompare(b.uniqueOpId);
      if (opCompare !== 0) {
        return opCompare;
      }
      return a.replacementStopId.localeCompare(b.replacementStopId);
    }),
  );

  readonly selectedId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly form: FormGroup = this.fb.group({
    uniqueOpId: ['', Validators.required],
    replacementStopId: ['', Validators.required],
    relationType: ['PRIMARY_SEV_STOP', Validators.required],
    walkingTimeSec: [null],
    distanceM: [null],
  });

  private readonly syncEffect = effect(
    () => {
      const id = this.selectedId();
      if (!id) {
        return;
      }
      const link = this.store.opReplacementStopLinks().find((item) => item.linkId === id);
      if (!link) {
        this.selectedId.set(null);
        this.resetForm();
        return;
      }
      this.form.patchValue(
        {
          uniqueOpId: link.uniqueOpId,
          replacementStopId: link.replacementStopId,
          relationType: link.relationType,
          walkingTimeSec: link.walkingTimeSec ?? null,
          distanceM: link.distanceM ?? null,
        },
        { emitEvent: false },
      );
      this.error.set(null);
    },
    { allowSignalWrites: true },
  );

  select(link: OpReplacementStopLink): void {
    this.selectedId.set(link.linkId);
  }

  createNew(): void {
    this.selectedId.set(null);
    this.form.reset({
      uniqueOpId: '',
      replacementStopId: '',
      relationType: 'PRIMARY_SEV_STOP',
      walkingTimeSec: null,
      distanceM: null,
    });
    this.error.set(null);
  }

  resetForm(): void {
    const id = this.selectedId();
    if (!id) {
      this.createNew();
      return;
    }
    const link = this.store.opReplacementStopLinks().find((item) => item.linkId === id);
    if (link) {
      this.form.patchValue(
        {
          uniqueOpId: link.uniqueOpId,
          replacementStopId: link.replacementStopId,
          relationType: link.relationType,
          walkingTimeSec: link.walkingTimeSec ?? null,
          distanceM: link.distanceM ?? null,
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
    const payload: OpReplacementStopLink = {
      linkId: this.selectedId() ?? uid(),
      uniqueOpId: value.uniqueOpId,
      replacementStopId: value.replacementStopId,
      relationType: value.relationType,
      walkingTimeSec: value.walkingTimeSec != null ? Number(value.walkingTimeSec) : undefined,
      distanceM: value.distanceM != null ? Number(value.distanceM) : undefined,
    };

    try {
      if (this.selectedId()) {
        this.store.updateOpReplacementStopLink(payload.linkId, payload);
      } else {
        this.store.addOpReplacementStopLink(payload);
        this.selectedId.set(payload.linkId);
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
    this.store.removeOpReplacementStopLink(id);
    this.selectedId.set(null);
    this.resetForm();
  }
}

