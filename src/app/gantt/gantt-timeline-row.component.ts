import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Activity } from '../models/activity';
import { GanttActivityComponent } from './gantt-activity.component';

export interface GanttBar {
  activity: Activity;
  left: number;
  width: number;
  classes?: string[];
}

export interface GanttBackgroundSegment {
  left: number;
  width: number;
  cssClass: string;
}

export interface GanttServiceRange {
  id: string;
  label: string;
  left: number;
  width: number;
}

@Component({
  selector: 'app-gantt-timeline-row',
  standalone: true,
  imports: [CommonModule, GanttActivityComponent],
  templateUrl: './gantt-timeline-row.component.html',
  styleUrl: './gantt-timeline-row.component.scss',
})
export class GanttTimelineRowComponent {
  @Input({ required: true }) bars: GanttBar[] = [];
  @Input({ required: true }) contentWidth = 0;
  @Input() backgroundSegments: GanttBackgroundSegment[] = [];
  @Input() serviceRanges: GanttServiceRange[] = [];
  @Input() nowMarkerLeft: number | null = null;
  @Input() zebra = false;
}
