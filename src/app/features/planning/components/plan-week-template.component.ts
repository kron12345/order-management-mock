import { ChangeDetectionStrategy, Component, OnInit, Signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTableModule } from '@angular/material/table';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PlanWeekTemplate, PlanWeekValidity } from '../../../models/planning-template';
import { PlanWeekTemplateStoreService } from '../stores/plan-week-template.store';

@Component({
  selector: 'app-plan-week-template',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatListModule,
    MatTableModule,
    MatButtonToggleModule,
    MatTooltipModule,
  ],
  templateUrl: './plan-week-template.component.html',
  styleUrl: './plan-week-template.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanWeekTemplateComponent implements OnInit {
  private readonly store = inject(PlanWeekTemplateStoreService);
  private readonly fb = inject(FormBuilder);

  protected readonly templates = this.store.templates;
  protected readonly selectedTemplate = this.store.selectedTemplate;
  protected readonly validities = this.store.selectedValidities;
  protected readonly isLoading = this.store.isLoading;
  protected readonly error = this.store.error;

  protected readonly templateForm: FormGroup = this.fb.group({
    id: [''],
    label: ['', Validators.required],
    description: [''],
    baseWeekStartIso: ['', Validators.required],
    variant: [''],
  });

  protected readonly validityForm: FormGroup = this.fb.group({
    id: [''],
    templateId: [''],
    validFromIso: ['', Validators.required],
    validToIso: ['', Validators.required],
    status: ['draft', Validators.required],
  });

  ngOnInit(): void {
    this.store.loadTemplates();
  }

  protected handleTemplateSelect(template: PlanWeekTemplate): void {
    this.store.selectTemplate(template.id);
    this.templateForm.patchValue(template);
  }

  protected submitTemplate(): void {
    if (this.templateForm.invalid) {
      this.templateForm.markAllAsTouched();
      return;
    }
    const value = this.templateForm.getRawValue();
    const template: PlanWeekTemplate = {
      ...value,
      services: this.selectedTemplate()?.services ?? [],
      createdAtIso: this.selectedTemplate()?.createdAtIso ?? new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
      version: this.selectedTemplate()?.version ?? 'v1',
    } as PlanWeekTemplate;
    this.store.saveTemplate(template);
  }

  protected newTemplate(): void {
    this.templateForm.reset({
      id: '',
      label: '',
      description: '',
      baseWeekStartIso: '',
      variant: '',
    });
    this.store.selectTemplate(null);
  }

  protected deleteSelectedTemplate(): void {
    const selection = this.selectedTemplate();
    if (!selection) {
      return;
    }
    this.store.deleteTemplate(selection.id);
  }

  protected handleValiditySelect(validity: PlanWeekValidity): void {
    this.validityForm.patchValue(validity);
  }

  protected submitValidity(): void {
    const templateId = this.selectedTemplate()?.id;
    if (!templateId || this.validityForm.invalid) {
      this.validityForm.markAllAsTouched();
      return;
    }
    const value = this.validityForm.getRawValue();
    const validity: PlanWeekValidity = {
      id: value.id || (crypto.randomUUID?.() ?? `validity-${Date.now()}`),
      templateId,
      validFromIso: value.validFromIso,
      validToIso: value.validToIso,
      status: value.status,
    } as PlanWeekValidity;
    this.store.saveValidity(templateId, validity);
  }

  protected newValidity(): void {
    this.validityForm.reset({
      id: '',
      validFromIso: '',
      validToIso: '',
      status: 'draft',
    });
  }

  protected deleteValidity(validity: PlanWeekValidity): void {
    const templateId = this.selectedTemplate()?.id;
    if (!templateId) {
      return;
    }
    this.store.deleteValidity(templateId, validity.id);
  }
}
