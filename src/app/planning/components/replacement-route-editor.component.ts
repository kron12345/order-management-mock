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
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import { PlanningStoreService } from '../../shared/planning-store.service';
import { ReplacementRoute } from '../../shared/planning-types';

const uid = () => crypto.randomUUID();

@Component({
  selector: 'app-replacement-route-editor',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatListModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    ...MATERIAL_IMPORTS,
  ],
  template: `
    <div class="editor">
      <section class="editor__list">
        <header>
          <h2>Replacement Routes</h2>
          <span>{{ routes().length }} Einträge</span>
        </header>
        <mat-selection-list [multiple]="false">
          @for (route of routes(); track route.replacementRouteId) {
            <mat-list-option
              [selected]="selectedId() === route.replacementRouteId"
              (click)="select(route)"
            >
              <div mat-line>{{ route.name }}</div>
              <div mat-line class="secondary">{{ route.operator || '—' }}</div>
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
              <mat-label>Betreiber</mat-label>
              <input matInput formControlName="operator" />
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
export class ReplacementRouteEditorComponent {
  private readonly store = inject(PlanningStoreService);
  private readonly fb = inject(FormBuilder);

  readonly routes = computed(() =>
    [...this.store.replacementRoutes()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  readonly selectedId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    operator: [''],
  });

  private readonly syncEffect = effect(
    () => {
      const id = this.selectedId();
      if (!id) {
        return;
      }
      const route = this.store.replacementRoutes().find(
        (item) => item.replacementRouteId === id,
      );
      if (!route) {
        this.selectedId.set(null);
        this.resetForm();
        return;
      }
      this.form.patchValue(
        {
          name: route.name,
          operator: route.operator ?? '',
        },
        { emitEvent: false },
      );
      this.error.set(null);
    },
    { allowSignalWrites: true },
  );

  select(route: ReplacementRoute): void {
    this.selectedId.set(route.replacementRouteId);
  }

  createNew(): void {
    this.selectedId.set(null);
    this.form.reset({
      name: '',
      operator: '',
    });
    this.error.set(null);
  }

  resetForm(): void {
    const id = this.selectedId();
    if (!id) {
      this.createNew();
      return;
    }
    const route = this.store.replacementRoutes().find(
      (item) => item.replacementRouteId === id,
    );
    if (route) {
      this.form.patchValue(
        {
          name: route.name,
          operator: route.operator ?? '',
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
    const payload: ReplacementRoute = {
      replacementRouteId: this.selectedId() ?? uid(),
      name: value.name.trim(),
      operator: value.operator?.trim() || undefined,
    };

    try {
      if (this.selectedId()) {
        this.store.updateReplacementRoute(payload.replacementRouteId, payload);
      } else {
        this.store.addReplacementRoute(payload);
        this.selectedId.set(payload.replacementRouteId);
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
    this.store.removeReplacementRoute(id);
    this.selectedId.set(null);
    this.resetForm();
  }
}

