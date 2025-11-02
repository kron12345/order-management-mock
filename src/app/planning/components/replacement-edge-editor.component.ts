import {
  ChangeDetectionStrategy,
  Component,
  Pipe,
  PipeTransform,
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
import { ReplacementEdge } from '../../shared/planning-types';

const uid = () => crypto.randomUUID();

@Pipe({
  name: 'routeLabel',
  standalone: true,
})
export class RouteLabelPipe implements PipeTransform {
  transform(routeId: string, map: Map<string, string>): string {
    return map.get(routeId) ?? routeId;
  }
}

@Pipe({
  name: 'stopLabel',
  standalone: true,
})
export class StopLabelPipe implements PipeTransform {
  transform(stopId: string, map: Map<string, string>): string {
    return map.get(stopId) ?? stopId;
  }
}

@Component({
  selector: 'app-replacement-edge-editor',
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
    RouteLabelPipe,
    StopLabelPipe,
  ],
  template: `
    <div class="editor">
      <section class="editor__list">
        <header>
          <h2>Replacement Edges</h2>
          <span>{{ edges().length }} Einträge</span>
        </header>
        <mat-selection-list [multiple]="false">
          @for (edge of edges(); track edge.replacementEdgeId) {
            <mat-list-option
              [selected]="selectedId() === edge.replacementEdgeId"
              (click)="select(edge)"
            >
              <div mat-line>
                {{ edge.replacementRouteId | routeLabel: routeNameMap() }} · Seq {{ edge.seq }}
              </div>
              <div mat-line class="secondary">
                {{ edge.fromStopId | stopLabel: stopNameMap() }} →
                {{ edge.toStopId | stopLabel: stopNameMap() }}
              </div>
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
              <mat-label>Route</mat-label>
              <mat-select formControlName="replacementRouteId" required>
                @for (route of routes(); track route.replacementRouteId) {
                  <mat-option [value]="route.replacementRouteId">{{ route.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Von (Stop)</mat-label>
              <mat-select formControlName="fromStopId" required>
                @for (stop of stops(); track stop.replacementStopId) {
                  <mat-option [value]="stop.replacementStopId">{{ stop.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Nach (Stop)</mat-label>
              <mat-select formControlName="toStopId" required>
                @for (stop of stops(); track stop.replacementStopId) {
                  <mat-option [value]="stop.replacementStopId">{{ stop.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Sequenz</mat-label>
              <input type="number" matInput formControlName="seq" required min="1" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Dauer (Sek.)</mat-label>
              <input type="number" matInput formControlName="avgDurationSec" />
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
export class ReplacementEdgeEditorComponent {
  private readonly store = inject(PlanningStoreService);
  private readonly fb = inject(FormBuilder);

  readonly routes = computed(() =>
    [...this.store.replacementRoutes()].sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly stops = computed(() =>
    [...this.store.replacementStops()].sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly edges = computed(() =>
    [...this.store.replacementEdges()].sort((a, b) =>
      a.replacementRouteId.localeCompare(b.replacementRouteId) || a.seq - b.seq,
    ),
  );

  readonly routeNameMapSignal = computed(() => {
    const map = new Map<string, string>();
    this.routes().forEach((route) => map.set(route.replacementRouteId, route.name));
    return map;
  });

  readonly stopNameMapSignal = computed(() => {
    const map = new Map<string, string>();
    this.stops().forEach((stop) => map.set(stop.replacementStopId, stop.name));
    return map;
  });

  readonly selectedId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly form: FormGroup = this.fb.group({
    replacementRouteId: ['', Validators.required],
    fromStopId: ['', Validators.required],
    toStopId: ['', Validators.required],
    seq: [1, [Validators.required, Validators.min(1)]],
    avgDurationSec: [null],
    distanceM: [null],
  });

  private readonly syncEffect = effect(
    () => {
      const id = this.selectedId();
      if (!id) {
        return;
      }
      const edge = this.store.replacementEdges().find(
        (item) => item.replacementEdgeId === id,
      );
      if (!edge) {
        this.selectedId.set(null);
        this.resetForm();
        return;
      }
      this.form.patchValue(
        {
          replacementRouteId: edge.replacementRouteId,
          fromStopId: edge.fromStopId,
          toStopId: edge.toStopId,
          seq: edge.seq,
          avgDurationSec: edge.avgDurationSec ?? null,
          distanceM: edge.distanceM ?? null,
        },
        { emitEvent: false },
      );
      this.error.set(null);
    },
    { allowSignalWrites: true },
  );

  select(edge: ReplacementEdge): void {
    this.selectedId.set(edge.replacementEdgeId);
  }

  createNew(): void {
    this.selectedId.set(null);
    this.form.reset({
      replacementRouteId: '',
      fromStopId: '',
      toStopId: '',
      seq: 1,
      avgDurationSec: null,
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
    const edge = this.store.replacementEdges().find(
      (item) => item.replacementEdgeId === id,
    );
    if (edge) {
      this.form.patchValue(
        {
          replacementRouteId: edge.replacementRouteId,
          fromStopId: edge.fromStopId,
          toStopId: edge.toStopId,
          seq: edge.seq,
          avgDurationSec: edge.avgDurationSec ?? null,
          distanceM: edge.distanceM ?? null,
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
    if (value.fromStopId === value.toStopId) {
      this.error.set('Start und Ziel müssen unterschiedlich sein.');
      return;
    }
    const payload: ReplacementEdge = {
      replacementEdgeId: this.selectedId() ?? uid(),
      replacementRouteId: value.replacementRouteId,
      fromStopId: value.fromStopId,
      toStopId: value.toStopId,
      seq: Number(value.seq),
      avgDurationSec: value.avgDurationSec != null ? Number(value.avgDurationSec) : undefined,
      distanceM: value.distanceM != null ? Number(value.distanceM) : undefined,
    };

    try {
      if (this.selectedId()) {
        this.store.updateReplacementEdge(payload.replacementEdgeId, payload);
      } else {
        this.store.addReplacementEdge(payload);
        this.selectedId.set(payload.replacementEdgeId);
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
    this.store.removeReplacementEdge(id);
    this.selectedId.set(null);
    this.resetForm();
  }

  routeNameMap(): Map<string, string> {
    return this.routeNameMapSignal();
  }

  stopNameMap(): Map<string, string> {
    return this.stopNameMapSignal();
  }
}
