import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GanttActivityComponent, GanttActivityDragData } from './gantt-activity.component';
import { Activity } from '../models/activity';
import { CdkDragMove, CdkDragStart, CdkDragEnd, DragDropModule } from '@angular/cdk/drag-drop';

export interface GanttBar {
  activity: Activity;
  left: number;
  width: number;
  classes?: string[];
  selected?: boolean;
  label?: string;
  showRoute?: boolean;
  dragDisabled?: boolean;
}

export interface GanttBackgroundSegment {
  left: number;
  width: number;
  cssClass: string;
}

export type GanttServiceRangeStatus = 'complete' | 'missing-start' | 'missing-end' | 'missing-both';

export interface GanttServiceRange {
  id: string;
  label: string;
  left: number;
  width: number;
  status: GanttServiceRangeStatus;
}

@Component({
  selector: 'app-gantt-timeline-row',
  standalone: true,
  imports: [CommonModule, GanttActivityComponent, DragDropModule],
  templateUrl: './gantt-timeline-row.component.html',
  styleUrl: './gantt-timeline-row.component.scss',
})
export class GanttTimelineRowComponent {
  @Input({ required: true }) bars: GanttBar[] = [];
  @Input({ required: true }) contentWidth = 0;
  @Input({ required: true }) resourceId!: string;
  @Input() backgroundSegments: GanttBackgroundSegment[] = [];
  @Input() serviceRanges: GanttServiceRange[] = [];
  @Input() nowMarkerLeft: number | null = null;
  @Input() zebra = false;
  @Input() viewMode: 'block' | 'detail' = 'detail';

  @Output() activitySelected = new EventEmitter<Activity>();
  @Output() activityToggleSelection = new EventEmitter<Activity>();
  @Output() activityDragStarted = new EventEmitter<CdkDragStart<GanttActivityDragData>>();
  @Output() activityDragMoved = new EventEmitter<CdkDragMove<GanttActivityDragData>>();
  @Output() activityDragEnded = new EventEmitter<CdkDragEnd<GanttActivityDragData>>();
}
