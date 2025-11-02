export type PlanningStageId = 'base' | 'operations' | 'dispatch';

export type PlanningResourceCategory =
  | 'vehicle-service'
  | 'personnel-service'
  | 'vehicle'
  | 'personnel';

export interface PlanningStageMeta {
  id: PlanningStageId;
  label: string;
  shortLabel: string;
  description: string;
  focusHeadline: string;
  focusPoints: string[];
  contextHeadline: string;
  contextDetails: string[];
}

export const PLANNING_STAGE_METAS: PlanningStageMeta[] = [
  {
    id: 'base',
    label: 'Basisplanung',
    shortLabel: 'Basis',
    description:
      'Planwoche entwerfen und Standards für Fahrzeug- und Personaldienste festlegen. Grundlage für alle weiteren Schritte.',
    focusHeadline: 'Im Fokus dieser Phase',
    focusPoints: [
      'Fahrzeugdienste und Umläufe je Pool definieren',
      'Personaldienste strukturieren und zuweisen',
      'Planwoche als Blaupause absichern',
    ],
    contextHeadline: 'Rahmenbedingungen',
    contextDetails: [
      'Arbeit ausschließlich auf Fahrzeug- und Personaldienst-Pools',
      'Planungszeitraum ist eine repräsentative Woche',
      'Ergebnis dient als Vorlage für den Jahresausroll',
    ],
  },
  {
    id: 'operations',
    label: 'Betriebsplanung',
    shortLabel: 'Betrieb',
    description:
      'Die Planwoche wird über das Jahr ausgerollt. Dienste bleiben in ihren Pools, es kommen reale Fahrzeuge und Personale hinzu.',
    focusHeadline: 'Im Fokus dieser Phase',
    focusPoints: [
      'Planwoche auf Jahresfahrplan übertragen',
      'Fahrzeug- und Personaldienste auf Ressourcen abbilden',
      'Verfügbarkeiten und Leistungen (Ruhetage, Ferien) planen',
    ],
    contextHeadline: 'Rahmenbedingungen',
    contextDetails: [
      'Neue Dienste entstehen weiterhin in den Pools',
      'Pooldienste mit Fahrzeugen und Personal verknüpfen',
      'Leistungen und Abwesenheiten werden im Jahreskontext gepflegt',
    ],
  },
  {
    id: 'dispatch',
    label: 'Disposition',
    shortLabel: 'Disposition',
    description:
      'Tagesaktuelle Steuerung: Dienste und Leistungen liegen direkt auf den Ressourcen und werden dort fortgeschrieben.',
    focusHeadline: 'Im Fokus dieser Phase',
    focusPoints: [
      'Kurzfristige Anpassungen an Fahrzeug- und Personaleinsatz',
      'Direkte Bearbeitung von Diensten auf Ressourcenebene',
      'Abstimmung mit Leitstelle und Betriebsführung',
    ],
    contextHeadline: 'Rahmenbedingungen',
    contextDetails: [
      'Ressourcen stehen im Mittelpunkt, keine Pool-Arbeit mehr',
      'Leistungen werden unmittelbar auf den Ressourcen gepflegt',
      'Hohe Reaktionsgeschwindigkeit und Transparenz erforderlich',
    ],
  },
];
