import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  CustomAttributeDefinition,
  CustomAttributeInput,
  CustomAttributePrimitiveType,
  CustomAttributeService,
  CustomAttributeTarget,
} from '../../core/services/custom-attribute.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-custom-attribute-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDividerModule,
    MatCardModule,
  ],
  templateUrl: './custom-attribute-settings.component.html',
  styleUrl: './custom-attribute-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomAttributeSettingsComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly customAttributes = inject(CustomAttributeService);

  protected readonly targets = this.customAttributes.getTargets();
  protected readonly selectedTargetId = signal<string>(this.targets[0]?.id ?? '');
  protected readonly activeTarget = computed<CustomAttributeTarget | null>(() => {
    const id = this.selectedTargetId();
    return this.targets.find((target) => target.id === id) ?? null;
  });
  protected readonly definitions = computed<CustomAttributeDefinition[]>(() => {
    const map = this.customAttributes.definitions();
    const id = this.selectedTargetId();
    return map[id] ?? [];
  });
  protected readonly isDirty = this.customAttributes.isDirty;

  protected readonly newAttributeForm = this.fb.group({
    label: ['', [Validators.required, Validators.maxLength(64)]],
    key: ['', [Validators.required, Validators.maxLength(64)]],
    type: ['string' as CustomAttributePrimitiveType, Validators.required],
    description: [''],
  });

  protected readonly editForm = this.fb.group({
    label: ['', [Validators.required, Validators.maxLength(64)]],
    key: ['', [Validators.required, Validators.maxLength(64)]],
    type: ['string' as CustomAttributePrimitiveType, Validators.required],
    description: [''],
  });

  protected readonly editingId = signal<string | null>(null);

  private readonly autoKeyEffect = effect(() => {
    const label = this.newAttributeForm.controls.label.value ?? '';
    const keyControl = this.newAttributeForm.controls.key;
    if (keyControl.dirty) {
      return;
    }
    keyControl.setValue(this.slugify(label), { emitEvent: false });
  });

  private readonly editAutoKeyEffect = effect(() => {
    const id = this.editingId();
    if (!id) {
      return;
    }
    const label = this.editForm.controls.label.value ?? '';
    const keyControl = this.editForm.controls.key;
    if (keyControl.dirty) {
      return;
    }
    keyControl.setValue(this.slugify(label), { emitEvent: false });
  });

  ngOnDestroy(): void {
    this.autoKeyEffect.destroy();
    this.editAutoKeyEffect.destroy();
  }

  protected handleTargetChange(entityId: string): void {
    this.selectedTargetId.set(entityId);
    this.editingId.set(null);
    this.newAttributeForm.reset({
      label: '',
      key: '',
      type: 'string',
      description: '',
    });
  }

  protected startEdit(definition: CustomAttributeDefinition): void {
    this.editingId.set(definition.id);
    this.editForm.reset({
      label: definition.label,
      key: definition.key,
      type: definition.type,
      description: definition.description ?? '',
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.editForm.reset({
      label: '',
      key: '',
      type: 'string',
      description: '',
    });
  }

  protected saveEdit(): void {
    const id = this.editingId();
    if (!id || this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const entityId = this.selectedTargetId();
    const value = this.editForm.getRawValue();
    this.customAttributes.update(entityId, id, {
      label: value.label ?? '',
      key: value.key ?? '',
      type: value.type ?? 'string',
      description: value.description ?? '',
    });
    this.cancelEdit();
  }

  protected remove(definition: CustomAttributeDefinition): void {
    const entityId = this.selectedTargetId();
    this.customAttributes.remove(entityId, definition.id);
    if (this.editingId() === definition.id) {
      this.cancelEdit();
    }
  }

  protected create(): void {
    if (this.newAttributeForm.invalid) {
      this.newAttributeForm.markAllAsTouched();
      return;
    }

    const entityId = this.selectedTargetId();
    const value = this.newAttributeForm.getRawValue() as CustomAttributeInput;
    this.customAttributes.add(entityId, {
      label: value.label ?? '',
      key: value.key ?? '',
      type: value.type ?? 'string',
      description: value.description ?? '',
    });
    this.newAttributeForm.reset({
      label: '',
      key: '',
      type: 'string',
      description: '',
    });
  }

  protected trackById(_index: number, item: CustomAttributeDefinition): string {
    return item.id;
  }

  protected attributeTypeLabel(type: CustomAttributePrimitiveType): string {
    switch (type) {
      case 'boolean':
        return 'Ja/Nein';
      case 'number':
        return 'Zahl';
      case 'date':
        return 'Datum';
      case 'time':
        return 'Zeit';
      default:
        return 'Text';
    }
  }

  private slugify(value: string): string {
    return (value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }
}
