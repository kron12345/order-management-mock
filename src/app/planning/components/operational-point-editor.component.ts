import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { PlanningStoreService } from '../../shared/planning-store.service';
import { OperationalPoint } from '../../shared/planning-types';
import { CustomAttributeService } from '../../core/services/custom-attribute.service';
import {
  AttributeActionEvent,
  AttributeEntityEditorComponent,
  AttributeEntityRecord,
  BulkApplyEvent,
  EntitySaveEvent,
} from '../../shared/components/attribute-entity-editor/attribute-entity-editor.component';
import { isTemporalAttribute, mergeAttributeEntry } from '../../shared/utils/topology-attribute.helpers';
import { TopologyApiService } from '../topology-api.service';

const DEFAULT_FALLBACK = {
  uniqueOpId: '',
  name: '',
  countryCode: '',
  opType: '',
  lat: '',
  lng: '',
};

@Component({
  selector: 'app-operational-point-editor',
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
          (click)="triggerOperationalPointImport()"
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
        [title]="'Operational Points'"
        [entities]="entityRecords()"
        [attributeDefinitions]="attributeDefinitions()"
        [defaultFallbackValues]="defaultFallback"
        [numericKeys]="numericKeys"
        [actionKeys]="actionKeys"
        [detailError]="error()"
        (saveEntity)="handleSave($event)"
        (deleteEntities)="handleDelete($event)"
        (bulkApply)="handleBulkApply($event)"
        (actionTriggered)="handleAction($event)"
      />
    </section>
  `,
  styleUrl: './operational-point-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperationalPointEditorComponent {
  private readonly store = inject(PlanningStoreService);
  private readonly customAttributes = inject(CustomAttributeService);
  private readonly topologyApi = inject(TopologyApiService);

  readonly attributeDefinitions = computed(() =>
    this.customAttributes.list('topology-operational-points'),
  );
  readonly entityRecords = computed<AttributeEntityRecord[]>(() =>
    this.store.operationalPoints().map((op) => ({
      id: op.opId,
      label: op.name,
      secondaryLabel: `${op.uniqueOpId} · ${op.countryCode}`,
      attributes: op.attributes ?? [],
      fallbackValues: {
        uniqueOpId: op.uniqueOpId,
        name: op.name,
        countryCode: op.countryCode,
        opType: op.opType,
        lat: String(op.position.lat ?? ''),
        lng: String(op.position.lng ?? ''),
      },
    })),
  );

  readonly defaultFallback = DEFAULT_FALLBACK;
  readonly numericKeys = ['lat', 'lng'];
  readonly actionKeys = ['lat', 'lng'];
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
    const payload: OperationalPoint = {
      opId: event.entityId ?? uid(),
      uniqueOpId: core.uniqueOpId,
      name: core.name,
      countryCode: core.countryCode,
      opType: core.opType,
      position: { lat: core.lat, lng: core.lng },
      attributes: event.payload.attributes,
    };

    try {
      if (event.entityId) {
        this.store.updateOperationalPoint(payload.opId, payload);
      } else {
        this.store.addOperationalPoint(payload);
      }
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    }
  }

  handleDelete(ids: string[]): void {
    ids.forEach((id) => this.store.removeOperationalPoint(id));
  }

  handleBulkApply(event: BulkApplyEvent): void {
    const definitions = this.attributeDefinitions();
    event.entityIds.forEach((id) => {
      const op = this.findOperationalPoint(id);
      if (!op) {
        return;
      }
      const merged = mergeAttributeEntry(definitions, op.attributes, {
        key: event.key,
        value: event.value,
        validFrom: event.validFrom || undefined,
      });
      this.store.updateOperationalPoint(id, {
        ...op,
        attributes: merged,
      });
    });
  }

  async triggerOperationalPointImport(): Promise<void> {
    if (this.importState() === 'running') {
      return;
    }
    this.importState.set('running');
    this.importLogs.set(['Import gestartet …']);
    this.importConsoleOpen.set(true);
    try {
      const logs = await firstValueFrom(this.topologyApi.importOperationalPoints());
      const normalized = this.normalizeLogs(logs);
      this.importLogs.set(['Import gestartet …', ...normalized, 'Import abgeschlossen.']);
      this.importState.set('success');
      await this.store.refreshOperationalPointsFromApi();
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

  handleAction(event: AttributeActionEvent): void {
    if (event.key !== 'lat' && event.key !== 'lng') {
      return;
    }
    const lat = event.values['lat'];
    const lng = event.values['lng'];
    if (!this.isValidNumber(lat) || !this.isValidNumber(lng)) {
      this.error.set('Bitte gültige Koordinaten eingeben.');
      return;
    }
    window.open(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=16`, '_blank');
  }

  private deriveCoreFields(values: Record<string, string>):
    | {
        ok: true;
        uniqueOpId: string;
        name: string;
        countryCode: string;
        opType: string;
        lat: number;
        lng: number;
      }
    | { ok: false; error: string } {
    const uniqueOpId = values['uniqueOpId']?.trim();
    if (!uniqueOpId) {
      return { ok: false, error: 'Unique OP ID ist erforderlich.' };
    }
    const name = values['name']?.trim();
    if (!name) {
      return { ok: false, error: 'Name ist erforderlich.' };
    }
    const countryCode = values['countryCode']?.trim();
    if (!countryCode) {
      return { ok: false, error: 'Country Code ist erforderlich.' };
    }
    const opType = values['opType']?.trim();
    if (!opType) {
      return { ok: false, error: 'OP-Typ ist erforderlich.' };
    }
    const latRaw = values['lat']?.trim() ?? '';
    const lngRaw = values['lng']?.trim() ?? '';
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, error: 'Latitude und Longitude müssen numerisch sein.' };
    }

    return {
      ok: true,
      uniqueOpId,
      name,
      countryCode,
      opType,
      lat,
      lng,
    };
  }

  private isValidNumber(value: string | undefined): boolean {
    if (value == null || value === '') {
      return false;
    }
    return Number.isFinite(Number(value));
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

  private findOperationalPoint(id: string): OperationalPoint | null {
    return this.store.operationalPoints().find((entry) => entry.opId === id) ?? null;
  }
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
