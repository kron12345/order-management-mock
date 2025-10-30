import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { GanttComponent } from '../../gantt/gantt.component';
import { DEMO_RESOURCES } from '../../data/demo-resources';
import { DEMO_ACTIVITIES, DEMO_TIME_RANGE } from '../../data/demo-activities';

@Component({
  selector: 'app-planning-dashboard',
  standalone: true,
  imports: [CommonModule, MatIconModule, GanttComponent],
  templateUrl: './planning-dashboard.component.html',
  styleUrl: './planning-dashboard.component.scss',
})
export class PlanningDashboardComponent {
  readonly resources = DEMO_RESOURCES;
  readonly activities = DEMO_ACTIVITIES;
  readonly timelineRange = DEMO_TIME_RANGE;
}
