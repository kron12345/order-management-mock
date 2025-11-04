import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule, MatCalendar } from '@angular/material/datepicker';
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
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatCalendar,
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
  private readonly zoomLabelMap: Record<ZoomLevel, string> = {
    quarter: 'Quartal',
    '2month': '2 Monate',
    month: 'Monat',
    '2week': '2 Wochen',
    week: 'Woche',
    '3day': '3 Tage',
    day: 'Tag',
    '12hour': '12 Stunden',
    '6hour': '6 Stunden',
    '3hour': '3 Stunden',
    hour: '1 Stunde',
    '30min': '30 Minuten',
    '15min': '15 Minuten',
    '10min': '10 Minuten',
    '5min': '5 Minuten',
  };

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

  zoomLabel(level: ZoomLevel): string {
    return this.zoomLabelMap[level] ?? level;
  }
}
