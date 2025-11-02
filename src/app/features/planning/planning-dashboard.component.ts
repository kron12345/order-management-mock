import { Component, Signal, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { GanttComponent } from '../../gantt/gantt.component';
import { PlanningDataService } from './planning-data.service';
import { Resource } from '../../models/resource';
import { Activity } from '../../models/activity';
import {
  PLANNING_STAGE_METAS,
  PlanningResourceCategory,
  PlanningStageId,
  PlanningStageMeta,
} from './planning-stage.model';

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

@Component({
  selector: 'app-planning-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatTabsModule,
    MatMenuModule,
    MatTooltipModule,
    MatCheckboxModule,
    MatChipsModule,
    MatButtonToggleModule,
    MatCardModule,
    GanttComponent,
  ],
  templateUrl: './planning-dashboard.component.html',
  styleUrl: './planning-dashboard.component.scss',
})
export class PlanningDashboardComponent {
  private readonly data = inject(PlanningDataService);

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

  constructor() {
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
  }

  protected readonly activeStageId = computed(() => this.activeStageSignal());

  protected readonly activeStageMeta = computed(
    () => this.stageMetaMap[this.activeStageSignal()],
  );

  protected readonly resources = computed(() => this.stageResourceSignals[this.activeStageSignal()]());

  protected readonly activities = computed(
    () => this.stageActivitySignals[this.activeStageSignal()](),
  );

  protected readonly timelineRange = computed(
    () => this.stageTimelineSignals[this.activeStageSignal()](),
  );

  protected readonly resourceGroups = computed(() =>
    this.computeResourceGroups(this.activeStageSignal()),
  );

  protected readonly boards = computed(
    () => this.stageStateSignal()[this.activeStageSignal()].boards,
  );

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

  protected trackStage(_: number, stage: PlanningStageMeta | undefined): string {
    return stage?.id ?? `stage-${_}`;
  }

  protected trackResource(_: number, resource: Resource): string {
    return resource.id;
  }

  protected trackBoard(_: number, board: PlanningBoard): string {
    return board.id;
  }

  protected trackFocus(_: number, focus: string): string {
    return focus;
  }

  protected onStageChange(stage: PlanningStageId | null | undefined): void {
    if (!stage || !(stage in this.stageMetaMap)) {
      return;
    }
    const nextStage = stage as PlanningStageId;
    if (nextStage === this.activeStageSignal()) {
      return;
    }
    this.activeStageSignal.set(nextStage);
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
    return this.stageResourceSignals[stage]().filter((resource) =>
      resourceSet.has(resource.id),
    );
  }

  protected boardActivities(board: PlanningBoard): Activity[] {
    const stage = this.activeStageSignal();
    const resourceSet = new Set(board.resourceIds);
    return this.stageActivitySignals[stage]().filter((activity) =>
      resourceSet.has(activity.resourceId),
    );
  }

  protected isActiveBoard(boardId: string): boolean {
    const stage = this.activeStageSignal();
    return this.stageStateSignal()[stage].activeBoardId === boardId;
  }

  private computeResourceGroups(stage: PlanningStageId): ResourceGroupView[] {
    const resources = this.stageResourceSignals[stage]();
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
    if (
      category === 'vehicle-service' ||
      category === 'personnel-service' ||
      category === 'vehicle' ||
      category === 'personnel'
    ) {
      return category;
    }
    return null;
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
    if (resources.length === 0) {
      return;
    }

    const current = this.stageStateSignal();
    const state = this.cloneStageState(current[stage]);
    const orderMap = this.buildResourceOrderMap(resources);
    let mutated = false;

    if (state.boards.length === 0) {
      const board = this.createBoardState(
        stage,
        this.nextBoardTitle(stage, 'Grundlage'),
        resources.map((resource) => resource.id),
        orderMap,
      );
      state.boards = [board];
      state.activeBoardId = board.id;
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
    const orderMap = order ?? this.buildResourceOrderMap(this.stageResourceSignals[stage]());
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
}
