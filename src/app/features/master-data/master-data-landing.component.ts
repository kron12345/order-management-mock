import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

interface MasterDataSection {
  icon: string;
  title: string;
  description: string;
  actionLabel: string;
}

@Component({
  selector: 'app-master-data-landing',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule],
  templateUrl: './master-data-landing.component.html',
  styleUrl: './master-data-landing.component.scss',
})
export class MasterDataLandingComponent {
  readonly sections: MasterDataSection[] = [
    {
      icon: 'directions_transit',
      title: 'Fahrzeuge',
      description: 'Fuhrparkstammdaten, Laufleistungen und Wartungsfenster verwalten.',
      actionLabel: 'Fahrzeuge öffnen',
    },
    {
      icon: 'badge',
      title: 'Personal',
      description: 'Lokführer, Disponenten und externe Teams mit Qualifikationen pflegen.',
      actionLabel: 'Personal öffnen',
    },
    {
      icon: 'route',
      title: 'Strecken & Ressourcen',
      description: 'Streckennetze, Bahnhöfe und verfügbare Slots für die Planung vorbereiten.',
      actionLabel: 'Ressourcen öffnen',
    },
  ];
}
