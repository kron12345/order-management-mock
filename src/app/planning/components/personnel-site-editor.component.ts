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
import { PersonnelSite, PersonnelSiteType } from '../../shared/planning-types';

const uid = () => crypto.randomUUID();
const SITE_TYPES: PersonnelSiteType[] = ['MELDESTELLE', 'PAUSENRAUM', 'BEREITSCHAFT', 'BÜRO'];

@Component({
  selector: 'app-personnel-site-editor',
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
          <h2>Personnel Sites</h2>
          <span>{{ sites().length }} Einträge</span>
        </header>
        <mat-selection-list [multiple]="false">
          @for (site of sites(); track site.siteId) {
            <mat-list-option
              [selected]="selectedId() === site.siteId"
              (click)="select(site)"
            >
              <div mat-line>{{ site.name }}</div>
              <div mat-line class="secondary">{{ site.siteType }} · {{ site.uniqueOpId || 'ohne OP' }}</div>
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
              <mat-label>Typ</mat-label>
              <mat-select formControlName="siteType" required>
                @for (type of siteTypes; track type) {
                  <mat-option [value]="type">{{ type }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Zugeordneter OP</mat-label>
              <mat-select formControlName="uniqueOpId">
                <mat-option [value]="null">Kein OP</mat-option>
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

            <mat-form-field appearance="outline" class="wide">
              <mat-label>Öffnungszeiten (JSON)</mat-label>
              <textarea matInput rows="3" formControlName="openingHoursJson"></textarea>
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

      .wide {
        grid-column: 1 / -1;
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
export class PersonnelSiteEditorComponent {
  private readonly store = inject(PlanningStoreService);
  private readonly fb = inject(FormBuilder);

  readonly siteTypes = SITE_TYPES;

  readonly operationalPoints = computed(() =>
    [...this.store.operationalPoints()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  readonly sites = computed(() =>
    [...this.store.personnelSites()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  readonly selectedId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    siteType: ['MELDESTELLE', Validators.required],
    uniqueOpId: [null as string | null],
    lat: [52.5, Validators.required],
    lng: [13.4, Validators.required],
    openingHoursJson: [''],
  });

  private readonly syncEffect = effect(
    () => {
      const id = this.selectedId();
      if (!id) {
        return;
      }
      const site = this.store.personnelSites().find((item) => item.siteId === id);
      if (!site) {
        this.selectedId.set(null);
        this.resetForm();
        return;
      }
      this.form.patchValue(
        {
          name: site.name,
          siteType: site.siteType,
          uniqueOpId: site.uniqueOpId ?? null,
          lat: site.position.lat,
          lng: site.position.lng,
          openingHoursJson: site.openingHoursJson ?? '',
        },
        { emitEvent: false },
      );
      this.error.set(null);
    },
    { allowSignalWrites: true },
  );

  select(site: PersonnelSite): void {
    this.selectedId.set(site.siteId);
  }

  createNew(): void {
    this.selectedId.set(null);
    this.form.reset({
      name: '',
      siteType: 'MELDESTELLE',
      uniqueOpId: null,
      lat: 0,
      lng: 0,
      openingHoursJson: '',
    });
    this.error.set(null);
  }

  resetForm(): void {
    const id = this.selectedId();
    if (!id) {
      this.createNew();
      return;
    }
    const site = this.store.personnelSites().find((item) => item.siteId === id);
    if (site) {
      this.form.patchValue(
        {
          name: site.name,
          siteType: site.siteType,
          uniqueOpId: site.uniqueOpId ?? null,
          lat: site.position.lat,
          lng: site.position.lng,
          openingHoursJson: site.openingHoursJson ?? '',
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
    const payload: PersonnelSite = {
      siteId: this.selectedId() ?? uid(),
      siteType: value.siteType,
      name: value.name.trim(),
      uniqueOpId: value.uniqueOpId ?? undefined,
      position: { lat: Number(value.lat), lng: Number(value.lng) },
      openingHoursJson: value.openingHoursJson?.trim() || undefined,
    };

    try {
      if (this.selectedId()) {
        this.store.updatePersonnelSite(payload.siteId, payload);
      } else {
        this.store.addPersonnelSite(payload);
        this.selectedId.set(payload.siteId);
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
    this.store.removePersonnelSite(id);
    this.selectedId.set(null);
    this.resetForm();
  }
}

