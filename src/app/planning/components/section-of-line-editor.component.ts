import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { PlanningStoreService } from '../../shared/planning-store.service';
import { SectionOfLine, SolNature } from '../../shared/planning-types';
import { CustomAttributeService } from '../../core/services/custom-attribute.service';
import {
  AttributeEntityEditorComponent,
  AttributeEntityRecord,
  BulkApplyEvent,
  EntitySaveEvent,
} from '../../shared/components/attribute-entity-editor/attribute-entity-editor.component';
import { mergeAttributeEntry } from '../../shared/utils/topology-attribute.helpers';
import { TopologyApiService } from '../topology-api.service';

const DEFAULT_FALLBACK = {
  startUniqueOpId: '',
  endUniqueOpId: '',
  lengthKm: '',
  nature: 'REGULAR',
};

const SOL_NATURES: SolNature[] = ['REGULAR', 'LINK'];

@Component({
  selector: 'app-section-of-line-editor',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    AttributeEntityEditorComponent,
  ],
  template: `
    <section class="topology-editor">
      <header class="topology-editor__toolbar">
        <button
          mat-stroked-button
          color="primary"
          type="button"
          (click)="triggerSectionImport()"
          [disabled]="importState() === 'running'"
        >
          <mat-icon fontIcon="cloud_download"></mat-icon>
          Importieren
          <mat-progress-spinner
            *ngIf="importState() === 'running'"
            diameter="16"
            mode="indeterminate"
          ></mat-progress-spinner>
        </button>
        <button
          mat-button
          type="button"
          *ngIf="canToggleConsole()"
          (click)="toggleImportConsole()"
          [disabled]="importState() === 'running'"
        >
          {{ importConsoleOpen() ? 'Konsole schließen' : 'Konsole anzeigen' }}
        </button>
      </header>

      <div class="topology-editor__console" *ngIf="importConsoleVisible()">
        <header>
          <span>Import-Log</span>
          <button
            mat-icon-button
            type="button"
            (click)="hideImportConsole()"
            [disabled]="importState() === 'running'"
          >
            <mat-icon>close</mat-icon>
          </button>
        </header>
        <pre>{{ importLogs().join('\n') }}</pre>
      </div>

      <app-attribute-entity-editor
        [title]="'Sections of Line'"
        [entities]="entityRecords()"
        [attributeDefinitions]="attributeDefinitions()"
        [defaultFallbackValues]="defaultFallback"
        [numericKeys]="numericKeys"
        [detailError]="error()"
        (saveEntity)="handleSave($event)"
        (deleteEntities)="handleDelete($event)"
        (bulkApply)="handleBulkApply($event)"
      />
    </section>
  `,
  styleUrl: './section-of-line-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionOfLineEditorComponent {
  private readonly store = inject(PlanningStoreService);
  private readonly customAttributes = inject(CustomAttributeService);
  private readonly topologyApi = inject(TopologyApiService);

  readonly attributeDefinitions = computed(() =>
    this.customAttributes.list('topology-sections-of-line'),
  );
  readonly entityRecords = computed<AttributeEntityRecord[]>(() =>
    this.store.sectionsOfLine().map((sol) => ({
      id: sol.solId,
      label: `${sol.startUniqueOpId} → ${sol.endUniqueOpId}`,
      secondaryLabel: `${sol.nature} · ${sol.lengthKm ?? '—'} km`,
      attributes: sol.attributes ?? [],
      fallbackValues: {
        startUniqueOpId: sol.startUniqueOpId,
        endUniqueOpId: sol.endUniqueOpId,
        lengthKm: sol.lengthKm != null ? String(sol.lengthKm) : '',
        nature: sol.nature,
      },
    })),
  );

  readonly defaultFallback = DEFAULT_FALLBACK;
  readonly numericKeys = ['lengthKm'];
  readonly error = signal<string | null>(null);
  readonly importLogs = signal<string[]>([]);
  readonly importState = signal<'idle' | 'running' | 'success' | 'error'>('idle');
  readonly importConsoleOpen = signal(false);
  readonly importConsoleVisible = computed(
    () => this.importState() === 'running' || this.importConsoleOpen(),
  );
  readonly canToggleConsole = computed(
    () => this.importLogs().length > 0 || this.importState() !== 'idle',
  );

  handleSave(event: EntitySaveEvent): void {
    const core = this.deriveCoreFields(event.payload.values);
    if (!core.ok) {
      this.error.set(core.error);
      return;
    }
    const payload: SectionOfLine = {
      solId: event.entityId ?? uid(),
      startUniqueOpId: core.startUniqueOpId,
      endUniqueOpId: core.endUniqueOpId,
      lengthKm: core.lengthKm,
      nature: core.nature,
      attributes: event.payload.attributes,
    };

    try {
      if (event.entityId) {
        this.store.updateSectionOfLine(payload.solId, payload);
      } else {
        this.store.addSectionOfLine(payload);
      }
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    }
  }

  handleDelete(ids: string[]): void {
    ids.forEach((id) => this.store.removeSectionOfLine(id));
  }

  handleBulkApply(event: BulkApplyEvent): void {
    const definitions = this.attributeDefinitions();
    event.entityIds.forEach((id) => {
      const sol = this.findSection(id);
      if (!sol) {
        return;
      }
      const merged = mergeAttributeEntry(definitions, sol.attributes, {
        key: event.key,
        value: event.value,
        validFrom: event.validFrom || undefined,
      });
      this.store.updateSectionOfLine(id, { ...sol, attributes: merged });
    });
  }

  async triggerSectionImport(): Promise<void> {
    if (this.importState() === 'running') {
      return;
    }
    this.importState.set('running');
    this.importLogs.set(['Import gestartet …']);
    this.importConsoleOpen.set(true);
    try {
      const logs = await firstValueFrom(this.topologyApi.importSectionsOfLine());
      const normalized = this.normalizeLogs(logs);
      this.importLogs.set(['Import gestartet …', ...normalized, 'Import abgeschlossen.']);
      this.importState.set('success');
      await this.store.refreshSectionsOfLineFromApi();
    } catch (error) {
      this.importLogs.update((lines) => [...lines, `Fehler: ${this.describeError(error)}`]);
      this.importState.set('error');
    }
  }

  toggleImportConsole(): void {
    if (this.importState() === 'running') {
      return;
    }
    this.importConsoleOpen.set(!this.importConsoleOpen());
  }

  hideImportConsole(): void {
    if (this.importState() === 'running') {
      return;
    }
    this.importConsoleOpen.set(false);
  }

  private deriveCoreFields(values: Record<string, string>):
    | {
        ok: true;
        startUniqueOpId: string;
        endUniqueOpId: string;
        lengthKm?: number;
        nature: SolNature;
      }
    | { ok: false; error: string } {
    const startUniqueOpId = values['startUniqueOpId']?.trim();
    const endUniqueOpId = values['endUniqueOpId']?.trim();
    if (!startUniqueOpId || !endUniqueOpId) {
      return { ok: false, error: 'Start- und End-OP müssen gesetzt sein.' };
    }
    if (!this.findOperationalPointByUniqueId(startUniqueOpId)) {
      return { ok: false, error: 'Start-OP existiert nicht.' };
    }
    if (!this.findOperationalPointByUniqueId(endUniqueOpId)) {
      return { ok: false, error: 'End-OP existiert nicht.' };
    }
    const natureRaw = values['nature']?.trim().toUpperCase() as SolNature | undefined;
    if (!natureRaw || !SOL_NATURES.includes(natureRaw)) {
      return { ok: false, error: 'Nature ist ungültig.' };
    }
    const lengthRaw = values['lengthKm']?.trim() ?? '';
    const length = lengthRaw ? Number(lengthRaw) : undefined;
    if (lengthRaw && !Number.isFinite(length)) {
      return { ok: false, error: 'Länge muss numerisch sein.' };
    }

    return {
      ok: true,
      startUniqueOpId,
      endUniqueOpId,
      lengthKm: length,
      nature: natureRaw,
    };
  }

  private normalizeLogs(logs: string[] | undefined): string[] {
    if (!logs || logs.length === 0) {
      return ['Keine Rückmeldungen vom Backend.'];
    }
    return logs
      .map((line) => line?.toString().trim())
      .filter((line): line is string => !!line && line.length > 0);
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error ?? 'Unbekannter Fehler');
  }

  private findOperationalPointByUniqueId(uniqueOpId: string) {
    return this.store.operationalPoints().find((op) => op.uniqueOpId === uniqueOpId);
  }

  private findSection(id: string): SectionOfLine | null {
    return this.store.sectionsOfLine().find((entry) => entry.solId === id) ?? null;
  }
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
