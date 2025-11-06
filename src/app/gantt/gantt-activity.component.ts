import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Activity } from '../models/activity';
import { DurationPipe } from '../shared/pipes/duration.pipe';
import { CdkDragEnd, CdkDragMove, CdkDragStart, DragDropModule } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-gantt-activity',
  standalone: true,
  imports: [CommonModule, MatTooltipModule, DurationPipe, DragDropModule],
  templateUrl: './gantt-activity.component.html',
  styleUrl: './gantt-activity.component.scss',
})
export class GanttActivityComponent {
  @Input({ required: true }) activity!: Activity;
  @Input({ required: true }) leftPx!: number;
  @Input({ required: true }) widthPx!: number;
  @Input() isSelected = false;
  @Input() classes: string[] = [];
  @Input() displayMode: 'block' | 'detail' = 'detail';
  @Input() displayTitle: string | null = null;
  @Input() showRouteDetails = false;
  @Input({ required: true }) dragData!: GanttActivityDragData;
  @Output() activitySelected = new EventEmitter<Activity>();
  @Output() toggleSelection = new EventEmitter<Activity>();
  @Output() dragStarted = new EventEmitter<CdkDragStart<GanttActivityDragData>>();
  @Output() dragMoved = new EventEmitter<CdkDragMove<GanttActivityDragData>>();
  @Output() dragEnded = new EventEmitter<CdkDragEnd<GanttActivityDragData>>();

  private isDragging = false;
  private dragSuppressUntil = 0;
  private readonly dragSuppressWindowMs = 1500;

  private readonly dateTime = new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  private readonly timeOnly = new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
  private readonly durationPipe = new DurationPipe();
  private readonly typeLabels: Record<string, string> = {
    'service-start': 'Dienstbeginn',
    'service-end': 'Dienstende',
    service: 'Dienstleistung',
    break: 'Pause',
    travel: 'Fahrt',
    transfer: 'Transfer',
    other: 'Sonstige',
  };
  get tooltipText(): string {
    if (!this.activity) {
      return '';
    }
    const lines: string[] = [];
    lines.push(this.effectiveTitle);
    lines.push(`Start: ${this.startLabel}`);
    if (this.activity.end) {
      lines.push(`Ende: ${this.endLabel}`);
    }
    if (this.activity.from) {
      lines.push(`Von: ${this.activity.from}`);
    }
    if (this.activity.to) {
      lines.push(`Nach: ${this.activity.to}`);
    }
    return lines.join('\n');
  }

  get hostClasses(): string[] {
    const classes = ['gantt-activity--service'];
    if (this.activity?.type) {
      classes.push(`gantt-activity--${this.activity.type}`);
    }
    if (this.displayMode === 'block') {
      classes.push('gantt-activity--block');
    }
    if (this.classes?.length) {
      classes.push(...this.classes);
    }
    if (this.isSelected) {
      classes.push('gantt-activity--selected');
    }
    if (this.widthPx < 80) {
      classes.push('gantt-activity--compact');
    }
    return classes;
  }

  get showTitle(): boolean {
    if (this.displayMode === 'block') {
      return false;
    }
    return this.widthPx >= 54;
  }

  get shouldShowRoute(): boolean {
    if (!this.showRouteDetails) {
      return false;
    }
    if (this.displayMode === 'block') {
      return false;
    }
    return this.widthPx >= 120 && !!(this.activity?.from || this.activity?.to);
  }

  get typeLabel(): string {
    if (!this.activity) {
      return '';
    }
    return this.typeLabels[this.activity.type ?? 'service'] ?? 'Aktivität';
  }

  get effectiveTitle(): string {
    const explicit = (this.displayTitle ?? '').trim();
    if (explicit) {
      return explicit;
    }
    return this.typeLabel;
  }

  get routeLabel(): string {
    if (!this.activity) {
      return '';
    }
    const from = this.activity.from ?? '—';
    const to = this.activity.to ?? '—';
    return `${from} → ${to}`;
  }

  get startLabel(): string {
    if (!this.activity) {
      return '';
    }
    return this.dateTime.format(new Date(this.activity.start));
  }

  get endLabel(): string {
    if (!this.activity?.end) {
      return '';
    }
    return this.dateTime.format(new Date(this.activity.end));
  }

  get shortStartLabel(): string {
    if (!this.activity) {
      return '';
    }
    return this.timeOnly.format(new Date(this.activity.start));
  }

  get shortEndLabel(): string {
    if (!this.activity?.end) {
      return '';
    }
    return this.timeOnly.format(new Date(this.activity.end));
  }

  get durationLabel(): string {
    if (!this.activity?.end) {
      return '—';
    }
    return this.durationPipe.transform(this.activity.start, this.activity.end);
  }

  get ariaLabel(): string {
    if (!this.activity) {
      return '';
    }
    return this.tooltipText.replace(/\n+/g, ', ');
  }

  protected handleClick(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    const hasModifier =
      event instanceof MouseEvent
        ? event.metaKey || event.ctrlKey || event.shiftKey
        : event instanceof KeyboardEvent
          ? event.ctrlKey || event.metaKey
          : false;
    if (hasModifier && this.activity) {
      this.toggleSelection.emit(this.activity);
    }
  }

  protected handleDoubleClick(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    if (this.shouldSuppressEdit()) {
      return;
    }
    if (this.activity) {
      this.activitySelected.emit(this.activity);
    }
  }

  protected onDragStarted(event: CdkDragStart<GanttActivityDragData>): void {
    this.isDragging = true;
    this.dragStarted.emit(event);
  }

  protected onDragMoved(event: CdkDragMove<GanttActivityDragData>): void {
    this.dragMoved.emit(event);
  }

  protected onDragEnded(event: CdkDragEnd<GanttActivityDragData>): void {
    this.isDragging = false;
    this.dragSuppressUntil = Date.now() + this.dragSuppressWindowMs;
    this.dragEnded.emit(event);
  }

  private shouldSuppressEdit(): boolean {
    if (this.isDragging) {
      return true;
    }
    if (this.dragSuppressUntil && Date.now() < this.dragSuppressUntil) {
      return true;
    }
    return false;
  }
}

export interface GanttActivityDragData {
  activity: Activity;
  resourceId: string;
  initialLeft: number;
  width: number;
}
