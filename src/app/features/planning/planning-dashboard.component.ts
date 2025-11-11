import { Component, Signal, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatExpansionModule } from '@angular/material/expansion';
import { FormsModule, ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { GanttComponent } from '../../gantt/gantt.component';
import { GanttWindowLauncherComponent } from './components/gantt-window-launcher.component';
import { PlanWeekTemplateComponent } from './components/plan-week-template.component';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { PlanningDataService, PlanningTimelineRange } from './planning-data.service';
import { Resource, ResourceKind } from '../../models/resource';
import { Activity, ServiceRole } from '../../models/activity';
import {
  ActivityFieldKey,
  ActivityTypeDefinition,
  ActivityTypeService,
  ActivityCategory,
} from '../../core/services/activity-type.service';
import {
  PLANNING_STAGE_METAS,
  PlanningResourceCategory,
  PlanningStageId,
  PlanningStageMeta,
} from './planning-stage.model';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TimetableYearService } from '../../core/services/timetable-year.service';
import { TimetableYearBounds } from '../../core/models/timetable-year.model';

interface PlanningBoard {
  id: string;
  title: string;
  resourceIds: string[];
  createdAt: number;
}

interface StageResourceGroupConfig {
  category: PlanningResourceCategory;
  label: string;
  description: string;
  icon: string;
}

interface ResourceGroupView extends StageResourceGroupConfig {
  resources: Resource[];
}

interface StageRuntimeState {
  boards: PlanningBoard[];
  selectedResourceIds: Set<string>;
  activeBoardId: string;
}

const STAGE_RESOURCE_GROUPS: Record<PlanningStageId, StageResourceGroupConfig[]> = {
  base: [
    {
      category: 'vehicle-service',
      label: 'Fahrzeugdienste',
      description: 'Umläufe und Fahrzeugdienste, die in den Pools der Planwoche entworfen werden.',
      icon: 'train',
    },
    {
      category: 'personnel-service',
      label: 'Personaldienste',
      description: 'Dienstfolgen für Fahr- und Begleitpersonal innerhalb der Planwoche.',
      icon: 'badge',
    },
  ],
  operations: [
    {
      category: 'vehicle-service',
      label: 'Fahrzeugdienste (Pool)',
      description: 'Standardisierte Dienste aus der Basisplanung als Grundlage für den Jahresausroll.',
      icon: 'train',
    },
    {
      category: 'personnel-service',
      label: 'Personaldienste (Pool)',
      description: 'Personaldienste aus der Basisplanung zur Verknüpfung mit Ressourcen.',
      icon: 'assignment_ind',
    },
    {
      category: 'vehicle',
      label: 'Fahrzeuge',
      description: 'Reale Fahrzeuge, die über das Jahr disponiert und mit Diensten verknüpft werden.',
      icon: 'directions_transit',
    },
    {
      category: 'personnel',
      label: 'Personal',
      description: 'Einsatzkräfte mit Verfügbarkeiten, Leistungen sowie Ruhetagen und Ferien.',
      icon: 'groups',
    },
  ],
  dispatch: [
    {
      category: 'vehicle',
      label: 'Fahrzeuge',
      description: 'Disposition der Fahrzeuge im Tagesgeschäft inklusive kurzfristiger Anpassungen.',
      icon: 'directions_transit',
    },
    {
      category: 'personnel',
      label: 'Personal',
      description: 'Direkte Bearbeitung von Diensten und Leistungen auf Personalressourcen.',
      icon: 'groups',
    },
  ],
};

const TYPE_PICKER_META: Array<{ id: ActivityCategory; label: string; icon: string }> = [
  { id: 'rest', label: 'Freitage', icon: 'beach_access' },
  { id: 'movement', label: 'Rangieren', icon: 'precision_manufacturing' },
  { id: 'service', label: 'Dienst & Pause', icon: 'schedule' },
  { id: 'other', label: 'Sonstige', icon: 'widgets' },
];

type ActivityTypePickerGroup = {
  id: ActivityCategory;
  label: string;
  icon: string;
  items: ActivityTypeDefinition[];
};

@Component({
  selector: 'app-planning-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatTabsModule,
    MatMenuModule,
    MatTooltipModule,
    MatCheckboxModule,
    MatChipsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    DragDropModule,
    GanttComponent,
    GanttWindowLauncherComponent,
    MatExpansionModule,
    PlanWeekTemplateComponent,
  ],
  templateUrl: './planning-dashboard.component.html',
  styleUrl: './planning-dashboard.component.scss',
})
export class PlanningDashboardComponent {
  private readonly data = inject(PlanningDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly timetableYearService = inject(TimetableYearService);
  private readonly managedTimetableYearBounds = this.timetableYearService.managedYearBoundsSignal();

  readonly stages = PLANNING_STAGE_METAS;
  private readonly stageMetaMap: Record<PlanningStageId, PlanningStageMeta> = this.stages.reduce(
    (record, stage) => {
      record[stage.id] = stage;
      return record;
    },
    {} as Record<PlanningStageId, PlanningStageMeta>,
  );

  private readonly stageOrder: PlanningStageId[] = this.stages.map((stage) => stage.id);

  private readonly stageResourceSignals: Record<PlanningStageId, Signal<Resource[]>> = {
    base: this.data.stageResources('base'),
    operations: this.data.stageResources('operations'),
    dispatch: this.data.stageResources('dispatch'),
  };

  private readonly stageActivitySignals: Record<PlanningStageId, Signal<Activity[]>> = {
    base: this.data.stageActivities('base'),
    operations: this.data.stageActivities('operations'),
    dispatch: this.data.stageActivities('dispatch'),
  };

  private readonly normalizedStageActivitySignals: Record<PlanningStageId, Signal<Activity[]>> = {
    base: computed(() => this.normalizeActivityList(this.stageActivitySignals.base())),
    operations: computed(() => this.normalizeActivityList(this.stageActivitySignals.operations())),
    dispatch: computed(() => this.normalizeActivityList(this.stageActivitySignals.dispatch())),
  };

  private readonly stageTimelineSignals = {
    base: this.data.stageTimelineRange('base'),
    operations: this.data.stageTimelineRange('operations'),
    dispatch: this.data.stageTimelineRange('dispatch'),
  } as const;

  private readonly stageStateSignal = signal<Record<PlanningStageId, StageRuntimeState>>({
    base: this.createEmptyStageState(),
    operations: this.createEmptyStageState(),
    dispatch: this.createEmptyStageState(),
  });

  private readonly activeStageSignal = signal<PlanningStageId>('base');

  private readonly boardCounters: Record<PlanningStageId, number> = {
    base: 1,
    operations: 1,
    dispatch: 1,
  };

  private readonly activityTypeService = inject(ActivityTypeService);

  private readonly resourceViewModeState = signal<Record<PlanningStageId, Record<string, 'block' | 'detail'>>>(
    {
      base: {},
      operations: {},
      dispatch: {},
    },
  );

  private readonly activityCreationToolSignal = signal<string>('');
  private readonly activityFormTypeSignal = signal<string>('');
  private readonly activityTypeMenuSelection = signal<ActivityCategory | null>(null);
  private readonly selectedActivityIdsSignal = signal<Set<string>>(new Set());
  private readonly activityMoveTargetSignal = signal<string>('');
  private readonly selectedActivityState = signal<{ activity: Activity; resource: Resource } | null>(null);
  private readonly pendingServiceResourceSignal = signal<Resource | null>(null);
  private readonly serviceAssignmentTargetSignal = signal<string | null>(null);
  private readonly stageYearSelectionState = signal<Record<PlanningStageId, Set<string>>>(
    this.createEmptyYearSelection(),
  );

  protected readonly activityForm = this.fb.group({
    start: [''],
    end: [''],
    type: [''],
    from: [''],
    to: [''],
    remark: [''],
  });

  constructor() {
    const initialStage = this.normalizeStageId(this.route.snapshot.queryParamMap.get('stage'));
    this.setActiveStage(initialStage, false);
    if (this.route.snapshot.queryParamMap.get('stage') !== initialStage) {
      this.updateStageQueryParam(initialStage);
    }

    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const stage = this.normalizeStageId(params.get('stage'));
        this.setActiveStage(stage, false);
      });

    this.stageOrder.forEach((stage) => {
      effect(
        () => {
          const resources = this.stageResourceSignals[stage]();
          this.ensureStageInitialized(stage, resources);
        },
        { allowSignalWrites: true },
      );

      const snapshot = this.stageResourceSignals[stage]();
      if (snapshot.length > 0) {
        this.ensureStageInitialized(stage, snapshot);
      }
    });

    this.activityForm.controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.activityFormTypeSignal.set(value ?? '');
    });

    this.activityForm.controls.type.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.activityFormTypeSignal.set(value ?? ''));

    effect(
      () => {
        const selection = this.selectedActivityState();
        if (!selection) {
          this.activityForm.reset({
            start: '',
            end: '',
            type: this.activityCreationToolSignal(),
            from: '',
            to: '',
            remark: '',
          });
          this.activityFormTypeSignal.set(this.activityCreationToolSignal());
          return;
        }
        this.activityForm.setValue({
          start: this.toLocalDateTime(selection.activity.start),
          end: selection.activity.end ? this.toLocalDateTime(selection.activity.end) : '',
          type: selection.activity.type ?? '',
          from: selection.activity.from ?? '',
          to: selection.activity.to ?? '',
          remark: selection.activity.remark ?? '',
        });
        this.activityFormTypeSignal.set(selection.activity.type ?? '');
        this.activityForm.markAsPristine();
      },
      { allowSignalWrites: true },
    );

    effect(
      () => {
        const defs = this.activityTypeDefinitions();
        if (defs.length === 0) {
          this.activityCreationToolSignal.set('');
          return;
        }
      const current = this.activityCreationToolSignal();
        if (!current || !defs.some((definition) => definition.id === current)) {
          this.activityCreationToolSignal.set(defs[0].id);
        }
      },
      { allowSignalWrites: true },
    );

    effect(
      () => {
        const stage = this.activeStageSignal();
        const activities = this.normalizedStageActivitySignals[stage]();
        const validIds = new Set(activities.map((activity) => activity.id));
        const currentSelection = this.selectedActivityIdsSignal();
        if (currentSelection.size === 0) {
        return;
        }
        const filtered = Array.from(currentSelection).filter((id) => validIds.has(id));
        if (filtered.length !== currentSelection.size) {
          this.selectedActivityIdsSignal.set(new Set(filtered));
        }
      },
      { allowSignalWrites: true },
    );

    effect(
      () => {
        const options = this.moveTargetOptions();
        const current = this.activityMoveTargetSignal();
        if (options.length === 0) {
          if (current) {
            this.activityMoveTargetSignal.set('');
        }
        return;
        }
        if (!current || !options.some((resource) => resource.id === current)) {
          this.activityMoveTargetSignal.set(options[0].id);
        }
      },
      { allowSignalWrites: true },
    );

    effect(
      () => {
        const groups = this.activityTypePickerGroups();
        if (!groups.length) {
          this.activityTypeMenuSelection.set(null);
          return;
        }
        const current = this.activityTypeMenuSelection();
        if (!current || !groups.some((group) => group.id === current)) {
          this.activityTypeMenuSelection.set(groups[0].id);
        }
      },
      { allowSignalWrites: true },
    );

    effect(
      () => {
        const options = this.timetableYearOptions();
        this.stageOrder.forEach((stage) => this.ensureStageYearSelection(stage, options));
      },
      { allowSignalWrites: true },
    );

    effect(
      () => {
        const typeId = this.activityFormTypeSignal();
        const definition = this.findActivityType(typeId);
        if (definition?.timeMode === 'point') {
          const control = this.activityForm.controls.end;
          if (control.value) {
            control.setValue('', { emitEvent: false });
            control.markAsPristine();
          }
        }
      },
      { allowSignalWrites: true },
    );
  }

  protected readonly activeStageId = computed(() => this.activeStageSignal());

  protected readonly activeStageMeta = computed(
    () => this.stageMetaMap[this.activeStageSignal()],
  );

  protected readonly resources = computed(() =>
    this.filterResourcesForStage(
      this.activeStageSignal(),
      this.stageResourceSignals[this.activeStageSignal()](),
    ),
  );

  protected readonly activities = computed(
    () => this.normalizedStageActivitySignals[this.activeStageSignal()](),
  );

  protected readonly timelineRange = computed(() =>
    this.computeTimelineRange(this.activeStageSignal()),
  );

  protected readonly resourceGroups = computed(() =>
    this.computeResourceGroups(this.activeStageSignal()),
  );

  protected readonly timetableYearOptions = computed<TimetableYearBounds[]>(() => {
    const managed = this.managedTimetableYearBounds();
    if (managed.length) {
      return managed;
    }
    return [this.timetableYearService.defaultYearBounds()];
  });

  protected readonly timetableYearSummary = computed(() =>
    this.formatTimetableYearSummary(this.activeStageSignal()),
  );

  protected readonly boards = computed(
    () => this.stageStateSignal()[this.activeStageSignal()].boards,
  );
  protected readonly activityTypeDefinitions = this.activityTypeService.definitions;
  protected readonly activityCreationOptions = this.activityTypeDefinitions;
  protected readonly activityTypeCandidates = computed(() => {
    const defs = this.activityTypeDefinitions();
    const selection = this.selectedActivityState();
    const resourceKind = selection?.resource.kind ?? null;
    if (!resourceKind) {
      return defs;
    }
    return defs.filter((definition) =>
      (definition.relevantFor ?? definition.appliesTo).includes(resourceKind),
    );
  });
  protected readonly activityTypePickerGroups = computed<ActivityTypePickerGroup[]>(() => {
    const definitions = this.activityTypeCandidates();
    if (!definitions.length) {
      return [];
    }
    const groups = TYPE_PICKER_META.map((meta) => ({
      id: meta.id,
      label: meta.label,
      icon: meta.icon,
      items: [] as ActivityTypeDefinition[],
    }));
    definitions.forEach((definition) => {
      const targetId = definition.category ?? 'other';
      const target =
        groups.find((group) => group.id === targetId) ??
        groups.find((group) => group.id === 'other') ??
        groups[0];
      target.items.push(definition);
    });
    return groups.filter((group) => group.items.length > 0).map((group) => ({
      id: group.id,
      label: group.label,
      icon: group.icon,
      items: [...group.items].sort((a, b) => a.label.localeCompare(b.label, 'de')),
    }));
  });

  protected readonly activityTypeMap = computed(() => {
    const map = new Map<string, ActivityTypeDefinition>();
    this.activityTypeDefinitions().forEach((definition) => map.set(definition.id, definition));
    return map;
  });

  protected readonly activityTypeInfoMap = computed(() => {
    const info: Record<string, { label: string; showRoute: boolean; serviceRole: ServiceRole | null }> = {};
    this.activityTypeDefinitions().forEach((definition) => {
      info[definition.id] = {
        label: definition.label,
        showRoute: definition.fields.includes('from') || definition.fields.includes('to'),
        serviceRole: null,
      };
    });
    return info;
  });

  protected readonly activeTypePickerGroup = computed<ActivityTypePickerGroup | null>(() => {
    const groups = this.activityTypePickerGroups();
    if (!groups.length) {
      return null;
    }
    const current = this.activityTypeMenuSelection();
    return groups.find((group) => group.id === current) ?? groups[0];
  });

  protected readonly resourceViewModes = computed(
    () => this.resourceViewModeState()[this.activeStageSignal()],
  );

  protected readonly activityCreationTool = computed(() => this.activityCreationToolSignal());

  protected readonly selectedActivity = computed(() => this.selectedActivityState());
  protected readonly selectedActivities = computed(() => this.computeSelectedActivities());
  protected readonly selectedActivityIdsArray = computed(() => Array.from(this.selectedActivityIdsSignal()));
  protected readonly moveTargetOptions = computed(() => this.computeMoveTargetOptions());
  protected readonly activityMoveTarget = computed(() => this.activityMoveTargetSignal());

  protected readonly selectedActivityDefinition = computed<ActivityTypeDefinition | null>(() => {
    const selection = this.selectedActivityState();
    if (!selection) {
      return null;
    }
    const typeOverride = this.activityFormTypeSignal();
    const typeId = (typeOverride || selection.activity.type) ?? null;
    return this.findActivityType(typeId);
  });

  protected readonly pendingServiceResource = computed(() => this.pendingServiceResourceSignal());

  protected readonly serviceAssignmentTarget = computed(() => this.serviceAssignmentTargetSignal());

  protected readonly assignmentCandidates = computed(() => this.computeAssignmentCandidates());

  protected readonly selectionSize = computed(
    () => this.stageStateSignal()[this.activeStageSignal()].selectedResourceIds.size,
  );

  protected readonly hasSelection = computed(() => this.selectionSize() > 0);

  protected readonly selectedResourceIds = computed(() =>
    this.normalizeResourceIds(
      Array.from(this.stageStateSignal()[this.activeStageSignal()].selectedResourceIds),
      this.activeStageSignal(),
    ),
  );

  protected readonly selectedBoardIndex = computed(() => {
    const stage = this.activeStageSignal();
    const state = this.stageStateSignal()[stage];
    return Math.max(0, state.boards.findIndex((board) => board.id === state.activeBoardId));
  });

  protected trackResource(_: number, resource: Resource): string {
    return resource.id;
  }

  protected trackBoard(_: number, board: PlanningBoard): string {
    return board.id;
  }

  protected trackFocus(_: number, focus: string): string {
    return focus;
  }

  protected trackActivityType(_: number, definition: ActivityTypeDefinition): string {
    return definition.id;
  }

  protected trackActivity(_: number, item: { activity: Activity; resource: Resource }): string {
    return item.activity.id;
  }

  protected activityTypeLabel(typeId: string | null | undefined): string {
    if (!typeId) {
      return 'Aktivität';
    }
    return this.activityTypeMap().get(typeId)?.label ?? 'Aktivität';
  }

  protected setActivityTypePickerGroup(groupId: ActivityTypePickerGroup['id']): void {
    if (!groupId || this.activityTypeMenuSelection() === groupId) {
      return;
    }
    this.activityTypeMenuSelection.set(groupId);
  }

  protected isActivityTypeSelected(typeId: string): boolean {
    return (this.activityForm.controls.type.value ?? '') === typeId;
  }

  protected selectActivityType(typeId: string): void {
    if (!typeId) {
      return;
    }
    this.activityForm.controls.type.setValue(typeId);
    this.activityForm.controls.type.markAsDirty();
    this.activityFormTypeSignal.set(typeId);
  }

  protected onStageChange(stage: PlanningStageId | null | undefined): void {
    if (!stage || !(stage in this.stageMetaMap)) {
      return;
    }
    const nextStage = stage as PlanningStageId;
    this.setActiveStage(nextStage, true);
  }

  protected onSelectionToggle(resourceId: string, selected: boolean): void {
    const stage = this.activeStageSignal();
    this.updateStageState(stage, (state) => {
      if (selected) {
        state.selectedResourceIds.add(resourceId);
      } else {
        state.selectedResourceIds.delete(resourceId);
      }
      return state;
    });
  }

  protected isResourceSelected(resourceId: string): boolean {
    return this.stageStateSignal()[this.activeStageSignal()].selectedResourceIds.has(resourceId);
  }

  protected clearSelection(): void {
    const stage = this.activeStageSignal();
    this.updateStageState(stage, (state) => {
      state.selectedResourceIds = new Set();
      return state;
    });
  }

  protected selectAllResources(): void {
    const stage = this.activeStageSignal();
    const resources = this.stageResourceSignals[stage]();
    this.updateStageState(stage, (state) => {
      state.selectedResourceIds = new Set(resources.map((resource) => resource.id));
      return state;
    });
  }

  protected setActivityCreationTool(tool: string): void {
    const options = this.activityTypeDefinitions();
    const next = options.some((definition) => definition.id === tool)
      ? tool
      : options[0]?.id ?? '';
    this.activityCreationToolSignal.set(next);
  }

  protected handleResourceViewModeChange(event: { resourceId: string; mode: 'block' | 'detail' }): void {
    const stage = this.activeStageSignal();
    const current = this.resourceViewModeState();
    const stageModes = { ...(current[stage] ?? {}), [event.resourceId]: event.mode };
    this.resourceViewModeState.set({
      ...current,
      [stage]: stageModes,
    });
  }

  protected handleActivityCreate(event: { resource: Resource; start: Date }): void {
    const stage = this.activeStageSignal();
    const definition = this.resolveActivityTypeForResource(
      event.resource,
      this.activityCreationToolSignal(),
    );
    if (!definition) {
      return;
    }
    const endDate =
      definition.timeMode === 'duration'
        ? new Date(event.start.getTime() + definition.defaultDurationMinutes * 60 * 1000)
        : null;
    const newActivity: Activity = {
      id: this.generateActivityId(definition.id),
      resourceId: event.resource.id,
      title: this.buildActivityTitle(definition),
      start: event.start.toISOString(),
      end: endDate ? endDate.toISOString() : null,
      type: definition.id,
      participantResourceIds: [event.resource.id],
      serviceCategory: this.resolveServiceCategory(event.resource),
    };
    if (this.definitionHasField(definition, 'from')) {
      newActivity.from = '';
    }
    if (this.definitionHasField(definition, 'to')) {
      newActivity.to = '';
    }
    if (this.definitionHasField(definition, 'remark')) {
      newActivity.remark = '';
    }
    const normalized = this.applyActivityTypeConstraints(newActivity);
    this.updateStageActivities(stage, (activities) => [...activities, normalized]);
    this.selectedActivityState.set({ activity: normalized, resource: event.resource });
  }

  protected handleActivityEdit(event: { resource: Resource; activity: Activity }): void {
    this.selectedActivityState.set({
      resource: event.resource,
      activity: this.applyActivityTypeConstraints(event.activity),
    });
  }

  protected handleActivitySelectionToggle(event: {
    resource: Resource;
    activity: Activity;
    selectionMode: 'set' | 'toggle';
  }): void {
    if (event.selectionMode === 'set') {
      const current = this.selectedActivityIdsSignal();
      if (current.size === 1 && current.has(event.activity.id)) {
        this.selectedActivityIdsSignal.set(new Set());
      } else {
        this.selectedActivityIdsSignal.set(new Set([event.activity.id]));
      }
      return;
    }
    this.selectedActivityIdsSignal.update((set) => {
      const next = new Set(set);
      if (next.has(event.activity.id)) {
        next.delete(event.activity.id);
      } else {
        next.add(event.activity.id);
      }
      return next;
    });
  }

  protected handleActivityReposition(event: {
    activity: Activity;
    targetResourceId: string;
    start: Date;
    end: Date | null;
  }): void {
    const stage = this.activeStageSignal();
    const targetId = event.targetResourceId;
    this.updateStageActivities(stage, (activities) =>
      activities.map((activity) => {
        if (activity.id !== event.activity.id) {
          return activity;
        }
        const participants = (activity.participantResourceIds ?? []).filter(
          (participant) => participant !== activity.resourceId && participant !== targetId,
        );
        participants.push(targetId);
        return {
          ...activity,
          resourceId: targetId,
          start: event.start.toISOString(),
          end: event.end ? event.end.toISOString() : null,
          participantResourceIds: participants,
        };
      }),
    );
    const activeSelection = this.selectedActivityState();
    if (activeSelection?.activity.id === event.activity.id) {
      const resource =
        this.stageResourceSignals[stage]().find((res) => res.id === targetId) ??
        activeSelection.resource;
      const updatedSelectionActivity = this.applyActivityTypeConstraints({
        ...activeSelection.activity,
        resourceId: targetId,
        start: event.start.toISOString(),
        end: event.end ? event.end.toISOString() : null,
      });
      this.selectedActivityState.set({
        activity: updatedSelectionActivity,
        resource,
      });
    }
  }

  protected clearActivitySelection(): void {
    this.selectedActivityIdsSignal.set(new Set());
    this.activityMoveTargetSignal.set('');
  }

  protected clearSelectedActivity(): void {
    this.selectedActivityState.set(null);
  }

  protected saveSelectedActivityEdits(): void {
    const selection = this.selectedActivityState();
    if (!selection || this.activityForm.invalid) {
      return;
    }
    const value = this.activityForm.getRawValue();
    const startDate = value.start ? this.fromLocalDateTime(value.start) : null;
    if (!startDate) {
      return;
    }
    const desiredType =
      value.type && value.type.length > 0 ? value.type : (selection.activity.type ?? '');
    const definition =
      this.findActivityType(desiredType) ?? this.findActivityType(selection.activity.type ?? null);
    const isPoint = definition?.timeMode === 'point';
    const endDateRaw = !isPoint && value.end ? this.fromLocalDateTime(value.end) : null;
    const endDateValid = endDateRaw && endDateRaw.getTime() > startDate.getTime() ? endDateRaw : null;
    const updated: Activity = {
      ...selection.activity,
      title: this.buildActivityTitle(definition ?? null),
      start: startDate.toISOString(),
      end: endDateValid ? endDateValid.toISOString() : null,
      type: (desiredType || selection.activity.type) ?? '',
    };
    if (definition) {
      if (this.definitionHasField(definition, 'from')) {
        updated.from = value.from ?? '';
      } else {
        updated.from = undefined;
      }
      if (this.definitionHasField(definition, 'to')) {
        updated.to = value.to ?? '';
      } else {
        updated.to = undefined;
      }
      if (this.definitionHasField(definition, 'remark')) {
        updated.remark = value.remark ?? '';
      } else {
        updated.remark = undefined;
      }
    }
    this.replaceActivity(this.applyActivityTypeConstraints(updated));
  }

  protected deleteSelectedActivity(): void {
    const selection = this.selectedActivityState();
    if (!selection) {
      return;
    }
    const stage = this.activeStageSignal();
    this.updateStageActivities(stage, (activities) =>
      activities.filter((activity) => activity.id !== selection.activity.id),
    );
    this.selectedActivityState.set(null);
  }

  protected handleServiceAssignRequest(resource: Resource): void {
    this.pendingServiceResourceSignal.set(resource);
    const candidates = this.computeAssignmentCandidatesFor(resource);
    this.serviceAssignmentTargetSignal.set(candidates[0]?.id ?? null);
  }

  protected setServiceAssignmentTarget(resourceId: string | null): void {
    this.serviceAssignmentTargetSignal.set(resourceId);
  }

  protected confirmServiceAssignment(): void {
    const serviceResource = this.pendingServiceResourceSignal();
    const targetResourceId = this.serviceAssignmentTargetSignal();
    if (!serviceResource || !targetResourceId) {
      return;
    }
    const stage = this.activeStageSignal();
    this.data.updateStageData(stage, (stageData) => {
      const existing = stageData.activities;
      const serviceActivities = existing.filter((activity) => activity.resourceId === serviceResource.id);
      const updatedExisting = existing.map((activity) => {
        if (activity.resourceId !== serviceResource.id) {
          return activity;
        }
        return {
          ...activity,
          participantResourceIds: this.mergeParticipants(activity.participantResourceIds, [
            serviceResource.id,
            targetResourceId,
          ]),
        };
      });
      const additions: Activity[] = [];
      serviceActivities.forEach((activity) => {
        const duplicate = existing.some(
          (entry) => entry.resourceId === targetResourceId && entry.serviceId === activity.serviceId,
        );
        if (!duplicate) {
          additions.push({
            ...activity,
            id: this.generateActivityId('assign'),
            resourceId: targetResourceId,
            participantResourceIds: this.mergeParticipants(activity.participantResourceIds, [
              serviceResource.id,
              targetResourceId,
            ]),
          });
        }
      });
      return {
        ...stageData,
        activities: [...updatedExisting, ...additions],
      };
    });
    this.pendingServiceResourceSignal.set(null);
    this.serviceAssignmentTargetSignal.set(null);
  }

  protected cancelServiceAssignment(): void {
    this.pendingServiceResourceSignal.set(null);
    this.serviceAssignmentTargetSignal.set(null);
  }

  protected setMoveSelectionTarget(resourceId: string | null): void {
    this.activityMoveTargetSignal.set(resourceId ?? '');
  }

  protected moveSelectionToTarget(): void {
    const targetId = this.activityMoveTargetSignal();
    if (!targetId) {
      return;
    }
    const stage = this.activeStageSignal();
    const targetResource = this.stageResourceSignals[stage]().find(
      (resource) => resource.id === targetId,
    );
    if (!targetResource) {
      return;
    }
    const selectionIds = this.selectedActivityIdsSignal();
    if (selectionIds.size === 0) {
      return;
    }
    const idsToMove = new Set(selectionIds);
    this.updateStageActivities(stage, (activities) =>
      activities.map((activity) => {
        if (!idsToMove.has(activity.id)) {
          return activity;
        }
        const participants = (activity.participantResourceIds ?? []).filter(
          (participant) => participant !== activity.resourceId && participant !== targetId,
        );
        participants.push(targetId);
        return {
          ...activity,
          resourceId: targetId,
          participantResourceIds: participants,
        };
      }),
    );
    const activeSelection = this.selectedActivityState();
    if (activeSelection && idsToMove.has(activeSelection.activity.id)) {
      this.selectedActivityState.set({
        activity: this.applyActivityTypeConstraints({
          ...activeSelection.activity,
          resourceId: targetResource.id,
        }),
        resource: targetResource,
      });
    }
  }

  protected shiftSelectedActivityBy(deltaMinutes: number): void {
    const selected = this.selectedActivities();
    if (selected.length !== 1) {
      return;
    }
    const { activity } = selected[0];
    const deltaMs = deltaMinutes * 60 * 1000;
    const start = new Date(activity.start).getTime() + deltaMs;
    const definition = this.findActivityType(activity.type ?? null);
    const end =
      definition?.timeMode === 'point' || !activity.end
        ? null
        : new Date(activity.end).getTime() + deltaMs;
    const updated: Activity = {
      ...activity,
      start: new Date(start).toISOString(),
      end: end ? new Date(end).toISOString() : null,
    };
    this.replaceActivity(this.applyActivityTypeConstraints(updated));
  }

  protected addParticipantsToActiveBoard(): void {
    const participantIds = this.selectedActivityParticipantIds();
    if (participantIds.length === 0) {
      return;
    }
    const stage = this.activeStageSignal();
    const state = this.stageStateSignal()[stage];
    if (!state.activeBoardId) {
      return;
    }
    this.updateBoard(stage, state.activeBoardId, (resourceIds) =>
      this.normalizeResourceIds([...resourceIds, ...participantIds], stage),
    );
  }

  protected openBoardForParticipants(): void {
    const participantIds = this.selectedActivityParticipantIds();
    if (participantIds.length === 0) {
      return;
    }
    const stage = this.activeStageSignal();
    const board = this.createBoardState(stage, this.nextBoardTitle(stage, 'Dienst'), participantIds);
    this.updateStageState(stage, (state) => {
      state.boards.push(board);
      state.activeBoardId = board.id;
      return state;
    });
  }

  private updateStageActivities(
    stage: PlanningStageId,
    updater: (activities: Activity[]) => Activity[],
  ): void {
    this.data.updateStageData(stage, (stageData) => {
      const next = updater([...stageData.activities]);
      return {
        ...stageData,
        activities: this.normalizeActivityList(next),
      };
    });
  }

  private replaceActivity(updated: Activity): void {
    const stage = this.activeStageSignal();
    this.updateStageActivities(stage, (activities) =>
      activities.map((activity) => (activity.id === updated.id ? updated : activity)),
    );
    const resource =
      this.stageResourceSignals[stage]().find((entry) => entry.id === updated.resourceId) ??
      this.selectedActivityState()?.resource ??
      null;
    if (resource) {
      this.selectedActivityState.set({
        activity: this.applyActivityTypeConstraints(updated),
        resource,
      });
    } else {
      this.selectedActivityState.set(null);
    }
  }

  private generateActivityId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private buildActivityTitle(definition: ActivityTypeDefinition | null): string {
    return definition?.label ?? 'Aktivität';
  }

  private computeSelectedActivities(): { activity: Activity; resource: Resource }[] {
    const selection = this.selectedActivityIdsSignal();
    if (selection.size === 0) {
      return [];
    }
    const stage = this.activeStageSignal();
    const activities = this.normalizedStageActivitySignals[stage]();
    const resources = this.stageResourceSignals[stage]();
    const activityMap = new Map(activities.map((activity) => [activity.id, activity]));
    const resourceMap = new Map(resources.map((resource) => [resource.id, resource]));
    const result: { activity: Activity; resource: Resource }[] = [];
    selection.forEach((id) => {
      const activity = activityMap.get(id);
      if (!activity) {
        return;
      }
      const resource = resourceMap.get(activity.resourceId);
      if (!resource) {
        return;
      }
      result.push({ activity, resource });
    });
    return result;
  }

  private computeMoveTargetOptions(): Resource[] {
    const selected = this.selectedActivities();
    if (selected.length === 0) {
      return [];
    }
    const baseKind = selected[0].resource.kind;
    const isHomogeneous = selected.every((item) => item.resource.kind === baseKind);
    if (!isHomogeneous) {
      return [];
    }
    const stage = this.activeStageSignal();
    return this.stageResourceSignals[stage]().filter((resource) => resource.kind === baseKind);
  }

  private resolveServiceCategory(
    resource: Resource,
  ): 'personnel-service' | 'vehicle-service' | undefined {
    if (resource.kind === 'personnel' || resource.kind === 'personnel-service') {
      return 'personnel-service';
    }
    if (resource.kind === 'vehicle' || resource.kind === 'vehicle-service') {
      return 'vehicle-service';
    }
    return undefined;
  }

  private selectedActivityParticipantIds(): string[] {
    const selection = this.selectedActivityState();
    if (!selection) {
      return [];
    }
    return this.mergeParticipants(selection.activity.participantResourceIds, [
      selection.activity.resourceId,
    ]);
  }

  private findActivityType(id: string | null | undefined): ActivityTypeDefinition | null {
    if (!id) {
      return null;
    }
    return this.activityTypeDefinitions().find((definition) => definition.id === id) ?? null;
  }

  private definitionAppliesToResource(definition: ActivityTypeDefinition, resource: Resource): boolean {
    return (definition.relevantFor ?? definition.appliesTo).includes(resource.kind);
  }

  private resolveActivityTypeForResource(
    resource: Resource,
    requestedId: string | null | undefined,
  ): ActivityTypeDefinition | null {
    const definitions = this.activityTypeDefinitions();
    if (requestedId) {
      const requested = definitions.find(
        (definition) => definition.id === requestedId && this.definitionAppliesToResource(definition, resource),
      );
      if (requested) {
        return requested;
      }
    }
    return definitions.find((definition) => this.definitionAppliesToResource(definition, resource)) ?? null;
  }

  protected definitionHasField(
    definition: ActivityTypeDefinition | null,
    field: ActivityFieldKey,
  ): boolean {
    if (field === 'start' || field === 'end') {
      return true;
    }
    if (!definition) {
      return false;
    }
    return definition.fields.includes(field);
  }

  protected shouldShowEndField(definition: ActivityTypeDefinition | null): boolean {
    if (!definition) {
      return true;
    }
    return definition.timeMode !== 'point';
  }

  private normalizeActivityList(list: Activity[]): Activity[] {
    if (!list.length) {
      return list;
    }
    let mutated = false;
    const normalized = list.map((activity) => {
      const next = this.applyActivityTypeConstraints(activity);
      if (next !== activity) {
        mutated = true;
      }
      return next;
    });
    return mutated ? normalized : list;
  }

  private applyActivityTypeConstraints(activity: Activity): Activity {
    const definition = this.activityTypeMap().get(activity.type ?? '');
    if (!definition) {
      return activity;
    }
    if (definition.timeMode === 'point' && activity.end) {
      if (activity.end === null) {
        return activity;
      }
      return { ...activity, end: null };
    }
    return activity;
  }

  private mergeParticipants(
    existing: string[] | undefined,
    extras: (string | undefined | null)[],
  ): string[] {
    const set = new Set(existing ?? []);
    extras.filter((value): value is string => !!value).forEach((value) => set.add(value));
    return Array.from(set);
  }

  private computeAssignmentCandidatesFor(resource: Resource): Resource[] {
    const stage = this.activeStageSignal();
    const resources = this.stageResourceSignals[stage]();
    if (resource.kind === 'personnel-service') {
      return resources.filter((entry) => entry.kind === 'personnel');
    }
    if (resource.kind === 'vehicle-service') {
      return resources.filter((entry) => entry.kind === 'vehicle');
    }
    return [];
  }

  private computeAssignmentCandidates(): Resource[] {
    const pending = this.pendingServiceResourceSignal();
    if (!pending) {
      return [];
    }
    return this.computeAssignmentCandidatesFor(pending);
  }

  private toLocalDateTime(iso: string): string {
    if (!iso) {
      return '';
    }
    const date = new Date(iso);
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 16);
  }

  private fromLocalDateTime(value: string): Date | null {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  protected createBoardFromSelection(): void {
    const stage = this.activeStageSignal();
    const selection = this.selectedResourceIds();
    const resources = this.stageResourceSignals[stage]();
    const resourceIds =
      selection.length > 0 ? selection : resources.map((resource) => resource.id);
    const board = this.createBoardState(stage, this.nextBoardTitle(stage), resourceIds);

    this.updateStageState(stage, (state) => {
      state.boards.push(board);
      state.activeBoardId = board.id;
      return state;
    });
  }

  protected addSelectionToBoard(boardId: string): void {
    if (!this.hasSelection()) {
      return;
    }
    const stage = this.activeStageSignal();
    const selection = this.selectedResourceIds();
    this.updateBoard(stage, boardId, (resourceIds) =>
      this.normalizeResourceIds([...resourceIds, ...selection], stage),
    );
  }

  protected replaceBoardWithSelection(boardId: string): void {
    if (!this.hasSelection()) {
      return;
    }
    const stage = this.activeStageSignal();
    const selection = this.selectedResourceIds();
    this.updateBoard(stage, boardId, () => this.normalizeResourceIds(selection, stage));
  }

  protected setSelectionFromBoard(boardId: string): void {
    const stage = this.activeStageSignal();
    const board = this.stageStateSignal()[stage].boards.find((entry) => entry.id === boardId);
    if (!board) {
      return;
    }
    this.updateStageState(stage, (state) => {
      state.selectedResourceIds = new Set(board.resourceIds);
      return state;
    });
  }

  protected removeBoard(boardId: string): void {
    const stage = this.activeStageSignal();
    const state = this.stageStateSignal()[stage];
    if (state.boards.length <= 1) {
      return;
    }
    this.updateStageState(stage, (nextState) => {
      const index = nextState.boards.findIndex((board) => board.id === boardId);
      if (index === -1) {
        return nextState;
      }
      nextState.boards.splice(index, 1);
      if (nextState.activeBoardId === boardId) {
        const fallback = nextState.boards[Math.max(0, Math.min(index, nextState.boards.length - 1))];
        nextState.activeBoardId = fallback?.id ?? '';
      }
      return nextState;
    });
  }

  protected removeResourceFromBoard(boardId: string, resourceId: string): void {
    const stage = this.activeStageSignal();
    this.updateBoard(stage, boardId, (resourceIds) =>
      resourceIds.filter((id) => id !== resourceId),
    );
  }

  protected handleBoardIndexChange(index: number): void {
    const stage = this.activeStageSignal();
    const board = this.stageStateSignal()[stage].boards[index];
    if (!board) {
      return;
    }
    this.updateStageState(stage, (state) => {
      state.activeBoardId = board.id;
      return state;
    });
  }

  protected boardResources(board: PlanningBoard): Resource[] {
    const stage = this.activeStageSignal();
    const resourceSet = new Set(board.resourceIds);
    return this.filterResourcesForStage(stage, this.stageResourceSignals[stage]()).filter(
      (resource) => resourceSet.has(resource.id),
    );
  }

  protected boardActivities(board: PlanningBoard): Activity[] {
    const stage = this.activeStageSignal();
    const resourceSet = new Set(board.resourceIds);
    return this.normalizedStageActivitySignals[stage]().filter((activity) =>
      resourceSet.has(activity.resourceId),
    );
  }

  protected isActiveBoard(boardId: string): boolean {
    const stage = this.activeStageSignal();
    return this.stageStateSignal()[stage].activeBoardId === boardId;
  }

  protected isTimetableYearSelected(label: string): boolean {
    const stage = this.activeStageSignal();
    return this.stageYearSelectionState()[stage]?.has(label) ?? false;
  }

  protected onTimetableYearToggle(label: string, checked: boolean): void {
    const stage = this.activeStageSignal();
    this.updateStageYearSelection(stage, (current, options) => {
      const next = new Set(current);
      if (checked) {
        next.add(label);
      } else {
        if (next.size <= 1) {
          return current;
        }
        next.delete(label);
      }
      if (next.size === 0 && options.length) {
        next.add(this.preferredYearLabel(options));
      }
      return next;
    });
  }

  protected selectDefaultTimetableYear(): void {
    const stage = this.activeStageSignal();
    this.updateStageYearSelection(stage, (_current, options) => {
      if (!options.length) {
        return _current;
      }
      return new Set([this.preferredYearLabel(options)]);
    });
  }

  protected selectAllTimetableYears(): void {
    const stage = this.activeStageSignal();
    this.updateStageYearSelection(stage, (_current, options) => {
      if (!options.length) {
        return _current;
      }
      return new Set(options.map((year) => year.label));
    });
  }

  private computeResourceGroups(stage: PlanningStageId): ResourceGroupView[] {
    const resources = this.filterResourcesForStage(stage, this.stageResourceSignals[stage]());
    const configs = STAGE_RESOURCE_GROUPS[stage];
    return configs
      .map((config) => {
        const items = resources.filter(
          (resource) => this.getResourceCategory(resource) === config.category,
        );
        if (items.length === 0) {
          return null;
        }
        return {
          ...config,
          resources: items,
        };
      })
      .filter((group): group is ResourceGroupView => !!group);
  }

  private getResourceCategory(resource: Resource): PlanningResourceCategory | null {
    const attributes = resource.attributes as Record<string, unknown> | undefined;
    const category = (attributes?.['category'] ?? null) as string | null;
    if (this.isPlanningResourceCategory(category)) {
      return category;
    }
    if (this.isPlanningResourceCategory(resource.kind)) {
      return resource.kind;
    }
    return null;
  }

  private isPlanningResourceCategory(
    value: string | null | undefined,
  ): value is PlanningResourceCategory {
    return (
      value === 'vehicle-service' ||
      value === 'personnel-service' ||
      value === 'vehicle' ||
      value === 'personnel'
    );
  }

  private updateStageState(
    stage: PlanningStageId,
    reducer: (state: StageRuntimeState) => StageRuntimeState,
  ): void {
    const current = this.stageStateSignal();
    const nextStageState = reducer(this.cloneStageState(current[stage]));
    this.stageStateSignal.set({
      ...current,
      [stage]: nextStageState,
    });
  }

  private updateBoard(
    stage: PlanningStageId,
    boardId: string,
    updater: (resourceIds: string[]) => string[],
  ): void {
    this.updateStageState(stage, (state) => {
      const index = state.boards.findIndex((board) => board.id === boardId);
      if (index === -1) {
        return state;
      }
      const target = state.boards[index];
      const updatedIds = updater([...target.resourceIds]);
      state.boards.splice(index, 1, {
        ...target,
        resourceIds: this.normalizeResourceIds(updatedIds, stage),
      });
      return state;
    });
  }

  private createEmptyStageState(): StageRuntimeState {
    return {
      boards: [],
      selectedResourceIds: new Set(),
      activeBoardId: '',
    };
  }

  private cloneStageState(state: StageRuntimeState): StageRuntimeState {
    return {
      boards: state.boards.map((board) => ({
        ...board,
        resourceIds: [...board.resourceIds],
      })),
      selectedResourceIds: new Set(state.selectedResourceIds),
      activeBoardId: state.activeBoardId,
    };
  }

  private ensureStageInitialized(stage: PlanningStageId, resources: Resource[]): void {
    const filteredResources = this.filterResourcesForStage(stage, resources);
    if (filteredResources.length === 0) {
      return;
    }

    const current = this.stageStateSignal();
    const state = this.cloneStageState(current[stage]);
    const orderMap = this.buildResourceOrderMap(filteredResources);
    let mutated = false;

    if (state.boards.length === 0) {
      const defaultBoards = this.createDefaultBoardsForStage(stage, filteredResources, orderMap);
      if (defaultBoards.length === 0) {
        const fallback = this.createBoardState(
          stage,
          this.nextBoardTitle(stage, 'Grundlage'),
          filteredResources.map((resource) => resource.id),
          orderMap,
        );
        state.boards = [fallback];
        state.activeBoardId = fallback.id;
      } else {
        state.boards = defaultBoards;
        state.activeBoardId = defaultBoards[0]?.id ?? '';
      }
      mutated = true;
    } else {
      const normalizedBoards = state.boards.map((board) => {
        const normalizedIds = this.normalizeResourceIds(board.resourceIds, stage, orderMap);
        if (!this.areIdsEqual(normalizedIds, board.resourceIds)) {
          mutated = true;
          return {
            ...board,
            resourceIds: normalizedIds,
          };
        }
        return board;
      });
      if (mutated) {
        state.boards = normalizedBoards;
      }
    }

    const filteredSelection = new Set(
      [...state.selectedResourceIds].filter((id) => orderMap.has(id)),
    );
    if (filteredSelection.size !== state.selectedResourceIds.size) {
      state.selectedResourceIds = filteredSelection;
      mutated = true;
    }

    if (!state.activeBoardId || !state.boards.some((board) => board.id === state.activeBoardId)) {
      state.activeBoardId = state.boards[0]?.id ?? '';
      mutated = true;
    }

    if (!mutated) {
      return;
    }

    this.stageStateSignal.set({
      ...current,
      [stage]: state,
    });
  }

  private nextBoardTitle(stage: PlanningStageId, suffix?: string): string {
    const meta = this.stageMetaMap[stage];
    const counter = this.boardCounters[stage]++;
    if (suffix) {
      return `${meta.shortLabel} · Plantafel ${counter} (${suffix})`;
    }
    return `${meta.shortLabel} · Plantafel ${counter}`;
  }

  private buildResourceOrderMap(resources: Resource[]): Map<string, number> {
    const map = new Map<string, number>();
    resources.forEach((resource, index) => map.set(resource.id, index));
    return map;
  }

  private normalizeResourceIds(
    resourceIds: string[],
    stage: PlanningStageId,
    order?: Map<string, number>,
  ): string[] {
    const orderMap =
      order ??
      this.buildResourceOrderMap(
        this.filterResourcesForStage(stage, this.stageResourceSignals[stage]()),
      );
    const seen = new Set<string>();
    const known: Array<{ id: string; order: number }> = [];
    const unmapped: string[] = [];

    resourceIds.forEach((id) => {
      if (seen.has(id)) {
        return;
      }
      seen.add(id);
      const position = orderMap.get(id);
      if (position === undefined) {
        unmapped.push(id);
      } else {
        known.push({ id, order: position });
      }
    });

    known.sort((a, b) => a.order - b.order);
    return [...known.map((entry) => entry.id), ...unmapped];
  }

  private areIdsEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((id, index) => id === b[index]);
  }

  private createBoardState(
    stage: PlanningStageId,
    title: string,
    resourceIds: string[],
    order?: Map<string, number>,
  ): PlanningBoard {
    return {
      id: `board-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
      title,
      resourceIds: this.normalizeResourceIds(resourceIds, stage, order),
      createdAt: Date.now(),
    };
  }

  private createDefaultBoardsForStage(
    stage: PlanningStageId,
    resources: Resource[],
    orderMap: Map<string, number>,
  ): PlanningBoard[] {
    const configs = STAGE_RESOURCE_GROUPS[stage] ?? [];
    const boards: PlanningBoard[] = [];
    const categorized = new Set<PlanningResourceCategory>();

    configs.forEach((config) => {
      const ids = resources
        .filter((resource) => this.getResourceCategory(resource) === config.category)
        .map((resource) => resource.id);
      if (ids.length === 0) {
        return;
      }
      boards.push(
        this.createBoardState(
          stage,
          `${this.stageMetaMap[stage].shortLabel} · ${config.label}`,
          ids,
          orderMap,
        ),
      );
      categorized.add(config.category);
    });

    const remaining = resources.filter((resource) => {
      const category = this.getResourceCategory(resource);
      if (!category) {
        return true;
      }
      return !categorized.has(category);
    });
    if (remaining.length > 0) {
      boards.push(
        this.createBoardState(
          stage,
          `${this.stageMetaMap[stage].shortLabel} · Weitere Ressourcen`,
          remaining.map((resource) => resource.id),
          orderMap,
        ),
      );
    }

    return boards;
  }

  private filterResourcesForStage(stage: PlanningStageId, resources: Resource[]): Resource[] {
    if (stage === 'base') {
      return resources.filter((resource) => this.isServiceResource(resource));
    }
    if (stage === 'dispatch') {
      return resources.filter((resource) => this.isPhysicalResource(resource));
    }
    return resources;
  }

  private isServiceResource(resource: Resource): boolean {
    const category = this.getResourceCategory(resource);
    return category === 'vehicle-service' || category === 'personnel-service';
  }

  private isPhysicalResource(resource: Resource): boolean {
    const category = this.getResourceCategory(resource);
    return category === 'vehicle' || category === 'personnel';
  }

  private computeTimelineRange(stage: PlanningStageId): PlanningTimelineRange {
    const selectedYears = this.selectedYearBounds(stage);
    if (!selectedYears.length) {
      return this.stageTimelineSignals[stage]();
    }
    const minStart = Math.min(...selectedYears.map((year) => year.start.getTime()));
    const maxEnd = Math.max(...selectedYears.map((year) => year.end.getTime()));
    return {
      start: new Date(minStart),
      end: new Date(maxEnd),
    };
  }

  private selectedYearBounds(stage: PlanningStageId): TimetableYearBounds[] {
    const selection = Array.from(this.stageYearSelectionState()[stage] ?? []);
    if (!selection.length) {
      return [];
    }
    const optionMap = new Map(
      this.timetableYearOptions().map(
        (year) => [year.label, year] as [string, TimetableYearBounds],
      ),
    );
    return selection
      .map((label) => optionMap.get(label))
      .filter((year): year is TimetableYearBounds => !!year);
  }

  private formatTimetableYearSummary(stage: PlanningStageId): string {
    const selection = Array.from(this.stageYearSelectionState()[stage] ?? []);
    if (selection.length === 0) {
      return 'Fahrplanjahr wählen';
    }
    if (selection.length === 1) {
      return `Fahrplanjahr ${selection[0]}`;
    }
    return `${selection.length} Fahrplanjahre`;
  }

  private createEmptyYearSelection(): Record<PlanningStageId, Set<string>> {
    return this.stageOrder.reduce((record, stage) => {
      record[stage] = new Set<string>();
      return record;
    }, {} as Record<PlanningStageId, Set<string>>);
  }

  private ensureStageYearSelection(stage: PlanningStageId, options: TimetableYearBounds[]): void {
    this.stageYearSelectionState.update((state) => {
      const current = state[stage] ?? new Set<string>();
      const validLabels = new Set(options.map((year) => year.label));
      const next = new Set(Array.from(current).filter((label) => validLabels.has(label)));
      if (next.size === 0 && options.length > 0) {
        next.add(this.preferredYearLabel(options));
      }
      if (this.areSetsEqual(next, current)) {
        return state;
      }
      return {
        ...state,
        [stage]: next,
      };
    });
  }

  private updateStageYearSelection(
    stage: PlanningStageId,
    updater: (current: Set<string>, options: TimetableYearBounds[]) => Set<string>,
  ): void {
    const options = this.timetableYearOptions();
    this.stageYearSelectionState.update((state) => {
      const current = state[stage] ?? new Set<string>();
      const next = updater(new Set(current), options);
      if (this.areSetsEqual(next, current)) {
        return state;
      }
      return {
        ...state,
        [stage]: next,
      };
    });
  }

  private preferredYearLabel(options: TimetableYearBounds[]): string {
    if (!options.length) {
      return '';
    }
    const today = new Date();
    const active =
      options.find((year) => today >= year.start && today <= year.end) ?? options[0];
    return active.label;
  }

  private areSetsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) {
      return false;
    }
    for (const value of a) {
      if (!b.has(value)) {
        return false;
      }
    }
    return true;
  }

  private setActiveStage(stage: PlanningStageId, updateUrl: boolean): void {
    const current = this.activeStageSignal();
    if (current === stage) {
      if (updateUrl) {
        this.updateStageQueryParam(stage);
      }
      return;
    }
    this.selectedActivityState.set(null);
    this.pendingServiceResourceSignal.set(null);
    this.serviceAssignmentTargetSignal.set(null);
    this.clearActivitySelection();
    this.activeStageSignal.set(stage);
    if (updateUrl) {
      this.updateStageQueryParam(stage);
    }
  }

  private updateStageQueryParam(stage: PlanningStageId): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { stage },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private normalizeStageId(value: string | null): PlanningStageId {
    if (value && value in this.stageMetaMap) {
      return value as PlanningStageId;
    }
    return 'base';
  }
}
