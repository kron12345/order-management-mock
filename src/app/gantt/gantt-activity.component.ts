import { Component, Input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Activity } from '../models/activity';
import { DurationPipe } from '../shared/pipes/duration.pipe';

@Component({
  selector: 'app-gantt-activity',
  standalone: true,
  imports: [CommonModule, MatTooltipModule, DurationPipe],
  templateUrl: './gantt-activity.component.html',
  styleUrl: './gantt-activity.component.scss',
})
export class GanttActivityComponent {
  @Input({ required: true }) activity!: Activity;
  @Input({ required: true }) leftPx!: number;
  @Input({ required: true }) widthPx!: number;
  @Input() isSelected = false;
  @Input() classes: string[] = [];

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
  readonly tooltipText = computed(() => {
    if (!this.activity) {
      return '';
    }
    const lines: string[] = [];
    lines.push(`${this.typeLabel} • ${this.shortStartLabel} – ${this.shortEndLabel}`);
    lines.push(this.activity.title);
    if (this.activity.serviceId) {
      lines.push(`Dienst: ${this.activity.serviceId}`);
    }
    if (this.activity.from || this.activity.to) {
      lines.push(`Route: ${this.routeLabel}`);
    }
    lines.push(`Start: ${this.startLabel}`);
    lines.push(`Ende: ${this.endLabel}`);
    lines.push(`Dauer: ${this.durationLabel}`);
    return lines.join('\n');
  });

  get hostClasses(): string[] {
    const baseType = this.activity?.type ? `gantt-activity--${this.activity.type}` : 'gantt-activity--service';
    const classes = [baseType];
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
    return this.widthPx >= 54;
  }

  get showRoute(): boolean {
    return this.widthPx >= 120 && !!(this.activity?.from || this.activity?.to);
  }

  get typeLabel(): string {
    if (!this.activity) {
      return '';
    }
    return this.typeLabels[this.activity.type ?? 'service'] ?? 'Aktivität';
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
    if (!this.activity) {
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
    if (!this.activity) {
      return '';
    }
    return this.timeOnly.format(new Date(this.activity.end));
  }

  get durationLabel(): string {
    if (!this.activity) {
      return '';
    }
    return this.durationPipe.transform(this.activity.start, this.activity.end);
  }

  get ariaLabel(): string {
    if (!this.activity) {
      return '';
    }
    return this.tooltipText().replace(/\n+/g, ', ');
  }
}
