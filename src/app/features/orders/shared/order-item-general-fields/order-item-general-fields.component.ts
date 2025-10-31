import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MATERIAL_IMPORTS } from '../../../../core/material.imports.imports';

export type OrderItemGeneralLabels = Record<'name' | 'responsible' | 'deviation', string>;

@Component({
  selector: 'app-order-item-general-fields',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS],
  templateUrl: './order-item-general-fields.component.html',
  styleUrl: './order-item-general-fields.component.scss',
})
export class OrderItemGeneralFieldsComponent {
  @Input({ required: true }) form!: FormGroup;
  @Input() nameControl = 'name';
  @Input() responsibleControl = 'responsible';
  @Input() deviationControl = 'deviation';
  @Input() labels: OrderItemGeneralLabels = {
    name: 'Name',
    responsible: 'Verantwortung',
    deviation: 'Abweichung',
  };
  @Input() hints: Partial<Record<'name' | 'responsible' | 'deviation', string>> = {};
  @Input() placeholders: Partial<Record<'name' | 'responsible' | 'deviation', string>> = {};

  label(key: 'name' | 'responsible' | 'deviation'): string {
    return this.labels[key];
  }

  placeholder(key: 'name' | 'responsible' | 'deviation'): string | undefined {
    return this.placeholders[key];
  }

  hasControl(controlName: string | null | undefined): boolean {
    if (!controlName) {
      return false;
    }
    return !!this.form.get(controlName);
  }
}
