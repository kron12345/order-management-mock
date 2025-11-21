import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ActivityCatalogService,
  ActivityDefinition,
  ActivityTemplate,
  ActivityAttributeValue,
} from '../../core/services/activity-catalog.service';
import { ResourceKind } from '../../models/resource';
import { AbstractControl, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-activity-catalog-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    MatTooltipModule,
  ],
  templateUrl: './activity-catalog-settings.component.html',
  styleUrl: './activity-catalog-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityCatalogSettingsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly catalog = inject(ActivityCatalogService);

  protected readonly templates = this.catalog.templates;
  protected readonly activities = this.catalog.definitions;
  private readonly attributePresetMap = computed(() => {
    const map = new Map<string, Record<string, string>>();
    const addPreset = (key: string | null | undefined, meta?: Record<string, string>) => {
      const trimmed = (key ?? '').trim();
      if (!trimmed || map.has(trimmed)) {
        return;
      }
      map.set(trimmed, meta ?? {});
    };
    const seedMeta: Record<string, Record<string, string>> = {
      'field:start': { datatype: 'timepoint', oncreate: 'edit', onupdate: 'edit' },
      'field:end': { datatype: 'timepoint', oncreate: 'edit', onupdate: 'edit' },
      'field:from': { datatype: 'string', oncreate: 'edit', onupdate: 'edit' },
      'field:to': { datatype: 'string', oncreate: 'edit', onupdate: 'edit' },
      'field:remark': { datatype: 'string', oncreate: 'edit', onupdate: 'edit' },
      color: { datatype: 'color', value: '#1976d2' },
      draw_as: {
        datatype: 'enum',
        options:
          'line-above,line-below,shift-up,shift-down,dot,square,triangle-up,triangle-down,thick,background',
        oncreate: 'edit',
        onupdate: 'edit',
      },
      layer: {
        datatype: 'enum',
        options: 'default,background,marker',
        oncreate: 'edit',
        onupdate: 'edit',
      },
    };
    Object.entries(seedMeta).forEach(([k, v]) => addPreset(k, v));
    this.templates().forEach((tpl) => (tpl.attributes ?? []).forEach((attr) => addPreset(attr.key, attr.meta)));
    this.activities().forEach((def) => (def.attributes ?? []).forEach((attr) => addPreset(attr.key, attr.meta)));
    return map;
  });
  protected readonly attributePresets = computed(() =>
    Array.from(this.attributePresetMap().entries()).map(([key, meta]) => ({ key, meta })),
  );

  protected readonly templateEditId = signal<string | null>(null);
  protected readonly activityEditId = signal<string | null>(null);

  protected readonly templateForm = this.fb.group({
    label: ['', [Validators.required, Validators.maxLength(80)]],
    id: ['', [Validators.required, Validators.maxLength(80)]],
    description: [''],
    activityType: [''],
    defaultDurationMinutes: [null as number | null],
    attributes: this.fb.array([]),
  });

  protected readonly activityForm = this.fb.group({
    label: ['', [Validators.required, Validators.maxLength(80)]],
    id: ['', [Validators.required, Validators.maxLength(80)]],
    activityType: ['', [Validators.required, Validators.maxLength(80)]],
    templateId: [null as string | null],
    defaultDurationMinutes: [null as number | null],
    relevantFor: this.fb.control<ResourceKind[]>([]),
    attributes: this.fb.array([]),
  });

  private readonly templatesById = computed(() =>
    new Map(this.templates().map((t) => [t.id, t] as const)),
  );

  protected get templateAttributes(): FormArray {
    return this.templateForm.get('attributes') as FormArray;
  }

  protected get activityAttributes(): FormArray {
    return this.activityForm.get('attributes') as FormArray;
  }

  protected startTemplateEdit(template: ActivityTemplate): void {
    this.templateEditId.set(template.id);
    this.templateForm.reset({
      label: template.label,
      id: template.id,
      description: template.description ?? '',
      activityType: template.activityType ?? '',
      defaultDurationMinutes: template.defaultDurationMinutes ?? null,
    });
    this.setAttributes(this.templateAttributes, template.attributes);
  }

  protected cancelTemplateEdit(): void {
    this.templateEditId.set(null);
    this.templateForm.reset({
      label: '',
      id: '',
      description: '',
      activityType: '',
      defaultDurationMinutes: null,
    });
    this.templateAttributes.clear();
  }

  protected saveTemplate(): void {
    if (this.templateForm.invalid) {
      this.templateForm.markAllAsTouched();
      return;
    }
    const payload = this.buildTemplatePayload();
    const id = this.templateEditId();
    if (id) {
      this.catalog.updateTemplate(id, payload);
    } else {
      this.catalog.addTemplate(payload);
    }
    this.cancelTemplateEdit();
  }

  protected removeTemplate(template: ActivityTemplate): void {
    this.catalog.removeTemplate(template.id);
    if (this.templateEditId() === template.id) {
      this.cancelTemplateEdit();
    }
  }

  protected startActivityEdit(activity: ActivityDefinition): void {
    this.activityEditId.set(activity.id);
    this.activityForm.reset({
      label: activity.label,
      id: activity.id,
      activityType: activity.activityType,
      templateId: activity.templateId ?? null,
      defaultDurationMinutes: activity.defaultDurationMinutes ?? null,
      relevantFor: activity.relevantFor ?? [],
    });
    this.setAttributes(this.activityAttributes, activity.attributes);
  }

  protected cancelActivityEdit(): void {
    this.activityEditId.set(null);
    this.activityForm.reset({
      label: '',
      id: '',
      activityType: '',
      templateId: null,
      defaultDurationMinutes: null,
      relevantFor: [],
    });
    this.activityAttributes.clear();
  }

  protected saveActivity(): void {
    if (this.activityForm.invalid) {
      this.activityForm.markAllAsTouched();
      return;
    }
    const payload = this.buildActivityPayload();
    const id = this.activityEditId();
    if (id) {
      this.catalog.updateDefinition(id, payload);
    } else {
      this.catalog.addDefinition(payload);
    }
    this.cancelActivityEdit();
  }

  protected removeActivity(activity: ActivityDefinition): void {
    this.catalog.removeDefinition(activity.id);
    if (this.activityEditId() === activity.id) {
      this.cancelActivityEdit();
    }
  }

  protected addTemplateAttribute(): void {
    this.templateAttributes.push(this.buildAttributeGroup());
  }

  protected addActivityAttribute(): void {
    this.activityAttributes.push(this.buildAttributeGroup());
  }

  protected addTemplateMeta(attrGroup: AbstractControl): void {
    const metaArray = this.attributeMetaArray(attrGroup);
    metaArray.push(this.buildMetaGroup());
  }

  protected removeTemplateMeta(attrGroup: AbstractControl, index: number): void {
    this.attributeMetaArray(attrGroup).removeAt(index);
  }

  protected templateMetaControls(attrGroup: AbstractControl) {
    return this.attributeMetaArray(attrGroup).controls;
  }

  protected addActivityMeta(attrGroup: AbstractControl): void {
    const metaArray = this.attributeMetaArray(attrGroup);
    metaArray.push(this.buildMetaGroup());
  }

  protected removeActivityMeta(attrGroup: AbstractControl, index: number): void {
    this.attributeMetaArray(attrGroup).removeAt(index);
  }

  protected activityMetaControls(attrGroup: AbstractControl) {
    return this.attributeMetaArray(attrGroup).controls;
  }

  protected removeTemplateAttribute(index: number): void {
    this.templateAttributes.removeAt(index);
  }

  protected removeActivityAttribute(index: number): void {
    this.activityAttributes.removeAt(index);
  }

  protected addTemplateAttributeFromPreset(presetKey: string | null): void {
    if (!presetKey) {
      return;
    }
    const group = this.buildAttributeGroup();
    this.applyPreset(group, presetKey);
    this.templateAttributes.push(group);
  }

  protected addActivityAttributeFromPreset(presetKey: string | null): void {
    if (!presetKey) {
      return;
    }
    const group = this.buildAttributeGroup();
    this.applyPreset(group, presetKey);
    this.activityAttributes.push(group);
  }

  protected applyTemplateToActivity(templateId: string | null): void {
    if (!templateId) {
      return;
    }
    const template = this.templatesById().get(templateId);
    if (!template) {
      return;
    }
    this.activityForm.patchValue({
      activityType: template.activityType ?? this.activityForm.controls.activityType.value,
      defaultDurationMinutes:
        template.defaultDurationMinutes ?? this.activityForm.controls.defaultDurationMinutes.value,
    });
    this.setAttributes(this.activityAttributes, template.attributes);
  }

  private buildAttributeGroup(value?: ActivityAttributeValue) {
    return this.fb.group({
      key: [value?.key ?? '', [Validators.required, Validators.maxLength(80)]],
      meta: this.fb.array(
        Object.entries(value?.meta ?? {}).map(([k, v]) =>
          this.buildMetaGroup(k, v),
        ),
      ),
    });
  }

  private buildMetaGroup(key?: string, value?: string) {
    return this.fb.group({
      key: [key ?? '', [Validators.required, Validators.maxLength(80)]],
      value: [value ?? '', [Validators.required, Validators.maxLength(256)]],
    });
  }

  private attributeMetaArray(attrGroup: AbstractControl): FormArray {
    const fg = attrGroup as FormGroup;
    return fg.get('meta') as FormArray;
  }

  private applyPreset(attrGroup: AbstractControl, presetKey: string): void {
    const preset = this.attributePresetMap().get(presetKey);
    const fg = attrGroup as FormGroup;
    fg.get('key')?.setValue(presetKey);
    if (preset) {
      const metaArray = this.attributeMetaArray(attrGroup);
      metaArray.clear();
      Object.entries(preset).forEach(([k, v]) => {
        metaArray.push(this.buildMetaGroup(k, v));
      });
    }
  }

  private setAttributes(formArray: FormArray, attributes: ActivityAttributeValue[]): void {
    formArray.clear();
    attributes.forEach((attr) => formArray.push(this.buildAttributeGroup(attr)));
  }

  private collectAttributes(formArray: FormArray): ActivityAttributeValue[] {
    return formArray.controls
      .map((ctrl) => ctrl.value as ActivityAttributeValue)
      .filter((entry) => entry && entry.key)
      .map((entry, index) => {
        const metaCtrlArray = (formArray.at(index) as any).get('meta') as FormArray | null;
        const meta =
          metaCtrlArray && metaCtrlArray.value
            ? metaCtrlArray.value
                .filter((m: { key?: string; value?: string }) => m && m.key && m.value)
                .reduce((acc: Record<string, string>, curr: { key: string; value: string }) => {
                  acc[curr.key.trim()] = curr.value.toString().trim();
                  return acc;
                }, {})
            : undefined;
        return {
          key: entry.key.trim(),
          meta: meta && Object.keys(meta).length ? meta : undefined,
        };
      });
  }

  private buildTemplatePayload(): ActivityTemplate {
    const raw = this.templateForm.getRawValue();
    return {
      id: (raw.id ?? '').trim(),
      label: (raw.label ?? '').trim(),
      description: raw.description?.trim() || undefined,
      activityType: raw.activityType?.trim() || undefined,
      defaultDurationMinutes: raw.defaultDurationMinutes ?? null,
      attributes: this.collectAttributes(this.templateAttributes),
    };
  }

  private buildActivityPayload(): ActivityDefinition {
    const raw = this.activityForm.getRawValue();
    return {
      id: (raw.id ?? '').trim(),
      label: (raw.label ?? '').trim(),
      activityType: (raw.activityType ?? '').trim(),
      templateId: raw.templateId ?? null,
      defaultDurationMinutes: raw.defaultDurationMinutes ?? null,
      relevantFor: raw.relevantFor ?? [],
      attributes: this.collectAttributes(this.activityAttributes),
    };
  }
}
