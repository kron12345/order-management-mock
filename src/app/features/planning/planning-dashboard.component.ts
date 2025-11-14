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
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
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
import { PlanWeekTemplateStoreService } from './stores/plan-week-template.store';
import { PlanWeekActivity } from '../../models/planning-template';
import { DurationPipe } from '../../shared/pipes/duration.pipe';

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

interface PendingActivityState {
  stage: PlanningStageId;
  activity: Activity;
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
    DurationPipe,
    GanttComponent,
    GanttWindowLauncherComponent,
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
  private readonly templateStore = inject(PlanWeekTemplateStoreService);

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

  private readonly baseTimelineFallback = this.data.stageTimelineRange('base');
  private readonly templateActivitySignal = computed(() => this.mapTemplateActivities());

  private readonly stageActivitySignals: Record<PlanningStageId, Signal<Activity[]>> = {
    base: this.templateActivitySignal,
    operations: this.data.stageActivities('operations'),
    dispatch: this.data.stageActivities('dispatch'),
  };

  private readonly normalizedStageActivitySignals: Record<PlanningStageId, Signal<Activity[]>> = {
    base: computed(() => this.normalizeActivityList(this.stageActivitySignals.base())),
    operations: computed(() => this.normalizeActivityList(this.stageActivitySignals.operations())),
    dispatch: computed(() => this.normalizeActivityList(this.stageActivitySignals.dispatch())),
  };

  protected readonly isBasePlanningPanelOpen = signal(false);

  private readonly stageTimelineSignals = {
    base: computed(() => this.computeBaseTimelineRange()),
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
  private readonly pendingActivitySignal = signal<PendingActivityState | null>(null);
  private readonly pendingActivityOriginal = signal<Activity | null>(null);

  protected readonly activityForm = this.fb.group({
    start: ['', Validators.required],
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

    effect(
      () => {
        const pending = this.pendingActivitySignal();
        const activeStage = this.activeStageSignal();
        if (pending && pending.stage !== activeStage) {
          if (this.selectedActivityState()?.activity.id === pending.activity.id) {
            this.selectedActivityState.set(null);
          }
          this.pendingActivitySignal.set(null);
        }
      },
      { allowSignalWrites: true },
    );

    this.activityForm.controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.activityFormTypeSignal.set(value ?? '');
    });

    this.activityForm.controls.type.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.activityFormTypeSignal.set(value ?? ''));

    this.activityForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.updatePendingActivityFromForm();
    });

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
        if (!this.isPendingSelection(selection.activity.id)) {
          this.activityForm.markAsPristine();
        }
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

    effect(
      () => {
        if (this.activeStageSignal() !== 'base' && this.isBasePlanningPanelOpen()) {
          this.isBasePlanningPanelOpen.set(false);
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
  protected readonly basePlanningYearRange = computed(() =>
    this.computeStageYearRange('base'),
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

  protected readonly pendingActivity = computed<Activity | null>(() =>
    this.pendingActivityForStage(this.activeStageSignal()),
  );

  protected readonly isSelectedActivityPending = computed(() => {
    const selection = this.selectedActivityState();
    if (!selection) {
      return false;
    }
    return this.isPendingSelection(selection.activity.id);
  });

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

  protected resetPendingActivityEdits(): void {
    const pendingState = this.pendingActivitySignal();
    const original = this.pendingActivityOriginal();
    const selection = this.selectedActivityState();
    const stage = this.activeStageSignal();
    if (!pendingState || !original || !selection) {
      return;
    }
    if (pendingState.stage !== stage || pendingState.activity.id !== original.id) {
      return;
    }

    this.pendingActivitySignal.set({ stage: pendingState.stage, activity: original });
    this.selectedActivityState.set({ activity: original, resource: selection.resource });

    this.activityForm.setValue({
      start: this.toLocalDateTime(original.start),
      end: original.end ? this.toLocalDateTime(original.end) : '',
      type: original.type ?? '',
      from: original.from ?? '',
      to: original.to ?? '',
      remark: original.remark ?? '',
    });
    this.activityForm.markAsPristine();
  }

  protected adjustFormEndBy(deltaMinutes: number): void {
    const value = this.activityForm.getRawValue();
    if (!value.start) {
      return;
    }
    const start = this.fromLocalDateTime(value.start);
    if (!start) {
      return;
    }
    const baseEnd = value.end ? this.fromLocalDateTime(value.end) : new Date(start);
    if (!baseEnd) {
      return;
    }
    const nextEndMs = baseEnd.getTime() + deltaMinutes * 60 * 1000;
    const minEndMs = start.getTime() + 60 * 1000;
    const safeEnd = new Date(Math.max(nextEndMs, minEndMs));
    const nextEndLocal = this.toLocalDateTime(safeEnd.toISOString());
    this.activityForm.controls.end.setValue(nextEndLocal);
    this.activityForm.controls.end.markAsDirty();
  }

  protected shiftFormBy(deltaMinutes: number): void {
    const value = this.activityForm.getRawValue();
    if (!value.start) {
      return;
    }
    const start = this.fromLocalDateTime(value.start);
    if (!start) {
      return;
    }
    const end = value.end ? this.fromLocalDateTime(value.end) : null;
    const deltaMs = deltaMinutes * 60 * 1000;
    const nextStart = new Date(start.getTime() + deltaMs);
    this.activityForm.controls.start.setValue(this.toLocalDateTime(nextStart.toISOString()));
    this.activityForm.controls.start.markAsDirty();
    if (end) {
      const nextEnd = new Date(end.getTime() + deltaMs);
      this.activityForm.controls.end.setValue(this.toLocalDateTime(nextEnd.toISOString()));
      this.activityForm.controls.end.markAsDirty();
    }
  }

  private updatePendingActivityFromForm(): void {
    const selection = this.selectedActivityState();
    const pendingState = this.pendingActivitySignal();
    const stage = this.activeStageSignal();
    if (!selection || !pendingState) {
      return;
    }
    if (pendingState.stage !== stage || pendingState.activity.id !== selection.activity.id) {
      return;
    }

    const value = this.activityForm.getRawValue();
    if (!value.start) {
      return;
    }
    const startDate = this.fromLocalDateTime(value.start);
    if (!startDate || !Number.isFinite(startDate.getTime())) {
      return;
    }

    const desiredType =
      value.type && value.type.length > 0 ? value.type : (selection.activity.type ?? '');
    const definition =
      this.findActivityType(desiredType) ??
      this.findActivityType(selection.activity.type ?? null);
    const isPoint = definition?.timeMode === 'point';
    const endDateRaw = !isPoint && value.end ? this.fromLocalDateTime(value.end) : null;
    const endDateValid =
      endDateRaw && endDateRaw.getTime() > startDate.getTime() ? endDateRaw : null;

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

    const normalized = this.applyActivityTypeConstraints(updated);
    const current = pendingState.activity;

    if (
      current.start === normalized.start &&
      current.end === normalized.end &&
      (current.type ?? '') === (normalized.type ?? '') &&
      (current.title ?? '') === (normalized.title ?? '') &&
      (current.from ?? '') === (normalized.from ?? '') &&
      (current.to ?? '') === (normalized.to ?? '') &&
      (current.remark ?? '') === (normalized.remark ?? '')
    ) {
      return;
    }

    this.commitPendingActivityUpdate(normalized);
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
    if (stage === 'base' && !this.templateStore.selectedTemplate()?.id) {
      return;
    }
    const definition = this.resolveActivityTypeForResource(
      event.resource,
      this.activityCreationToolSignal(),
    );
    if (!definition) {
      return;
    }
    const draft = this.createActivityDraft(event, definition);
    const normalized = this.applyActivityTypeConstraints(draft);
    this.pendingActivityOriginal.set(normalized);
    this.startPendingActivity(stage, event.resource, normalized);
  }

  protected handleActivityEdit(event: { resource: Resource; activity: Activity }): void {
    if (!this.isPendingSelection(event.activity.id)) {
      this.pendingActivitySignal.set(null);
    }
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
    if (this.isPendingSelection(event.activity.id)) {
      this.updatePendingActivityPosition(event);
      return;
    }
    const stage = this.activeStageSignal();
    if (stage === 'base') {
      this.handleBaseActivityReposition(event);
      return;
    }
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
    const selection = this.selectedActivityState();
    if (selection && this.isPendingSelection(selection.activity.id)) {
      this.pendingActivitySignal.set(null);
      this.pendingActivityOriginal.set(null);
    }
    this.selectedActivityState.set(null);
  }

  protected saveSelectedActivityEdits(): void {
    const selection = this.selectedActivityState();
    if (!selection) {
      return;
    }
    if (this.activityForm.invalid) {
      this.activityForm.markAllAsTouched();
      return;
    }
    const stage = this.activeStageSignal();
    const pending = this.pendingActivitySignal();
    const isPendingDraft =
      pending && pending.stage === stage && pending.activity.id === selection.activity.id;
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
    const normalized = this.applyActivityTypeConstraints(updated);
    if (isPendingDraft) {
      if (stage === 'base') {
        this.saveTemplateActivity(normalized);
      } else {
        this.updateStageActivities(stage, (activities) => [...activities, normalized]);
      }
      this.pendingActivitySignal.set(null);
      this.pendingActivityOriginal.set(null);
      this.selectedActivityState.set({ activity: normalized, resource: selection.resource });
      return;
    }
    if (stage === 'base') {
      this.saveTemplateActivity(normalized);
      this.selectedActivityState.set({ activity: normalized, resource: selection.resource });
      return;
    }
    this.replaceActivity(normalized);
  }

  protected deleteSelectedActivity(): void {
    const selection = this.selectedActivityState();
    if (!selection) {
      return;
    }
    if (this.isPendingSelection(selection.activity.id)) {
      this.pendingActivitySignal.set(null);
      this.selectedActivityState.set(null);
      return;
    }
    const stage = this.activeStageSignal();
    if (stage === 'base') {
      const templateId = this.templateStore.selectedTemplate()?.id;
      if (templateId) {
        this.templateStore.deleteActivity(templateId, selection.activity.id);
      }
      this.selectedActivityState.set(null);
      return;
    }
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
    const target =
      selected.length === 1 ? selected[0] : this.selectedActivityState();
    if (!target) {
      return;
    }
    const { activity } = target;
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
    const normalized = this.applyActivityTypeConstraints(updated);
    if (this.isPendingSelection(activity.id)) {
      this.commitPendingActivityUpdate(normalized);
      return;
    }
    this.replaceActivity(normalized);
  }

  protected snapSelectedActivityToPrevious(): void {
    const selection = this.selectedActivityState();
    if (!selection) {
      return;
    }
    const formValue = this.activityForm.getRawValue();
    if (!formValue.start) {
      return;
    }
    const base = selection.activity;
    const startDate = this.fromLocalDateTime(formValue.start);
    const endDate = formValue.end ? this.fromLocalDateTime(formValue.end) : null;
    if (!startDate) {
      return;
    }
    const reference: Activity = {
      ...base,
      start: startDate.toISOString(),
      end: endDate ? endDate.toISOString() : null,
    };
    const neighbors = this.findNeighborActivities(reference);
    const previous = neighbors.previous;
    if (!previous || !previous.end) {
      return;
    }
    const definition = this.findActivityType(base.type ?? null);
    const isPoint = definition?.timeMode === 'point';
    const prevEndDate = new Date(previous.end);
    const prevEndMs = prevEndDate.getTime();
    let updated: Activity;
    if (isPoint || !base.end) {
      updated = {
        ...base,
        start: prevEndDate.toISOString(),
      };
    } else {
      const currentStartMs = startDate.getTime();
      const currentEndMs = (endDate ?? startDate).getTime();
      const durationMs = Math.max(60_000, currentEndMs - currentStartMs);
      const newStartMs = prevEndMs;
      const newEndMs = newStartMs + durationMs;
      updated = {
        ...base,
        start: new Date(newStartMs).toISOString(),
        end: new Date(newEndMs).toISOString(),
      };
    }
    this.activityForm.controls.start.setValue(this.toLocalDateTime(updated.start));
    if (!isPoint && updated.end) {
      this.activityForm.controls.end.setValue(this.toLocalDateTime(updated.end));
    } else {
      this.activityForm.controls.end.setValue('');
    }
    this.activityForm.controls.start.markAsDirty();
    this.activityForm.controls.end.markAsDirty();
  }

  protected snapSelectedActivityToNext(): void {
    const selection = this.selectedActivityState();
    if (!selection) {
      return;
    }
    const formValue = this.activityForm.getRawValue();
    if (!formValue.start) {
      return;
    }
    const base = selection.activity;
    const startDate = this.fromLocalDateTime(formValue.start);
    const endDate = formValue.end ? this.fromLocalDateTime(formValue.end) : null;
    if (!startDate) {
      return;
    }
    const reference: Activity = {
      ...base,
      start: startDate.toISOString(),
      end: endDate ? endDate.toISOString() : null,
    };
    const neighbors = this.findNeighborActivities(reference);
    const next = neighbors.next;
    if (!next) {
      return;
    }
    const definition = this.findActivityType(base.type ?? null);
    const isPoint = definition?.timeMode === 'point';
    const nextStartDate = new Date(next.start);
    const nextStartMs = nextStartDate.getTime();
    let updated: Activity;
    if (isPoint || !endDate) {
      updated = {
        ...base,
        start: nextStartDate.toISOString(),
      };
    } else {
      const currentStartMs = startDate.getTime();
      const currentEndMs = endDate.getTime();
      const durationMs = Math.max(60_000, currentEndMs - currentStartMs);
      const newEndMs = nextStartMs;
      const newStartMs = newEndMs - durationMs;
      updated = {
        ...base,
        start: new Date(newStartMs).toISOString(),
        end: new Date(newEndMs).toISOString(),
      };
    }
    this.activityForm.controls.start.setValue(this.toLocalDateTime(updated.start));
    if (!isPoint && updated.end) {
      this.activityForm.controls.end.setValue(this.toLocalDateTime(updated.end));
    } else {
      this.activityForm.controls.end.setValue('');
    }
    this.activityForm.controls.start.markAsDirty();
    this.activityForm.controls.end.markAsDirty();
  }

  protected fillGapForSelectedActivity(): void {
    const selection = this.selectedActivityState();
    if (!selection) {
      return;
    }
    const formValue = this.activityForm.getRawValue();
    if (!formValue.start) {
      return;
    }
    const base = selection.activity;
    const startDate = this.fromLocalDateTime(formValue.start);
    const endDate = formValue.end ? this.fromLocalDateTime(formValue.end) : null;
    if (!startDate) {
      return;
    }
    const reference: Activity = {
      ...base,
      start: startDate.toISOString(),
      end: endDate ? endDate.toISOString() : null,
    };
    const neighbors = this.findNeighborActivities(reference);
    const previous = neighbors.previous;
    const next = neighbors.next;
    if (!previous || !previous.end || !next) {
      return;
    }
    const startMs = new Date(previous.end).getTime();
    const endMs = new Date(next.start).getTime();
    if (!(Number.isFinite(startMs) && Number.isFinite(endMs)) || endMs <= startMs + 60_000) {
      return;
    }
    const definition = this.findActivityType(base.type ?? null);
    const isPoint = definition?.timeMode === 'point';
    const updated: Activity = {
      ...base,
      start: new Date(startMs).toISOString(),
      end: isPoint ? null : new Date(endMs).toISOString(),
    };
    this.activityForm.controls.start.setValue(this.toLocalDateTime(updated.start));
    if (!isPoint && updated.end) {
      this.activityForm.controls.end.setValue(this.toLocalDateTime(updated.end));
    } else {
      this.activityForm.controls.end.setValue('');
    }
    this.activityForm.controls.start.markAsDirty();
    this.activityForm.controls.end.markAsDirty();
  }

  protected snapFormToPrevious(): void {
    this.snapSelectedActivityToPrevious();
  }

  protected snapFormToNext(): void {
    this.snapSelectedActivityToNext();
  }

  protected fillGapForForm(): void {
    this.fillGapForSelectedActivity();
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

  private startPendingActivity(stage: PlanningStageId, resource: Resource, activity: Activity): void {
    this.pendingActivitySignal.set({ stage, activity });
    this.selectedActivityState.set({ activity, resource });
    this.selectedActivityIdsSignal.set(new Set());
  }

  private isPendingSelection(activityId: string | null | undefined): boolean {
    if (!activityId) {
      return false;
    }
    const pending = this.pendingActivitySignal();
    if (!pending) {
      return false;
    }
    return pending.stage === this.activeStageSignal() && pending.activity.id === activityId;
  }

  private commitPendingActivityUpdate(activity: Activity): void {
    const pending = this.pendingActivitySignal();
    if (!pending) {
      return;
    }
    this.pendingActivitySignal.set({ stage: pending.stage, activity });
    const stage = this.activeStageSignal();
    const resource =
      this.stageResourceSignals[stage]().find((entry) => entry.id === activity.resourceId) ??
      this.selectedActivityState()?.resource ??
      null;
    if (resource) {
      this.selectedActivityState.set({ activity, resource });
    } else {
      this.selectedActivityState.set(null);
    }
  }


  private pendingActivityForStage(stage: PlanningStageId): Activity | null {
    const pending = this.pendingActivitySignal();
    if (!pending || pending.stage !== stage) {
      return null;
    }
    return pending.activity;
  }

  private updatePendingActivityPosition(event: {
    activity: Activity;
    targetResourceId: string;
    start: Date;
    end: Date | null;
  }): void {
    const updated: Activity = {
      ...event.activity,
      resourceId: event.targetResourceId,
      start: event.start.toISOString(),
      end: event.end ? event.end.toISOString() : null,
      participantResourceIds: [event.targetResourceId],
    };
    this.commitPendingActivityUpdate(this.applyActivityTypeConstraints(updated));
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

  private findNeighborActivities(activity: Activity): { previous: Activity | null; next: Activity | null } {
    const stage = this.activeStageSignal();
    const all = this.normalizedStageActivitySignals[stage]();
    const serviceId = activity.serviceId ?? null;
    const resourceId = activity.resourceId;
    const targetStartMs = new Date(activity.start).getTime();
    const targetEndMs = activity.end ? new Date(activity.end).getTime() : targetStartMs;
    if (!Number.isFinite(targetStartMs) || !Number.isFinite(targetEndMs)) {
      return { previous: null, next: null };
    }
    let previous: Activity | null = null;
    let next: Activity | null = null;
    let previousEndMs = Number.NEGATIVE_INFINITY;
    let nextStartMs = Number.POSITIVE_INFINITY;
    all.forEach((entry) => {
      if (entry.id === activity.id) {
        return;
      }
      if (entry.resourceId !== resourceId) {
        return;
      }
      const entryService = entry.serviceId ?? null;
      if (serviceId ? entryService !== serviceId : !!entryService) {
        return;
      }
      const startMs = new Date(entry.start).getTime();
      const endMs = entry.end ? new Date(entry.end).getTime() : startMs;
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        return;
      }
      if (endMs <= targetStartMs && endMs > previousEndMs) {
        previous = entry;
        previousEndMs = endMs;
      }
      if (startMs >= targetEndMs && startMs < nextStartMs) {
        next = entry;
        nextStartMs = startMs;
      }
    });
    return { previous, next };
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

  protected boardPendingActivity(board: PlanningBoard): Activity | null {
    const pending = this.pendingActivity();
    if (!pending) {
      return null;
    }
    return board.resourceIds.includes(pending.resourceId) ? pending : null;
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
      const serviceResources = resources.filter((resource) => this.isServiceResource(resource));
      if (serviceResources.length > 0) {
        return serviceResources;
      }
      return resources;
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
    if (stage === 'base') {
      return this.stageTimelineSignals.base();
    }
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

  private computeBaseTimelineRange(): PlanningTimelineRange {
    const template = this.templateStore.selectedTemplate();
    const fallback = this.baseTimelineFallback();
    const parsed = template?.baseWeekStartIso ? this.parseTemplateDate(template.baseWeekStartIso) : null;
    const start = parsed ?? new Date(fallback.start);
    const end = new Date(start.getTime());
    end.setUTCDate(end.getUTCDate() + 7);
    end.setUTCHours(end.getUTCHours() + 20);
    return { start, end };
  }

  private parseTemplateDate(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const date = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(date.getTime()) ? date : null;
    }
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
      const [day, month, year] = value.split('.').map((part) => Number.parseInt(part, 10));
      if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) {
        return null;
      }
      const date = new Date(Date.UTC(year, month - 1, day));
      return Number.isFinite(date.getTime()) ? date : null;
    }
    const fallback = new Date(value);
    return Number.isFinite(fallback.getTime()) ? fallback : null;
  }

  private computeStageYearRange(
    stage: PlanningStageId,
  ): { startIso: string; endIso: string } | null {
    const selected = this.selectedYearBounds(stage);
    const source =
      selected.length > 0 ? selected : [this.timetableYearService.defaultYearBounds()];
    if (!source.length) {
      return null;
    }
    const minStart = Math.min(...source.map((year) => year.start.getTime()));
    const maxEnd = Math.max(...source.map((year) => year.end.getTime()));
    return {
      startIso: this.toIsoDate(new Date(minStart)),
      endIso: this.toIsoDate(new Date(maxEnd)),
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

  private toIsoDate(date: Date): string {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
      .toISOString()
      .slice(0, 10);
  }

  private mapTemplateActivities(): Activity[] {
    const plans = this.templateStore.selectedActivities();
    if (!plans.length) {
      return [];
    }
    const resources = this.stageResourceSignals.base();
    const normalized = this.normalizeActivityList(plans.map((item) => this.planActivityToActivity(item, resources)));
    return this.annotateBaseServiceMetadata(normalized, resources);
  }

  private planActivityToActivity(plan: PlanWeekActivity, resources: Resource[]): Activity {
    const resource = resources.find((entry) => entry.id === plan.resourceId) ?? null;
    const activity: Activity = {
      id: plan.id,
      resourceId: plan.resourceId,
      title: plan.title,
      start: plan.startIso,
      end: plan.endIso ?? plan.startIso,
      type: plan.type,
      remark: plan.remark ?? null,
      participantResourceIds: [plan.resourceId],
      attributes: plan.attributes,
      serviceCategory: resource ? this.resolveServiceCategory(resource) ?? undefined : undefined,
    };
    // Restore optional route fields (persisted inside attributes on PlanWeek level)
    const attr = plan.attributes as Record<string, unknown> | undefined;
    const fromAttr = typeof attr?.['from'] === 'string' ? (attr?.['from'] as string) : undefined;
    const toAttr = typeof attr?.['to'] === 'string' ? (attr?.['to'] as string) : undefined;
    if (fromAttr !== undefined) {
      activity.from = fromAttr;
    }
    if (toAttr !== undefined) {
      activity.to = toAttr;
    }
    return this.applyActivityTypeConstraints(activity);
  }

  private activityToPlanActivity(activity: Activity, templateId: string): PlanWeekActivity {
    // Ensure route fields are persisted within the attributes bag for PlanWeek storage
    const attrs: Record<string, unknown> = { ...(activity.attributes ?? {}) };
    if (typeof activity.from === 'string') {
      attrs['from'] = activity.from;
    } else {
      delete (attrs as any)['from'];
    }
    if (typeof activity.to === 'string') {
      attrs['to'] = activity.to;
    } else {
      delete (attrs as any)['to'];
    }
    return {
      id: activity.id,
      templateId,
      resourceId: activity.resourceId,
      title: activity.title,
      startIso: activity.start,
      endIso: activity.end ?? activity.start,
      type: activity.type ?? undefined,
      remark: activity.remark ?? undefined,
      attributes: attrs,
    };
  }

  private annotateBaseServiceMetadata(activities: Activity[], resources: Resource[]): Activity[] {
    if (!activities.length) {
      return activities;
    }
    const resourceMap = new Map(resources.map((resource) => [resource.id, resource]));
    const clones = activities.map((activity) => ({ ...activity }));
    const resourceBuckets = new Map<string, Activity[]>();

    clones.forEach((activity) => {
      if (!resourceBuckets.has(activity.resourceId)) {
        resourceBuckets.set(activity.resourceId, []);
      }
      resourceBuckets.get(activity.resourceId)!.push(activity);
    });

    resourceBuckets.forEach((list, resourceId) => {
      const resource = resourceMap.get(resourceId) ?? null;
      list.sort((a, b) => {
        const aTime = this.tryParseIso(a.start)?.getTime() ?? 0;
        const bTime = this.tryParseIso(b.start)?.getTime() ?? 0;
        return aTime - bTime;
      });

      let currentService: {
        id: string;
        category: 'personnel-service' | 'vehicle-service' | undefined;
        templateId: string | null;
      } | null = null;

      list.forEach((activity) => {
        const startDate = this.tryParseIso(activity.start);
        if (!startDate) {
          this.clearServiceMetadata(activity, resource);
          return;
        }

        if (this.isServiceStartActivity(activity)) {
          const serviceDate = this.toIsoDate(startDate);
          const serviceId = this.buildServiceId(activity.resourceId, serviceDate);
          const category = resource ? this.resolveServiceCategory(resource) : activity.serviceCategory ?? undefined;
          const templateId = resource?.id ?? activity.serviceTemplateId ?? null;
          currentService = { id: serviceId, category, templateId };
          this.assignServiceMetadata(activity, currentService, 'start');
          return;
        }

        if (currentService) {
          const role = this.isServiceEndActivity(activity) ? 'end' : 'segment';
          this.assignServiceMetadata(activity, currentService, role);
          if (role === 'end') {
            currentService = null;
          }
        } else {
          this.clearServiceMetadata(activity, resource);
          if (this.isServiceEndActivity(activity)) {
            activity.serviceRole = 'end';
          }
        }
      });
    });

    return clones;
  }

  private isServiceStartActivity(activity: Activity): boolean {
    return (activity.type ?? '') === 'service-start' || activity.serviceRole === 'start';
  }

  private isServiceEndActivity(activity: Activity): boolean {
    return (activity.type ?? '') === 'service-end' || activity.serviceRole === 'end';
  }

  private assignServiceMetadata(
    activity: Activity,
    descriptor: {
      id: string;
      category: 'personnel-service' | 'vehicle-service' | undefined;
      templateId: string | null;
    },
    role: ServiceRole,
  ): void {
    activity.serviceId = descriptor.id;
    activity.serviceRole = role;
    activity.serviceCategory = descriptor.category;
    activity.serviceTemplateId = descriptor.templateId;
  }

  private clearServiceMetadata(activity: Activity, resource: Resource | null = null): void {
    activity.serviceId = undefined;
    if (!this.isServiceStartActivity(activity) && !this.isServiceEndActivity(activity)) {
      activity.serviceRole = null;
    }
    if (resource) {
      activity.serviceCategory = this.resolveServiceCategory(resource);
      activity.serviceTemplateId = resource.id;
    } else {
      activity.serviceCategory = activity.serviceCategory ?? undefined;
      activity.serviceTemplateId = activity.serviceTemplateId ?? null;
    }
  }

  private buildServiceId(resourceId: string, serviceDate: string): string {
    return `service:${resourceId}:${serviceDate}`;
  }

  private tryParseIso(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  private createActivityDraft(
    event: { resource: Resource; start: Date },
    definition: ActivityTypeDefinition,
  ): Activity {
    const endDate =
      definition.timeMode === 'duration'
        ? new Date(event.start.getTime() + definition.defaultDurationMinutes * 60 * 1000)
        : null;
    const draft: Activity = {
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
      draft.from = '';
    }
    if (this.definitionHasField(definition, 'to')) {
      draft.to = '';
    }
    if (this.definitionHasField(definition, 'remark')) {
      draft.remark = '';
    }
    return draft;
  }

  private handleBaseActivityReposition(event: {
    activity: Activity;
    targetResourceId: string;
    start: Date;
    end: Date | null;
  }): void {
    const updated: Activity = {
      ...event.activity,
      resourceId: event.targetResourceId,
      start: event.start.toISOString(),
      end: event.end ? event.end.toISOString() : null,
      participantResourceIds: [event.targetResourceId],
    };
    const normalized = this.applyActivityTypeConstraints(updated);
    this.saveTemplateActivity(normalized);
    const resource =
      this.stageResourceSignals.base().find((res) => res.id === event.targetResourceId) ??
      this.selectedActivityState()?.resource ??
      null;
    const currentSelection = this.selectedActivityState();
    if (resource && currentSelection?.activity.id === event.activity.id) {
      this.selectedActivityState.set({ activity: normalized, resource });
    }
  }

  private saveTemplateActivity(activity: Activity): void {
    const templateId = this.templateStore.selectedTemplate()?.id;
    if (!templateId) {
      return;
    }
    const payload = this.activityToPlanActivity(activity, templateId);
    this.templateStore.saveActivity(templateId, payload);
  }

  protected toggleBasePlanningPanel(): void {
    this.isBasePlanningPanelOpen.update((isOpen) => !isOpen);
  }

  protected closeBasePlanningPanel(): void {
    this.isBasePlanningPanelOpen.set(false);
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
