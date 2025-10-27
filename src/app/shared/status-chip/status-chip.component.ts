import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-status-chip',
  standalone: true,
  templateUrl: './status-chip.component.html',
  styleUrl: './status-chip.component.scss',
})
export class StatusChipComponent {
  @Input() status: 'open' | 'in_progress' | 'blocked' | 'done' = 'open';
}
