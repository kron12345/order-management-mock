import { Injectable, Signal, computed, signal } from '@angular/core';
import { ResourceKind } from '../../models/resource';

export type ActivityFieldKey = 'start' | 'end' | 'from' | 'to' | 'remark';

export interface ActivityTypeDefinition {
  id: string;
  label: string;
  description?: string;
  appliesTo: ResourceKind[];
  fields: ActivityFieldKey[];
  defaultDurationMinutes: number;
}

export interface ActivityTypeInput {
  id: string;
  label: string;
  description?: string;
  appliesTo: ResourceKind[];
  fields: ActivityFieldKey[];
  defaultDurationMinutes: number;
}

const STORAGE_KEY = 'activity-type-definitions.v1';

const DEFAULT_TYPES: ActivityTypeDefinition[] = [
  {
    id: 'service',
    label: 'Dienstleistung',
    description: 'Standardaktivität innerhalb eines Dienstes.',
    appliesTo: ['personnel', 'vehicle', 'personnel-service', 'vehicle-service'],
    fields: ['start', 'end', 'remark'],
    defaultDurationMinutes: 120,
  },
  {
    id: 'rest-day',
    label: 'Ruhetag',
    description: 'Ganztägiger Ruhetag ohne Ortsangaben.',
    appliesTo: ['personnel', 'personnel-service'],
    fields: ['start', 'end', 'remark'],
    defaultDurationMinutes: 24 * 60,
  },
  {
    id: 'vacation',
    label: 'Ferien',
    description: 'Urlaubszeitraum für Personalressourcen.',
    appliesTo: ['personnel', 'personnel-service'],
    fields: ['start', 'end', 'remark'],
    defaultDurationMinutes: 24 * 60,
  },
  {
    id: 'maintenance',
    label: 'Werkstattbuchung',
    description: 'Werkstattaufenthalt inkl. Ort und Zeitraum.',
    appliesTo: ['vehicle', 'vehicle-service'],
    fields: ['from', 'start', 'end', 'remark'],
    defaultDurationMinutes: 8 * 60,
  },
  {
    id: 'service-start',
    label: 'Dienstanfang',
    description: 'Startleistung mit exaktem Ort und Übergabe.',
    appliesTo: ['personnel', 'vehicle', 'personnel-service', 'vehicle-service'],
    fields: ['start', 'end', 'from', 'to', 'remark'],
    defaultDurationMinutes: 45,
  },
  {
    id: 'service-end',
    label: 'Dienstende',
    description: 'Abschlussleistung mit Ziel und Bemerkung.',
    appliesTo: ['personnel', 'vehicle', 'personnel-service', 'vehicle-service'],
    fields: ['start', 'end', 'from', 'to', 'remark'],
    defaultDurationMinutes: 45,
  },
  {
    id: 'break',
    label: 'Pause',
    description: 'Reguläre Pause innerhalb eines Dienstes.',
    appliesTo: ['personnel', 'vehicle', 'personnel-service', 'vehicle-service'],
    fields: ['start', 'end', 'remark'],
    defaultDurationMinutes: 30,
  },
  {
    id: 'standby',
    label: 'Bereitschaft',
    description: 'Bereitschaftszeit mit möglichen Ortsangaben.',
    appliesTo: ['personnel', 'vehicle', 'personnel-service', 'vehicle-service'],
    fields: ['start', 'end', 'from', 'remark'],
    defaultDurationMinutes: 60,
  },
  {
    id: 'commute',
    label: 'Wegezeit',
    description: 'An- oder Abreise zwischen Standorten.',
    appliesTo: ['personnel', 'vehicle', 'personnel-service', 'vehicle-service'],
    fields: ['start', 'end', 'from', 'to', 'remark'],
    defaultDurationMinutes: 45,
  },
  {
    id: 'shunting',
    label: 'Rangieren',
    description: 'Rangierbewegungen inkl. Quelle und Ziel.',
    appliesTo: ['vehicle', 'vehicle-service'],
    fields: ['start', 'end', 'from', 'to', 'remark'],
    defaultDurationMinutes: 60,
  },
  {
    id: 'transfer',
    label: 'Transfer',
    description: 'Überführung von Ressourcen zu einem anderen Ort.',
    appliesTo: ['personnel', 'vehicle', 'personnel-service', 'vehicle-service'],
    fields: ['start', 'end', 'from', 'to', 'remark'],
    defaultDurationMinutes: 90,
  },
  {
    id: 'travel',
    label: 'Fahrt',
    description: 'Geplante Fahrtleistung zwischen zwei Orten.',
    appliesTo: ['personnel', 'vehicle', 'personnel-service', 'vehicle-service'],
    fields: ['start', 'end', 'from', 'to', 'remark'],
    defaultDurationMinutes: 60,
  },
  {
    id: 'other',
    label: 'Sonstige',
    description: 'Freie Aktivität mit allen Angaben.',
    appliesTo: ['personnel', 'vehicle', 'personnel-service', 'vehicle-service'],
    fields: ['start', 'end', 'from', 'to', 'remark'],
    defaultDurationMinutes: 60,
  },
];

@Injectable({ providedIn: 'root' })
export class ActivityTypeService {
  private readonly definitionsSignal = signal<ActivityTypeDefinition[]>(this.load());

  readonly definitions: Signal<ActivityTypeDefinition[]> = computed(
    () => this.definitionsSignal(),
  );

  add(input: ActivityTypeInput): void {
    const normalized = this.normalizeDefinition(input);
    this.definitionsSignal.set([...this.definitionsSignal(), normalized]);
    this.persist();
  }

  update(id: string, patch: Partial<ActivityTypeInput>): void {
    this.definitionsSignal.set(
      this.definitionsSignal().map((definition) => {
        if (definition.id !== id) {
          return definition;
        }
        return this.normalizeDefinition({ ...definition, ...patch });
      }),
    );
    this.persist();
  }

  remove(id: string): void {
    this.definitionsSignal.set(this.definitionsSignal().filter((definition) => definition.id !== id));
    this.persist();
  }

  reset(): void {
    this.definitionsSignal.set(DEFAULT_TYPES);
    this.persist();
  }

  private normalizeDefinition(input: ActivityTypeInput): ActivityTypeDefinition {
    const fields = Array.from(
      new Set<ActivityFieldKey>(['start', 'end', ...input.fields.filter((field) => field !== 'start' && field !== 'end')]),
    );
    const allowedKinds: ResourceKind[] = ['personnel', 'vehicle', 'personnel-service', 'vehicle-service'];
    const appliesToRaw = input.appliesTo.length > 0 ? Array.from(new Set(input.appliesTo)) : ['personnel', 'vehicle'];
    let appliesTo = appliesToRaw.filter((kind): kind is ResourceKind => allowedKinds.includes(kind as ResourceKind));
    if (appliesTo.length === 0) {
      appliesTo = ['personnel', 'vehicle'];
    }
    return {
      id: this.slugify(input.id || input.label),
      label: input.label.trim(),
      description: input.description?.trim(),
      appliesTo,
      fields,
      defaultDurationMinutes: Math.max(1, Math.trunc(input.defaultDurationMinutes)),
    };
  }

  private load(): ActivityTypeDefinition[] {
    if (typeof window === 'undefined') {
      return DEFAULT_TYPES;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return DEFAULT_TYPES;
      }
      const parsed = JSON.parse(raw) as ActivityTypeDefinition[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return DEFAULT_TYPES;
      }
      return parsed.map((entry) => this.normalizeDefinition(entry));
    } catch {
      return DEFAULT_TYPES;
    }
  }

  private persist(): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.definitionsSignal()));
    } catch {
      // ignore storage errors
    }
  }

  private slugify(value: string): string {
    return (value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }
}
