import { Component, Input, OnChanges, SimpleChanges, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import {
  MasterDataCategoryConfig,
  MasterDataHierarchyConfig,
} from '../../master-data.types';
import { MasterDataCategoryComponent } from '../master-data-category/master-data-category.component';

@Component({
  selector: 'app-master-data-hierarchy-section',
  standalone: true,
  imports: [CommonModule, MatIconModule, MasterDataCategoryComponent],
  templateUrl: './master-data-hierarchy-section.component.html',
  styleUrl: './master-data-hierarchy-section.component.scss',
})
export class MasterDataHierarchySectionComponent implements OnChanges {
  @Input({ required: true }) config!: MasterDataHierarchyConfig<any, any>;

  protected readonly parentItems = signal<any[]>([]);
  protected readonly childItems = signal<any[]>([]);
  protected readonly selectedParent = signal<any | null>(null);

  protected readonly parentConfigView = computed<MasterDataCategoryConfig<any> | null>(() => {
    if (!this.config) {
      return null;
    }

    return {
      ...this.config.parent,
      items: this.parentItems(),
    };
  });

  protected readonly childConfigView = computed<MasterDataCategoryConfig<any> | null>(() => {
    if (!this.config) {
      return null;
    }

    const parent = this.selectedParent();
    if (!parent) {
      return null;
    }

    const relationKey = this.config.relationKey;
    const baseChildConfig = this.config.child;
    const filteredChildren = this.childItems().filter(
      (child) => child && child[relationKey] === parent.id,
    );

    const existingDefaultValues = baseChildConfig.defaultValues ?? (() => ({}));

    return {
      ...baseChildConfig,
      items: filteredChildren,
      fields: baseChildConfig.fields.map((field) =>
        field.key === relationKey
          ? {
              ...field,
              readonly: true,
              hint: field.hint ?? 'Wird automatisch über den ausgewählten Pool gesetzt.',
            }
          : field,
      ),
      defaultValues: () => ({
        ...existingDefaultValues(),
        [relationKey]: parent.id,
      }),
      toFormValue: (item: any) => {
        const baseValue = baseChildConfig.toFormValue
          ? baseChildConfig.toFormValue(item)
          : item;
        return {
          ...baseValue,
          [relationKey]: baseValue?.[relationKey] ?? parent.id,
        };
      },
      fromFormValue: (value: Record<string, unknown>, previous?: any | null) => {
        const baseResult = baseChildConfig.fromFormValue
          ? baseChildConfig.fromFormValue(value, previous)
          : { ...(previous ?? {}), ...value };
        return {
          ...baseResult,
          [relationKey]: parent.id,
        };
      },
    };
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config'] && this.config) {
      this.parentItems.set(this.cloneItems(this.config.parent.items));
      this.childItems.set(this.cloneItems(this.config.child.items));
      const initialParent = this.config.parent.items[0] ?? null;
      this.selectedParent.set(initialParent ? { ...initialParent } : null);
    }
  }

  protected handleParentItemsChange(updated: any[]): void {
    this.parentItems.set(this.cloneItems(updated));
    const current = this.selectedParent();
    if (!current) {
      if (updated.length > 0) {
        this.selectedParent.set({ ...updated[0] });
      }
      return;
    }

    const match = updated.find((item) => item.id === current.id);
    if (match) {
      this.selectedParent.set({ ...match });
    } else {
      this.selectedParent.set(updated.length > 0 ? { ...updated[0] } : null);
    }
  }

  protected handleParentSelectionChange(selection: any | null): void {
    if (!selection) {
      this.selectedParent.set(null);
      return;
    }
    const match = this.parentItems().find((item) => item.id === selection.id);
    this.selectedParent.set(match ? { ...match } : { ...selection });
  }

  protected handleChildItemsChange(updated: any[]): void {
    const parent = this.selectedParent();
    if (!parent) {
      return;
    }

    const relationKey = this.config.relationKey;
    this.childItems.update((existing) => {
      const others = existing.filter((item) => item[relationKey] !== parent.id);
      return [...others, ...this.cloneItems(updated)];
    });

    if (this.config.parentRelationKey) {
      const parentRelationKey = this.config.parentRelationKey as string;
      const childIds = updated.map((child) => child.id);
      this.parentItems.update((parents) =>
        parents.map((item) =>
          item.id === parent.id ? { ...item, [parentRelationKey]: childIds } : item,
        ),
      );
      const refreshedParent =
        this.parentItems().find((item) => item.id === parent.id) ?? parent;
      this.selectedParent.set({ ...refreshedParent });
    }
  }

  protected parentSelectionLabel(): string {
    const parent = this.selectedParent();
    if (!parent) {
      return 'Kein Pool ausgewählt';
    }
    return `Pool ${parent.name ?? parent.title ?? parent.id}`;
  }

  private cloneItems(items: any[]): any[] {
    return items.map((item) => ({ ...item }));
  }
}
