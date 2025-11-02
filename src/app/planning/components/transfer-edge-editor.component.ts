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
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import { PlanningStoreService } from '../../shared/planning-store.service';
import { TransferEdge, TransferMode, TransferNode } from '../../shared/planning-types';

const uid = () => crypto.randomUUID();
const MODES: TransferMode[] = ['WALK', 'SHUTTLE', 'INTERNAL'];

interface NodeOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-transfer-edge-editor',
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
    MatSlideToggleModule,
    ...MATERIAL_IMPORTS,
  ],
  template: `
    <div class="editor">
      <section class="editor__list">
        <header>
          <h2>Transfer Edges</h2>
          <span>{{ edges().length }} Einträge</span>
        </header>
        <mat-selection-list [multiple]="false">
          @for (edge of edges(); track edge.transferId) {
            <mat-list-option
              [selected]="selectedId() === edge.transferId"
              (click)="select(edge)"
            >
              <div mat-line>{{ formatNode(edge.from) }} → {{ formatNode(edge.to) }}</div>
              <div mat-line class="secondary">{{ edge.mode }} · {{ edge.avgDurationSec || '—' }}s</div>
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
              <mat-label>Von - Typ</mat-label>
              <mat-select formControlName="fromKind" required>
                <mat-option value="OP">Operational Point</mat-option>
                <mat-option value="PERSONNEL_SITE">Personnel Site</mat-option>
                <mat-option value="REPLACEMENT_STOP">Replacement Stop</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Von - Knoten</mat-label>
              <mat-select formControlName="fromNode" required>
                @for (option of fromNodeOptions(); track option.value) {
                  <mat-option [value]="option.value">{{ option.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Nach - Typ</mat-label>
              <mat-select formControlName="toKind" required>
                <mat-option value="OP">Operational Point</mat-option>
                <mat-option value="PERSONNEL_SITE">Personnel Site</mat-option>
                <mat-option value="REPLACEMENT_STOP">Replacement Stop</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Nach - Knoten</mat-label>
              <mat-select formControlName="toNode" required>
                @for (option of toNodeOptions(); track option.value) {
                  <mat-option [value]="option.value">{{ option.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Modus</mat-label>
              <mat-select formControlName="mode" required>
                @for (mode of modes; track mode) {
                  <mat-option [value]="mode">{{ mode }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Dauer (Sek.)</mat-label>
              <input type="number" matInput formControlName="avgDurationSec" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Distanz (Meter)</mat-label>
              <input type="number" matInput formControlName="distanceM" />
            </mat-form-field>

            <mat-slide-toggle formControlName="bidirectional" color="primary">
              Bidirektional
            </mat-slide-toggle>
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
export class TransferEdgeEditorComponent {
  private readonly store = inject(PlanningStoreService);
  private readonly fb = inject(FormBuilder);

  readonly modes = MODES;

  readonly operationalPoints = computed(() =>
    [...this.store.operationalPoints()].sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly personnelSites = computed(() =>
    [...this.store.personnelSites()].sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly replacementStops = computed(() =>
    [...this.store.replacementStops()].sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly edges = computed(() =>
    [...this.store.transferEdges()].sort((a, b) =>
      this.formatNode(a.from).localeCompare(this.formatNode(b.from)),
    ),
  );

  readonly selectedId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly form: FormGroup = this.fb.group({
    fromKind: ['OP', Validators.required],
    fromNode: ['', Validators.required],
    toKind: ['OP', Validators.required],
    toNode: ['', Validators.required],
    mode: ['WALK', Validators.required],
    avgDurationSec: [null],
    distanceM: [null],
    bidirectional: [true],
  });

  private readonly syncEffect = effect(
    () => {
      const id = this.selectedId();
      if (!id) {
        return;
      }
      const edge = this.store.transferEdges().find((item) => item.transferId === id);
      if (!edge) {
        this.selectedId.set(null);
        this.resetForm();
        return;
      }
      this.form.patchValue(
        {
          fromKind: edge.from.kind,
          fromNode: this.nodeValue(edge.from),
          toKind: edge.to.kind,
          toNode: this.nodeValue(edge.to),
          mode: edge.mode,
          avgDurationSec: edge.avgDurationSec ?? null,
          distanceM: edge.distanceM ?? null,
          bidirectional: edge.bidirectional,
        },
        { emitEvent: false },
      );
      this.error.set(null);
    },
    { allowSignalWrites: true },
  );

  select(edge: TransferEdge): void {
    this.selectedId.set(edge.transferId);
  }

  createNew(): void {
    this.selectedId.set(null);
    this.form.reset({
      fromKind: 'OP',
      fromNode: '',
      toKind: 'OP',
      toNode: '',
      mode: 'WALK',
      avgDurationSec: null,
      distanceM: null,
      bidirectional: true,
    });
    this.error.set(null);
  }

  resetForm(): void {
    const id = this.selectedId();
    if (!id) {
      this.createNew();
      return;
    }
    const edge = this.store.transferEdges().find((item) => item.transferId === id);
    if (edge) {
      this.form.patchValue(
        {
          fromKind: edge.from.kind,
          fromNode: this.nodeValue(edge.from),
          toKind: edge.to.kind,
          toNode: this.nodeValue(edge.to),
          mode: edge.mode,
          avgDurationSec: edge.avgDurationSec ?? null,
          distanceM: edge.distanceM ?? null,
          bidirectional: edge.bidirectional,
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
    const fromNode = this.parseNode(value.fromKind, value.fromNode);
    const toNode = this.parseNode(value.toKind, value.toNode);
    if (this.nodesEqual(fromNode, toNode)) {
      this.error.set('Von- und Nach-Knoten müssen unterschiedlich sein.');
      return;
    }
    const payload: TransferEdge = {
      transferId: this.selectedId() ?? uid(),
      from: fromNode,
      to: toNode,
      mode: value.mode,
      avgDurationSec: value.avgDurationSec != null ? Number(value.avgDurationSec) : undefined,
      distanceM: value.distanceM != null ? Number(value.distanceM) : undefined,
      bidirectional: !!value.bidirectional,
    };

    try {
      if (this.selectedId()) {
        this.store.updateTransferEdge(payload.transferId, payload);
      } else {
        this.store.addTransferEdge(payload);
        this.selectedId.set(payload.transferId);
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
    this.store.removeTransferEdge(id);
    this.selectedId.set(null);
    this.resetForm();
  }

  formatNode(node: TransferNode): string {
    switch (node.kind) {
      case 'OP':
        return `OP ${node.uniqueOpId}`;
      case 'PERSONNEL_SITE':
        return `Site ${node.siteId}`;
      case 'REPLACEMENT_STOP':
        return `SEV ${node.replacementStopId}`;
    }
  }

  fromNodeOptions(): NodeOption[] {
    return this.buildNodeOptions((this.form.get('fromKind')?.value as string) ?? '');
  }

  toNodeOptions(): NodeOption[] {
    return this.buildNodeOptions((this.form.get('toKind')?.value as string) ?? '');
  }

  private buildNodeOptions(kind: string): NodeOption[] {
    switch (kind) {
      case 'OP':
        return this.operationalPoints().map((op) => ({
          value: op.uniqueOpId,
          label: `${op.name} (${op.uniqueOpId})`,
        }));
      case 'PERSONNEL_SITE':
        return this.personnelSites().map((site) => ({
          value: site.siteId,
          label: `${site.name}`,
        }));
      case 'REPLACEMENT_STOP':
        return this.replacementStops().map((stop) => ({
          value: stop.replacementStopId,
          label: stop.name,
        }));
      default:
        return [];
    }
  }

  private parseNode(kind: string, value: string): TransferNode {
    switch (kind) {
      case 'OP':
        return { kind: 'OP', uniqueOpId: value };
      case 'PERSONNEL_SITE':
        return { kind: 'PERSONNEL_SITE', siteId: value };
      case 'REPLACEMENT_STOP':
        return { kind: 'REPLACEMENT_STOP', replacementStopId: value };
      default:
        throw new Error(`Unsupported node kind "${kind}"`);
    }
  }

  private nodeValue(node: TransferNode): string {
    switch (node.kind) {
      case 'OP':
        return node.uniqueOpId;
      case 'PERSONNEL_SITE':
        return node.siteId;
      case 'REPLACEMENT_STOP':
        return node.replacementStopId;
    }
  }

  private nodesEqual(a: TransferNode, b: TransferNode): boolean {
    if (a.kind !== b.kind) {
      return false;
    }
    switch (a.kind) {
      case 'OP':
        return a.uniqueOpId === (b as { uniqueOpId: string }).uniqueOpId;
      case 'PERSONNEL_SITE':
        return a.siteId === (b as { siteId: string }).siteId;
      case 'REPLACEMENT_STOP':
        return a.replacementStopId === (b as { replacementStopId: string }).replacementStopId;
    }
    return false;
  }
}
