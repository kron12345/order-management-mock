import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { FormsModule } from '@angular/forms';
import { ZoomLevel } from '../models/time-scale';

@Component({
  selector: 'app-gantt-menu',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
  ],
  templateUrl: './gantt-menu.component.html',
  styleUrl: './gantt-menu.component.scss',
})
export class GanttMenuComponent {
  @Input({ required: true }) zoomLevel!: ZoomLevel;
  @Input({ required: true }) zoomLevels: ZoomLevel[] = [];
  @Input({ required: true }) viewRangeLabel = '';
  @Input() filterText = '';

  @Output() zoomIn = new EventEmitter<void>();
  @Output() zoomOut = new EventEmitter<void>();
  @Output() zoomLevelChange = new EventEmitter<ZoomLevel>();
  @Output() gotoToday = new EventEmitter<void>();
  @Output() gotoDate = new EventEmitter<Date>();
  @Output() filterChange = new EventEmitter<string>();

  readonly today = new Date();

  onZoomLevelChange(level: ZoomLevel) {
    this.zoomLevelChange.emit(level);
  }

  onFilterChange(value: string) {
    this.filterChange.emit(value);
  }

  onDatePicked(value: Date | null) {
    if (!value) {
      return;
    }
    this.gotoDate.emit(value);
  }
}

