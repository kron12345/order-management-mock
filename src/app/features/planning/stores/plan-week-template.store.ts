import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, EMPTY, take, tap } from 'rxjs';
import {
  PlanWeekRolloutRequest,
  PlanWeekRolloutResponse,
  PlanWeekSlice,
  PlanWeekTemplate,
  PlanWeekValidity,
  PlanWeekActivity,
  WeekInstance,
} from '../../../models/planning-template';
import { PlanningTemplateApiService } from '../../../core/api/planning-template-api.service';

interface TemplateStoreState {
  templates: PlanWeekTemplate[];
  validities: Record<string, PlanWeekValidity[]>;
  activities: Record<string, PlanWeekActivity[]>;
  selectedTemplateId: string | null;
  weekInstances: WeekInstance[];
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: TemplateStoreState = {
  templates: [],
  validities: {},
  activities: {},
  selectedTemplateId: null,
  weekInstances: [],
  loading: false,
  error: null,
};

@Injectable({ providedIn: 'root' })
export class PlanWeekTemplateStoreService {
  private readonly api = inject(PlanningTemplateApiService);
  private readonly state = signal<TemplateStoreState>({ ...INITIAL_STATE });
  private templatesLoaded = false;
  private readonly activitiesRevisionSignal = signal(0);

  constructor() {
    this.loadTemplates();
  }

  readonly templates = computed(() => this.state().templates);
  readonly selectedTemplate = computed(() => {
    const current = this.state();
    return current.templates.find((entry) => entry.id === current.selectedTemplateId) ?? null;
  });
  readonly selectedValidities = computed(() => {
    const { selectedTemplateId, validities } = this.state();
    return selectedTemplateId ? validities[selectedTemplateId] ?? [] : [];
  });
  readonly selectedActivities = computed(() => {
    const { selectedTemplateId, activities } = this.state();
    return selectedTemplateId ? activities[selectedTemplateId] ?? [] : [];
  });
  readonly weekInstances = computed(() => this.state().weekInstances);
  readonly isLoading = computed(() => this.state().loading);
  readonly error = computed(() => this.state().error);
  readonly activitiesRevision = computed(() => this.activitiesRevisionSignal());

  loadTemplates(force = false): void {
    if (!force && (this.templatesLoaded || this.state().loading)) {
      return;
    }
    this.setState({ loading: true, error: null });
    this.api
      .listTemplates()
      .pipe(
        take(1),
        tap((templates) => {
          this.templatesLoaded = true;
          this.setState({ templates, loading: false });
          if (!this.state().selectedTemplateId && templates.length) {
            this.selectTemplate(templates[0].id);
          }
        }),
        catchError((error) => {
          console.error('[PlanWeekTemplateStore] Failed to load templates', error);
          this.setState({ loading: false, error: 'Vorlagen konnten nicht geladen werden.' });
          this.templatesLoaded = false;
          return EMPTY;
        }),
      )
      .subscribe();
  }

  selectTemplate(templateId: string | null): void {
    this.setState({ selectedTemplateId: templateId });
    if (templateId && !this.state().validities[templateId]) {
      this.loadValidities(templateId);
    }
    if (templateId && !this.state().activities[templateId]) {
      this.loadActivities(templateId);
    }
  }

  saveTemplate(template: PlanWeekTemplate): void {
    this.setState({ loading: true, error: null });
    this.api
      .upsertTemplate(template)
      .pipe(
        take(1),
        tap((saved) => {
          const templates = this.upsertById(this.state().templates, saved);
          this.setState({ templates, loading: false });
          this.selectTemplate(saved.id);
        }),
        catchError((error) => {
          console.error('[PlanWeekTemplateStore] Failed to save template', error);
          this.setState({ loading: false, error: 'Vorlage konnte nicht gespeichert werden.' });
          return EMPTY;
        }),
      )
      .subscribe();
  }

  deleteTemplate(templateId: string): void {
    this.setState({ loading: true, error: null });
    this.api
      .deleteTemplate(templateId)
      .pipe(
        take(1),
        tap(() => {
          const templates = this.state().templates.filter((entry) => entry.id !== templateId);
          const validities = { ...this.state().validities };
          const activities = { ...this.state().activities };
          delete validities[templateId];
          delete activities[templateId];
          const nextSelected = this.state().selectedTemplateId === templateId ? null : this.state().selectedTemplateId;
          this.setState({ templates, validities, activities, selectedTemplateId: nextSelected, loading: false });
        }),
        catchError((error) => {
          console.error('[PlanWeekTemplateStore] Failed to delete template', error);
          this.setState({ loading: false, error: 'Vorlage konnte nicht gelöscht werden.' });
          return EMPTY;
        }),
      )
      .subscribe();
  }

  loadValidities(templateId: string): void {
    this.api
      .listValidities(templateId)
      .pipe(
        take(1),
        tap((items) => {
          this.setState({ validities: { ...this.state().validities, [templateId]: items } });
        }),
        catchError((error) => {
          console.error('[PlanWeekTemplateStore] Failed to load validities', error);
          return EMPTY;
        }),
      )
      .subscribe();
  }

  saveValidity(templateId: string, validity: PlanWeekValidity): void {
    this.api
      .upsertValidity(templateId, validity)
      .pipe(
        take(1),
        tap((saved) => {
          const current = this.state().validities[templateId] ?? [];
          const next = this.upsertById(current, saved);
          this.setState({ validities: { ...this.state().validities, [templateId]: next } });
        }),
        catchError((error) => {
          console.error('[PlanWeekTemplateStore] Failed to save validity', error);
          return EMPTY;
        }),
      )
      .subscribe();
  }

  deleteValidity(templateId: string, validityId: string): void {
    this.api
      .deleteValidity(templateId, validityId)
      .pipe(
        take(1),
        tap(() => {
          const current = this.state().validities[templateId] ?? [];
          this.setState({
            validities: {
              ...this.state().validities,
              [templateId]: current.filter((entry) => entry.id !== validityId),
            },
          });
        }),
        catchError((error) => {
          console.error('[PlanWeekTemplateStore] Failed to delete validity', error);
          return EMPTY;
        }),
      )
      .subscribe();
  }

  updateTemplateSlices(templateId: string, slices: PlanWeekSlice[]): void {
    const template = this.state().templates.find((entry) => entry.id === templateId);
    if (!template) {
      return;
    }
    const payload: PlanWeekTemplate = {
      ...template,
      slices,
      updatedAtIso: new Date().toISOString(),
    };
    this.saveTemplate(payload);
  }

  rolloutTemplate(payload: PlanWeekRolloutRequest): void {
    this.setState({ loading: true, error: null });
    this.api
      .rolloutTemplate(payload)
      .pipe(
        take(1),
        tap(() => this.setState({ loading: false })),
        catchError((error) => {
          console.error('[PlanWeekTemplateStore] Failed to rollout template', error);
          this.setState({ loading: false, error: 'Rollout fehlgeschlagen.' });
          return EMPTY;
        }),
      )
      .subscribe();
  }

  loadWeekInstances(range: { fromIso: string; toIso: string }): void {
    this.setState({ loading: true, error: null });
    this.api
      .listWeekInstances(range)
      .pipe(
        take(1),
        tap((instances) => this.setState({ weekInstances: instances, loading: false })),
        catchError((error) => {
          console.error('[PlanWeekTemplateStore] Failed to load week instances', error);
          this.setState({ loading: false, error: 'Wochen konnten nicht geladen werden.' });
          return EMPTY;
        }),
      )
      .subscribe();
  }

  loadActivities(templateId: string): void {
    this.api
      .listActivities(templateId)
      .pipe(
        take(1),
        tap((items) => {
          const normalized = items.map((item) => this.normalizePlanWeekActivity(item));
          this.setState({ activities: { ...this.state().activities, [templateId]: normalized } });
          this.bumpActivitiesRevision();
        }),
        catchError((error) => {
          console.error('[PlanWeekTemplateStore] Failed to load activities', error);
          return EMPTY;
        }),
      )
      .subscribe();
  }

  saveActivity(templateId: string, activity: PlanWeekActivity): void {
    this.api
      .upsertActivity(templateId, activity)
      .pipe(
        take(1),
        tap((saved) => {
          const normalized = this.normalizePlanWeekActivity(saved);
          const current = this.state().activities[templateId] ?? [];
          const next = this.upsertById(current, normalized);
          this.setState({ activities: { ...this.state().activities, [templateId]: next } });
          this.bumpActivitiesRevision();
        }),
        catchError((error) => {
          console.error('[PlanWeekTemplateStore] Failed to save activity', error);
          return EMPTY;
        }),
      )
      .subscribe();
  }

  deleteActivity(templateId: string, activityId: string): void {
    this.api
      .deleteActivity(templateId, activityId)
      .pipe(
        take(1),
        tap(() => {
          const current = this.state().activities[templateId] ?? [];
          this.setState({
            activities: {
              ...this.state().activities,
              [templateId]: current.filter((entry) => entry.id !== activityId),
            },
          });
          this.bumpActivitiesRevision();
        }),
        catchError((error) => {
          console.error('[PlanWeekTemplateStore] Failed to delete activity', error);
          return EMPTY;
        }),
      )
      .subscribe();
  }

  private setState(patch: Partial<TemplateStoreState>): void {
    this.state.update((current) => ({ ...current, ...patch }));
  }

  private upsertById<T extends { id: string }>(items: T[], next: T): T[] {
    const index = items.findIndex((entry) => entry.id === next.id);
    if (index === -1) {
      return [...items, next];
    }
    const clone = [...items];
    clone.splice(index, 1, next);
    return clone;
  }

  private normalizePlanWeekActivity(activity: PlanWeekActivity): PlanWeekActivity {
    return {
      ...activity,
      participants: activity.participants?.map((participant) => ({ ...participant })) ?? [],
    };
  }

  private bumpActivitiesRevision(): void {
    this.activitiesRevisionSignal.update((value) => value + 1);
  }
}
