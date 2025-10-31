import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MasterDataCategoryConfig, MasterDataFieldConfig } from '../../master-data.types';

@Component({
  selector: 'app-master-data-category',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './master-data-category.component.html',
  styleUrl: './master-data-category.component.scss',
})
export class MasterDataCategoryComponent<T extends { id: string }> implements OnChanges {
  @Input({ required: true }) config!: MasterDataCategoryConfig<T>;
  @Output() readonly selectionChange = new EventEmitter<T | null>();
  @Output() readonly itemsChange = new EventEmitter<T[]>();

  protected readonly items = signal<T[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected form!: FormGroup;

  protected readonly displayedColumns = computed(() => [
    ...this.config.columns.map((column) => column.key),
    'actions',
  ]);

  protected readonly selectedItem = computed(() => {
    const id = this.selectedId();
    if (!id) {
      return null;
    }

    return this.items().find((item) => item.id === id) ?? null;
  });

  constructor(private readonly fb: FormBuilder) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config']) {
      this.items.set(this.cloneItems(this.config.items));
      this.buildForm();
      const firstId = this.config.items[0]?.id ?? null;
      this.selectedId.set(firstId);
      this.patchForm(firstId);
      this.emitItems();
      this.emitSelection();
    }
  }

  protected handleSelect(id: string): void {
    this.selectedId.set(id);
    this.patchForm(id);
    this.emitSelection();
  }

  protected handleCreate(): void {
    const pendingId = `tmp-${Date.now()}`;
    const emptyItem = this.createEmptyItem(pendingId);
    const defaults = this.config.defaultValues?.() ?? {};
    const newItem = { ...emptyItem, ...defaults, id: emptyItem.id } as T;
    this.items.update((current) => [...current, newItem]);
    this.selectedId.set(newItem.id);
    const formValue = this.config.toFormValue ? this.config.toFormValue(newItem) : newItem;
    this.form.reset(formValue);
    this.emitItems();
    this.emitSelection();
  }

  protected handleSave(): void {
    if (!this.form || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const rawValue = this.form.getRawValue() as Record<string, unknown>;
    const currentItem = this.selectedItem();
    const updated = this.config.fromFormValue
      ? this.config.fromFormValue(rawValue, currentItem)
      : ({ ...currentItem, ...rawValue } as T);

    this.items.update((current) =>
      current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
    );
    this.emitItems();
  }

  protected displayCell(row: T, columnKey: string): string {
    const column = this.config.columns.find((col) => col.key === columnKey);
    if (!column) {
      return '';
    }

    if (column.valueAccessor) {
      return column.valueAccessor(row);
    }

    const value = (row as Record<string, unknown>)[columnKey];
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    if (typeof value === 'boolean') {
      return value ? 'Ja' : 'Nein';
    }
    if (value == null) {
      return '—';
    }
    return String(value);
  }

  protected fieldOptions(field: MasterDataFieldConfig) {
    return field.options ?? [];
  }

  private buildForm(): void {
    const controls = this.config.fields.reduce<Record<string, unknown>>((acc, field) => {
      acc[field.key] = {
        value: field.type === 'multiselect' ? [] : '',
        disabled: field.readonly ?? false,
      };
      return acc;
    }, {});

    this.form = this.fb.group({
      id: [''],
      ...controls,
    });
  }

  private createEmptyItem(id: string): T {
    const empty = this.config.fields.reduce<Record<string, unknown>>((acc, field) => {
      acc[field.key] = field.type === 'multiselect' ? [] : '';
      return acc;
    }, {});

    return { id, ...empty } as T;
  }

  private cloneItems(items: T[]): T[] {
    return items.map((item) => ({ ...item }));
  }

  private patchForm(id: string | null): void {
    if (!id) {
      this.form.reset();
      return;
    }
    const item = this.items().find((entry) => entry.id === id);
    if (!item) {
      this.form.reset();
      return;
    }
    const formValue = this.config.toFormValue
      ? this.config.toFormValue(item)
      : (item as Record<string, unknown>);
    this.form.patchValue(formValue, { emitEvent: false });
  }

  private emitSelection(): void {
    this.selectionChange.emit(this.selectedItem());
  }

  private emitItems(): void {
    this.itemsChange.emit(this.items());
  }
}
