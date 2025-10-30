import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Resource } from '../models/resource';

@Component({
  selector: 'app-gantt-resources',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gantt-resources.component.html',
  styleUrl: './gantt-resources.component.scss',
})
export class GanttResourcesComponent {
  @Input({ required: true }) resource!: Resource;
}

