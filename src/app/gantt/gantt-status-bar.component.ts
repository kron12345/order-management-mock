import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ZoomLevel } from '../models/time-scale';

@Component({
  selector: 'app-gantt-status-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gantt-status-bar.component.html',
  styleUrl: './gantt-status-bar.component.scss',
})
export class GanttStatusBarComponent {
  @Input({ required: true }) viewStart!: Date;
  @Input({ required: true }) viewEnd!: Date;
  @Input({ required: true }) zoomLevel!: ZoomLevel;
  @Input({ required: true }) resourceCount = 0;
  @Input({ required: true }) visibleResourceCount = 0;
  @Input({ required: true }) activityCount = 0;
  @Input({ required: true }) visibleActivityCount = 0;
  @Input() cursorTime: Date | null = null;

  private readonly dateRange = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  private readonly timeFormat = new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  get viewRangeLabel(): string {
    return `${this.dateRange.format(this.viewStart)} – ${this.dateRange.format(this.viewEnd)}`;
  }

  get cursorLabel(): string {
    if (!this.cursorTime) {
      return '—';
    }
    return this.timeFormat.format(this.cursorTime);
  }
}
