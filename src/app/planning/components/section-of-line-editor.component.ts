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
import { SectionOfLine, SolNature } from '../../shared/planning-types';

const uid = () => crypto.randomUUID();
const SOL_NATURES: SolNature[] = ['REGULAR', 'LINK'];

@Component({
  selector: 'app-section-of-line-editor',
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
          <h2>Sections of Line</h2>
          <span>{{ sections().length }} Einträge</span>
        </header>
        <mat-selection-list [multiple]="false">
          @for (sol of sections(); track sol.solId) {
            <mat-list-option
              [selected]="selectedId() === sol.solId"
              (click)="select(sol)"
            >
              <div mat-line>{{ sol.startUniqueOpId }} → {{ sol.endUniqueOpId }}</div>
              <div mat-line class="secondary">{{ sol.nature }} · {{ sol.lengthKm || '—' }} km</div>
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
              <mat-label>Start OP</mat-label>
              <mat-select formControlName="startUniqueOpId" required>
                @for (op of operationalPoints(); track op.uniqueOpId) {
                  <mat-option [value]="op.uniqueOpId">{{ op.name }} ({{ op.uniqueOpId }})</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Ende OP</mat-label>
              <mat-select formControlName="endUniqueOpId" required>
                @for (op of operationalPoints(); track op.uniqueOpId) {
                  <mat-option [value]="op.uniqueOpId">{{ op.name }} ({{ op.uniqueOpId }})</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Länge (km)</mat-label>
              <input type="number" matInput formControlName="lengthKm" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Nature</mat-label>
              <mat-select formControlName="nature" required>
                @for (nature of solNatures; track nature) {
                  <mat-option [value]="nature">{{ nature }}</mat-option>
                }
              </mat-select>
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

      .editor__list {
        display: flex;
        flex-direction: column;
        gap: 16px;
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
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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
export class SectionOfLineEditorComponent {
  private readonly store = inject(PlanningStoreService);
  private readonly fb = inject(FormBuilder);

  readonly solNatures = SOL_NATURES;
  readonly operationalPoints = computed(() =>
    [...this.store.operationalPoints()].sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly sections = computed(() =>
    [...this.store.sectionsOfLine()].sort((a, b) =>
      a.startUniqueOpId.localeCompare(b.startUniqueOpId),
    ),
  );

  readonly selectedId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly form: FormGroup = this.fb.group({
    startUniqueOpId: ['', Validators.required],
    endUniqueOpId: ['', Validators.required],
    lengthKm: [null],
    nature: ['REGULAR', Validators.required],
  });

  private readonly syncEffect = effect(
    () => {
      const id = this.selectedId();
      if (!id) {
        return;
      }
      const sol = this.store.sectionsOfLine().find((item) => item.solId === id);
      if (!sol) {
        this.selectedId.set(null);
        this.resetForm();
        return;
      }
      this.form.patchValue(
        {
          startUniqueOpId: sol.startUniqueOpId,
          endUniqueOpId: sol.endUniqueOpId,
          lengthKm: sol.lengthKm ?? null,
          nature: sol.nature,
        },
        { emitEvent: false },
      );
      this.error.set(null);
    },
    { allowSignalWrites: true },
  );

  select(sol: SectionOfLine): void {
    this.selectedId.set(sol.solId);
  }

  createNew(): void {
    this.selectedId.set(null);
    this.form.reset({
      startUniqueOpId: '',
      endUniqueOpId: '',
      lengthKm: null,
      nature: 'REGULAR',
    });
    this.error.set(null);
  }

  resetForm(): void {
    const id = this.selectedId();
    if (!id) {
      this.createNew();
      return;
    }
    const sol = this.store.sectionsOfLine().find((item) => item.solId === id);
    if (sol) {
      this.form.patchValue(
        {
          startUniqueOpId: sol.startUniqueOpId,
          endUniqueOpId: sol.endUniqueOpId,
          lengthKm: sol.lengthKm ?? null,
          nature: sol.nature,
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
    if (value.startUniqueOpId === value.endUniqueOpId) {
      this.error.set('Start und Ende dürfen nicht identisch sein.');
      return;
    }
    const payload: SectionOfLine = {
      solId: this.selectedId() ?? uid(),
      startUniqueOpId: value.startUniqueOpId,
      endUniqueOpId: value.endUniqueOpId,
      lengthKm: value.lengthKm != null ? Number(value.lengthKm) : undefined,
      nature: value.nature,
    };

    try {
      if (this.selectedId()) {
        this.store.updateSectionOfLine(payload.solId, payload);
      } else {
        this.store.addSectionOfLine(payload);
        this.selectedId.set(payload.solId);
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
    this.store.removeSectionOfLine(id);
    this.selectedId.set(null);
    this.resetForm();
  }
}

