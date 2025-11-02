import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { Resource } from '../models/resource';

@Component({
  selector: 'app-gantt-resources',
  standalone: true,
  imports: [CommonModule, MatMenuModule, MatIconModule],
  templateUrl: './gantt-resources.component.html',
  styleUrl: './gantt-resources.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GanttResourcesComponent {
  @Input({ required: true }) resource!: Resource;
  @Output() remove = new EventEmitter<void>();

  protected onRemoveClick(): void {
    this.remove.emit();
  }

  protected resourceIcon(): string {
    const attributes = this.resource.attributes as Record<string, unknown> | undefined;
    const category = (attributes?.['category'] ?? null) as string | null;
    switch (category) {
      case 'vehicle-service':
        return 'route';
      case 'personnel-service':
        return 'badge';
      case 'vehicle':
        return 'directions_transit';
      case 'personnel':
        return 'groups';
      default:
        return 'inventory_2';
    }
  }
}
