import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Injector,
  Input,
  Output,
  EventEmitter,
  DestroyRef,
  ViewChild,
  ViewChildren,
  QueryList,
  computed,
  effect,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { MatIconModule } from '@angular/material/icon';
import { Resource } from '../models/resource';
import { Activity } from '../models/activity';
import { ZoomLevel } from '../models/time-scale';
import { TimeScaleService } from '../core/services/time-scale.service';
import { createTimeViewport, TimeViewport } from '../core/signals/time-viewport.signal';
import { GanttMenuComponent } from './gantt-menu.component';
import { GanttResourcesComponent } from './gantt-resources.component';
import {
  GanttBackgroundSegment,
  GanttBar,
  GanttServiceRange,
  GanttTimelineRowComponent,
} from './gantt-timeline-row.component';
import { GanttTimelineHeaderComponent } from './gantt-timeline-header.component';
import { GanttStatusBarComponent } from './gantt-status-bar.component';
import { TrackHorizontalScrollDirective } from '../shared/directives/track-horizontal-scroll.directive';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { addDays, startOfDay } from '../core/utils/time-math';

interface PreparedActivity extends Activity {
  startMs: number;
  endMs: number;
}

interface GanttGroupRow {
  kind: 'group';
  id: string;
  label: string;
  icon: string;
  resourceIds: string[];
  resourceCount: number;
  expanded: boolean;
  category: string | null;
}

interface GanttResourceRow {
  kind: 'resource';
  id: string;
  resource: Resource;
  bars: GanttBar[];
  services: GanttServiceRange[];
  groupId: string;
  zebra: boolean;
}

type GanttDisplayRow = GanttGroupRow | GanttResourceRow;

interface GanttGroupDefinition {
  id: string;
  label: string;
  icon: string;
  category: string | null;
  resources: Resource[];
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

const ZOOM_LEVELS: ZoomLevel[] = [
  'quarter',
  '2month',
  'month',
  '2week',
  'week',
  '3day',
  'day',
  '12hour',
  '6hour',
  '3hour',
  'hour',
  '30min',
  '15min',
  '10min',
  '5min',
];

@Component({
  selector: 'app-gantt',
  standalone: true,
  imports: [
    CommonModule,
    ScrollingModule,
    MatIconModule,
    GanttMenuComponent,
    GanttResourcesComponent,
    GanttTimelineRowComponent,
    GanttTimelineHeaderComponent,
    GanttStatusBarComponent,
    TrackHorizontalScrollDirective,
  ],
  templateUrl: './gantt.component.html',
  styleUrl: './gantt.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GanttComponent implements AfterViewInit {
  private readonly timeScale = inject(TimeScaleService);
  private readonly hostElement = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly resourcesSignal = signal<Resource[]>([]);
  private readonly activitiesSignal = signal<PreparedActivity[]>([]);
  private readonly filterTerm = signal('');
  private readonly cursorTimeSignal = signal<Date | null>(null);
  private readonly viewportReady = signal(false);
  private readonly expandedGroups = signal<Set<string>>(new Set());
  private readonly selectedActivityIdsSignal = signal<Set<string>>(new Set());
  private readonly activeTouchPointers = new Map<number, { x: number; y: number }>();
  private pinchReferenceDistance: number | null = null;
  private touchPanLastX: number | null = null;
  private touchPointerContainer: HTMLElement | null = null;
  private readonly pinchLogThreshold = 0.08;

  private viewport!: TimeViewport;
  private viewportInitialized = false;
  private lastTimelineRange: { start: number; end: number } | null = null;
  private previousResourceIds: string[] | null = null;
  private previousActivityIds: string[] | null = null;

  @ViewChild('headerScroller', { read: TrackHorizontalScrollDirective })
  private headerScrollerDir?: TrackHorizontalScrollDirective;

  @ViewChildren('rowScroller', { read: TrackHorizontalScrollDirective })
  private rowScrollerDirs?: QueryList<TrackHorizontalScrollDirective>;

  @Output() removeResource = new EventEmitter<Resource['id']>();
  @Output() activitySelectionToggle = new EventEmitter<{ resource: Resource; activity: Activity }>();
  @Output() resourceViewModeChange = new EventEmitter<{ resourceId: string; mode: 'block' | 'detail' }>();
  @Output() serviceAssignmentRequested = new EventEmitter<Resource>();
  @Output() activityCreateRequested = new EventEmitter<{ resource: Resource; start: Date }>();
  @Output() activityEditRequested = new EventEmitter<{ resource: Resource; activity: Activity }>();

  @Input()
  set selectedActivityIds(value: string[] | null) {
    this.selectedActivityIdsSignal.set(new Set(value ?? []));
  }

  @Input({ required: true })
  set resources(value: Resource[]) {
    const list = value ?? [];
    const nextIds = list.map((resource) => resource.id);
    if (this.previousResourceIds && arraysEqual(this.previousResourceIds, nextIds)) {
      return;
    }
    this.previousResourceIds = nextIds;
    this.resourcesSignal.set(list);
    this.resetExpandedGroups(list);
  }

  @Input()
  resourceViewModes: Record<string, 'block' | 'detail'> = {};

  @Input({ required: true })
  set activities(value: Activity[]) {
    const prepared = (value ?? []).map((activity) => ({
      ...activity,
      startMs: new Date(activity.start).getTime(),
      endMs: new Date(activity.end).getTime(),
    }));
    const nextIds = prepared.map((activity) => activity.id);
    if (this.previousActivityIds && arraysEqual(this.previousActivityIds, nextIds)) {
      return;
    }
    this.previousActivityIds = nextIds;
    this.activitiesSignal.set(prepared);
  }

  @Input({ required: true })
  set timelineRange(value: { start: Date; end: Date }) {
    if (!value) {
      return;
    }
    const normalizedStart = startOfDay(value.start);
    const normalizedEndBase = startOfDay(value.end);
    const normalizedEnd =
      normalizedEndBase.getTime() <= normalizedStart.getTime()
        ? addDays(normalizedStart, 1)
        : addDays(normalizedEndBase, 1);
    const nextRange = {
      start: normalizedStart.getTime(),
      end: normalizedEnd.getTime(),
    };
    if (this.lastTimelineRange && this.lastTimelineRange.start === nextRange.start && this.lastTimelineRange.end === nextRange.end) {
      return;
    }
    this.lastTimelineRange = nextRange;
    if (this.viewportInitialized) {
      this.resetViewport(normalizedStart, normalizedEnd);
    } else {
      this.initializeViewport(normalizedStart, normalizedEnd);
    }
  }

  readonly zoomLevels = ZOOM_LEVELS;

  readonly filteredResources = computed(() => {
    const term = this.filterTerm().trim().toLowerCase();
    const resources = this.resourcesSignal();
    if (!term) {
      return resources;
    }
    return resources.filter((resource) => {
      const base = `${resource.id} ${resource.name}`.toLowerCase();
      const attr = resource.attributes
        ? JSON.stringify(resource.attributes).toLowerCase()
        : '';
      return base.includes(term) || attr.includes(term);
    });
  });

  readonly activitiesByResource = computed(() => {
    const source = this.activitiesSignal();
    const map = new Map<string, PreparedActivity[]>();
    source.forEach((activity) => {
      const list = map.get(activity.resourceId);
      if (list) {
        list.push(activity);
      } else {
        map.set(activity.resourceId, [activity]);
      }
    });
    map.forEach((list) => list.sort((a, b) => a.startMs - b.startMs));
    return map;
  });

  readonly rows = computed<GanttDisplayRow[]>(() => {
    const resources = this.filteredResources();
    const groups = this.buildGroups(resources);
    const expanded = this.expandedGroups();
    const rows: GanttDisplayRow[] = [];
    let resourceIndex = 0;

    const selectedIds = this.selectedActivityIdsSignal();
    const timelineData = this.viewportReady()
      ? this.buildTimelineData(resources, selectedIds)
      : new Map<string, { bars: GanttBar[]; services: GanttServiceRange[] }>();

    groups.forEach((group) => {
      const isExpanded = expanded.has(group.id);
      rows.push({
        kind: 'group',
        id: group.id,
        label: group.label,
        icon: group.icon,
        category: group.category,
        resourceIds: group.resources.map((resource) => resource.id),
        resourceCount: group.resources.length,
        expanded: isExpanded,
      });

      if (!isExpanded) {
        return;
      }

      group.resources.forEach((resource) => {
        const data = timelineData.get(resource.id) ?? { bars: [], services: [] };
        const zebra = resourceIndex % 2 === 1;
        resourceIndex += 1;
        rows.push({
          kind: 'resource',
          id: resource.id,
          resource,
          bars: data.bars,
          services: data.services,
          groupId: group.id,
          zebra,
        });
      });
    });

    return rows;
  });

  readonly ticks = computed(() => {
    if (!this.viewportReady() || !this.timeScale.hasTimelineRange()) {
      return [];
    }
    return this.timeScale.getTicks(this.viewport.viewStart(), this.viewport.viewEnd());
  });

  readonly tickBackgroundSegments = computed<GanttBackgroundSegment[]>(() => {
    if (!this.viewportReady() || !this.timeScale.hasTimelineRange()) {
      return [];
    }
    const segments: GanttBackgroundSegment[] = [];
    this.ticks().forEach((tick) => {
      if (tick.widthPx <= 0) {
        return;
      }
      const classes = ['gantt-timeline-row__background--tick'];
      classes.push(
        tick.index % 2 === 1
          ? 'gantt-timeline-row__background--tick-alt'
          : 'gantt-timeline-row__background--tick-base',
      );
      if (tick.isMajor) {
        classes.push('gantt-timeline-row__background--tick-major');
      }
      segments.push({
        left: tick.offsetPx,
        width: tick.widthPx,
        cssClass: classes.join(' '),
      });
    });
    return segments;
  });

  readonly contentWidth = computed(() =>
    this.viewportReady() && this.timeScale.hasTimelineRange()
      ? this.timeScale.contentWidth()
      : 0,
  );
  readonly scrollX = computed(() => (this.viewportReady() ? this.viewport.scrollX() : 0));

  readonly viewRangeLabel = computed(() => {
    if (!this.viewportReady()) {
      return '';
    }
    const start = this.viewport.viewStart();
    const end = this.inclusiveViewEnd(start);
    return `${this.rangeFormatter.format(start)} – ${this.rangeFormatter.format(end)}`;
  });

  readonly viewStart = computed(() => (this.viewportReady() ? this.viewport.viewStart() : new Date()));
  readonly viewEnd = computed(() => (this.viewportReady() ? this.viewport.viewEnd() : new Date()));
  readonly viewDisplayEnd = computed(() => {
    if (!this.viewportReady()) {
      return new Date();
    }
    return this.inclusiveViewEnd(this.viewport.viewStart());
  });
  readonly zoomLevel = computed<ZoomLevel>(() => (this.viewportReady() ? this.viewport.zoomLevel() : 'week'));
  readonly resourceCount = computed(() => this.resourcesSignal().length);

  readonly nowMarkerLeft = computed(() => {
    if (!this.viewportReady()) {
      return null;
    }
    const now = Date.now();
    const start = this.timeScale.timeToPx(now);
    const timelineStart = this.timeScale.timeToPx(this.viewport.viewStart());
    const timelineEnd = this.timeScale.timeToPx(this.viewport.viewEnd());
    if (now < this.viewport.viewStart().getTime() || now > this.viewport.viewEnd().getTime()) {
      return null;
    }
    return start;
  });

  readonly weekendSegments = computed<GanttBackgroundSegment[]>(() =>
    this.viewportReady()
      ? this.ticks()
          .filter((tick) => tick.isWeekend && tick.widthPx > 0)
          .map((tick) => ({
            left: tick.offsetPx,
            width: tick.widthPx,
            cssClass: 'gantt-timeline-row__background--weekend',
          }))
      : [],
  );

  readonly timelineBackgroundSegments = computed(() => [
    ...this.weekendSegments(),
    ...this.tickBackgroundSegments(),
  ]);

  readonly visibleResourceCount = computed(() =>
    this.rows().reduce((count, row) => (row.kind === 'resource' ? count + 1 : count), 0),
  );
  readonly visibleActivityCount = computed(() =>
    this.rows().reduce(
      (sum, row) => (row.kind === 'resource' ? sum + row.bars.length : sum),
      0,
    ),
  );
  readonly totalActivityCount = computed(() => this.activitiesSignal().length);
  readonly cursorTime = computed(() => this.cursorTimeSignal());
  readonly filterText = computed(() => this.filterTerm());
  readonly hasRows = computed(() => this.rows().length > 0);
  readonly isViewportReady = computed(() => this.viewportReady());

  rowScrollerElements(): HTMLElement[] {
    return this.rowScrollerDirs
      ? this.rowScrollerDirs.toArray().map((dir) => dir.element)
      : [];
  }

  headerScrollerTargets(): HTMLElement[] | null {
    const element = this.headerScrollerDir?.element ?? null;
    return element ? [element] : null;
  }

  private readonly rangeFormatter = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  private readonly serviceLabelFormatter = new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });

  ngAfterViewInit(): void {
    this.setupScrollSyncEffects();
    if (this.rowScrollerDirs) {
      queueMicrotask(() => {
        const scrollLeft = this.scrollX();
        this.rowScrollerDirs?.forEach((dir) => dir.setScrollLeft(scrollLeft));
      });
      this.rowScrollerDirs.changes
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          const scrollLeft = this.scrollX();
          this.rowScrollerDirs?.forEach((dir) => dir.setScrollLeft(scrollLeft));
        });
    }
  }

  onZoomIn() {
    if (!this.viewportReady()) {
      return;
    }
    this.viewport.zoomIn(this.viewport.viewCenter());
    this.syncTimeScaleToViewport();
  }

  onZoomOut() {
    if (!this.viewportReady()) {
      return;
    }
    this.viewport.zoomOut(this.viewport.viewCenter());
    this.syncTimeScaleToViewport();
  }

  onZoomLevelChange(level: ZoomLevel) {
    if (!this.viewportReady()) {
      return;
    }
    this.viewport.setZoom(level, this.viewport.viewCenter());
    this.syncTimeScaleToViewport();
  }

  onFilterChange(value: string) {
    this.filterTerm.set(value);
  }

  onGotoToday() {
    if (!this.viewportReady()) {
      return;
    }
    this.viewport.gotoToday();
  }

  onGotoDate(date: Date) {
    if (!this.viewportReady()) {
      return;
    }
    this.viewport.goto(date);
  }

  onTimelineScroll(scrollLeft: number) {
    if (!this.viewportReady()) {
      return;
    }
    this.viewport.setScrollPx(scrollLeft);
  }

  onTimelineWheel(event: WheelEvent, container?: HTMLElement | null) {
    if (!this.viewportReady()) {
      return;
    }
    if (event.ctrlKey) {
      event.preventDefault();
      const focus = this.getPointerTime(
        event.clientX,
        container ?? this.headerScrollerDir?.element ?? null,
      );
      if (event.deltaY < 0) {
        this.viewport.zoomIn(focus);
      } else {
        this.viewport.zoomOut(focus);
      }
      this.syncTimeScaleToViewport();
      return;
    }
    if (event.shiftKey) {
      event.preventDefault();
      const delta = event.deltaY;
      this.viewport.scrollBy(delta);
      return;
    }
  }

  onTimelinePointerDown(event: PointerEvent, container?: HTMLElement | null) {
    if (!this.viewportReady() || !this.isTouchPointer(event)) {
      return;
    }
    const host = container ?? (event.currentTarget as HTMLElement | null);
    if (!host) {
      return;
    }
    this.touchPointerContainer = host;
    host.setPointerCapture?.(event.pointerId);
    this.activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.activeTouchPointers.size === 1) {
      this.touchPanLastX = event.clientX;
      this.pinchReferenceDistance = null;
    } else if (this.activeTouchPointers.size === 2) {
      this.touchPanLastX = null;
      this.pinchReferenceDistance = this.computePointerDistance();
    }
    event.preventDefault();
  }

  onTimelinePointerMove(event: PointerEvent) {
    if (!this.viewportReady() || !this.isTouchPointer(event)) {
      return;
    }
    if (!this.activeTouchPointers.has(event.pointerId)) {
      return;
    }
    this.activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.activeTouchPointers.size === 1 && this.touchPanLastX !== null) {
      const deltaX = event.clientX - this.touchPanLastX;
      if (Math.abs(deltaX) > 0.5) {
        this.viewport.scrollBy(-deltaX);
        this.touchPanLastX = event.clientX;
      }
      event.preventDefault();
      return;
    }
    if (this.activeTouchPointers.size >= 2) {
      const distance = this.computePointerDistance();
      if (distance && this.pinchReferenceDistance) {
        const scale = distance / this.pinchReferenceDistance;
        if (Math.abs(Math.log(scale)) >= this.pinchLogThreshold) {
          const midpointX = this.computePointerMidpointX();
          const focus = this.getPointerTime(midpointX, this.touchPointerContainer);
          if (scale > 1) {
            this.viewport.zoomIn(focus);
          } else {
            this.viewport.zoomOut(focus);
          }
          this.syncTimeScaleToViewport();
          this.pinchReferenceDistance = distance;
        }
      } else {
        this.pinchReferenceDistance = distance;
      }
      event.preventDefault();
    }
  }

  onTimelinePointerUp(event: PointerEvent) {
    if (!this.isTouchPointer(event)) {
      return;
    }
    if (this.activeTouchPointers.has(event.pointerId)) {
      this.activeTouchPointers.delete(event.pointerId);
    }
    const target = (event.currentTarget as HTMLElement | null) ?? this.touchPointerContainer;
    target?.hasPointerCapture?.(event.pointerId) && target.releasePointerCapture(event.pointerId);
    if (this.activeTouchPointers.size === 0) {
      this.touchPanLastX = null;
      this.touchPointerContainer = null;
    } else if (this.activeTouchPointers.size === 1) {
      const remaining = Array.from(this.activeTouchPointers.values())[0];
      this.touchPanLastX = remaining.x;
    }
    if (this.activeTouchPointers.size < 2) {
      this.pinchReferenceDistance = null;
    }
  }

  onTimelineMouseMove(event: MouseEvent, container?: HTMLElement) {
    if (!this.viewportReady()) {
      return;
    }
    const cursorTime = this.getPointerTime(event.clientX, container ?? (event.currentTarget as HTMLElement | null));
    this.cursorTimeSignal.set(cursorTime);
  }

  onTimelineMouseLeave() {
    this.cursorTimeSignal.set(null);
  }

  onGroupToggle(groupId: string) {
    const next = new Set(this.expandedGroups());
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    this.expandedGroups.set(next);
  }

  onResourceRemove(resourceId: string) {
    this.removeResource.emit(resourceId);
  }

  onResourceViewModeChange(resourceId: string, mode: 'block' | 'detail') {
    this.resourceViewModeChange.emit({ resourceId, mode });
  }

  onServiceAssignRequest(resource: Resource) {
    this.serviceAssignmentRequested.emit(resource);
  }

  onTimelineCellClick(event: MouseEvent, resource: Resource, container?: HTMLElement | null) {
    if (!this.viewportReady()) {
      return;
    }
    const target = container ?? (event.currentTarget as HTMLElement | null) ?? null;
    const start = this.getPointerTime(event.clientX, target);
    this.activityCreateRequested.emit({ resource, start });
  }

  onActivitySelected(resource: Resource, activity: Activity) {
    this.activityEditRequested.emit({ resource, activity });
  }

  onActivitySelectionToggle(resource: Resource, activity: Activity) {
    this.activitySelectionToggle.emit({ resource, activity });
  }

  @HostListener('window:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent) {
    if (!this.viewportReady()) {
      return;
    }
    const active = (document.activeElement ?? null) as HTMLElement | null;
    if (active && !this.hostElement.nativeElement.contains(active)) {
      return;
    }
    if (active && ['INPUT', 'TEXTAREA'].includes(active.tagName)) {
      return;
    }
    switch (event.key) {
      case 'h':
      case 'H':
        event.preventDefault();
        this.onGotoToday();
        break;
      case '+':
      case '=':
        event.preventDefault();
        this.viewport.zoomIn(this.viewport.viewCenter());
        this.syncTimeScaleToViewport();
        break;
      case '-':
      case '_':
        event.preventDefault();
        this.viewport.zoomOut(this.viewport.viewCenter());
        this.syncTimeScaleToViewport();
        break;
      default:
        break;
    }
  }

  private initializeViewport(start: Date, end: Date) {
    if (this.viewportInitialized) {
      return;
    }
    this.timeScale.setTimelineRange(start, end);
    this.viewport = createTimeViewport({
      timelineStart: start,
      timelineEnd: end,
      initialZoom: 'week',
      initialCenter: start,
    });
    this.viewportInitialized = true;
    this.syncTimeScaleToViewport();
    this.viewportReady.set(true);
  }

  private resetViewport(start: Date, end: Date) {
    const previousZoom = this.viewport?.zoomLevel() ?? 'week';
    const previousCenter = this.viewport?.viewCenter() ?? start;
    this.viewportReady.set(false);
    this.timeScale.setTimelineRange(start, end);
    this.viewport = createTimeViewport({
      timelineStart: start,
      timelineEnd: end,
      initialZoom: previousZoom,
      initialCenter: this.clampCenter(previousCenter, start, end),
    });
    this.syncTimeScaleToViewport();
    this.viewportReady.set(true);
  }

  private setupScrollSyncEffects() {
    runInInjectionContext(this.injector, () => {
      effect(() => {
        if (!this.viewportReady()) {
          return;
        }
        const scrollLeft = this.scrollX();
        this.headerScrollerDir?.setScrollLeft(scrollLeft);
        this.rowScrollerDirs?.forEach((dir) => dir.setScrollLeft(scrollLeft));
      }, { allowSignalWrites: true });
    });
  }

  private getPointerTime(clientX: number, container: HTMLElement | null): Date {
    if (!container) {
      return this.viewport.viewCenter();
    }
    const rect = container.getBoundingClientRect();
    const relativeX = clientX - rect.left + container.scrollLeft;
    return this.timeScale.pxToTime(relativeX);
  }

  private inclusiveViewEnd(viewStart: Date): Date {
    const startMs = viewStart.getTime();
    const exclusiveEnd = this.viewport.viewEnd();
    const exclusiveMs = exclusiveEnd.getTime();
    const inclusiveMs = Math.max(startMs, exclusiveMs - 1);
    return new Date(inclusiveMs);
  }

  private buildTimelineData(
    resources: Resource[],
    selectedIds: ReadonlySet<string>,
  ): Map<string, { bars: GanttBar[]; services: GanttServiceRange[] }> {
    const map = new Map<string, { bars: GanttBar[]; services: GanttServiceRange[] }>();
    if (!this.viewportReady()) {
      resources.forEach((resource) => map.set(resource.id, { bars: [], services: [] }));
      return map;
    }

    const start = this.viewport.viewStart();
    const end = this.viewport.viewEnd();
    const startMs = start.getTime();
    const endMs = end.getTime();
    const pxPerMs = this.timeScale.pixelsPerMs();

    resources.forEach((resource) => {
      const list = this.activitiesByResource().get(resource.id) ?? [];
      const bars: GanttBar[] = [];
      const serviceMap = new Map<
        string,
        { id: string; left: number; right: number; startMs: number; endMs: number }
      >();
      for (const activity of list) {
        if (activity.endMs < startMs - 2 * 60 * 60 * 1000 || activity.startMs > endMs + 2 * 60 * 60 * 1000) {
          continue;
        }
        const rawLeft = this.timeScale.timeToPx(activity.startMs);
        const rawRight = this.timeScale.timeToPx(activity.endMs);
        const left = Math.round(rawLeft);
        const right = Math.round(rawRight);
        const width = Math.max(1, right - left);
        bars.push({
          activity,
          left,
          width,
          classes: this.resolveBarClasses(activity),
          selected: selectedIds.has(activity.id),
        });
        const serviceId = activity.serviceId;
        if (!serviceId) {
          continue;
        }
        const existing = serviceMap.get(serviceId);
        if (existing) {
          existing.left = Math.min(existing.left, left);
          existing.right = Math.max(existing.right, right);
          existing.startMs = Math.min(existing.startMs, activity.startMs);
          existing.endMs = Math.max(existing.endMs, activity.endMs);
        } else {
          serviceMap.set(serviceId, {
            id: serviceId,
            left,
            right,
            startMs: activity.startMs,
            endMs: activity.endMs,
          });
        }
      }
      const services = Array.from(serviceMap.values()).map((entry) => ({
        id: entry.id,
        label: `Dienst ${this.serviceLabelFormatter.format(new Date(entry.startMs))} – ${this.serviceLabelFormatter.format(new Date(entry.endMs))}`,
        left: entry.left,
        width: Math.max(1, entry.right - entry.left),
      }));
      map.set(resource.id, { bars, services });
    });

    return map;
  }

  private buildGroups(resources: Resource[]): GanttGroupDefinition[] {
    const groups = new Map<string, GanttGroupDefinition>();
    resources.forEach((resource) => {
      const category = this.resolveCategory(resource);
      const poolId = this.resolvePoolId(resource);
      const poolName = this.resolvePoolName(resource);
      const groupId = this.groupIdForParts(category, poolId);
      const label = poolName ?? this.defaultGroupLabel(category, poolId);
      const icon = this.iconForCategory(category);
      const existing = groups.get(groupId);
      if (existing) {
        existing.resources.push(resource);
      } else {
        groups.set(groupId, {
          id: groupId,
          label,
          icon,
          category,
          resources: [resource],
        });
      }
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        resources: [...group.resources].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => {
        const categoryDiff = this.categorySortKey(a.category) - this.categorySortKey(b.category);
        if (categoryDiff !== 0) {
          return categoryDiff;
        }
        return a.label.localeCompare(b.label);
      });
  }

  private resolveCategory(resource: Resource): string | null {
    const attributes = resource.attributes as Record<string, unknown> | undefined;
    const category = attributes?.['category'];
    return typeof category === 'string' ? category : null;
  }

  private resolvePoolId(resource: Resource): string | null {
    const attributes = resource.attributes as Record<string, unknown> | undefined;
    const poolId = attributes?.['poolId'];
    return typeof poolId === 'string' ? poolId : null;
  }

  private resolvePoolName(resource: Resource): string | null {
    const attributes = resource.attributes as Record<string, unknown> | undefined;
    const poolName = attributes?.['poolName'];
    return typeof poolName === 'string' && poolName.length > 0 ? poolName : null;
  }

  private groupIdForParts(category: string | null, poolId: string | null): string {
    return `${category ?? 'uncategorized'}|${poolId ?? 'none'}`;
  }

  private iconForCategory(category: string | null): string {
    switch (category) {
      case 'vehicle-service':
        return 'route';
      case 'personnel-service':
        return 'badge';
      case 'vehicle':
        return 'directions_transit';
      case 'personnel':
        return 'groups';
      default:
        return 'inventory_2';
    }
  }

  private defaultGroupLabel(category: string | null, poolId: string | null): string {
    switch (category) {
      case 'vehicle-service':
        return poolId ? `Fahrzeugdienst-Pool ${poolId}` : 'Fahrzeugdienste';
      case 'personnel-service':
        return poolId ? `Personaldienst-Pool ${poolId}` : 'Personaldienste';
      case 'vehicle':
        return poolId ? `Fahrzeugpool ${poolId}` : 'Fahrzeuge';
      case 'personnel':
        return poolId ? `Personalpool ${poolId}` : 'Personal';
      default:
        return 'Weitere Ressourcen';
    }
  }

  private resetExpandedGroups(_resources: Resource[]): void {
    this.expandedGroups.set(new Set());
  }

  resourceViewMode(resourceId: string): 'block' | 'detail' {
    return this.resourceViewModes?.[resourceId] ?? 'detail';
  }

  private computePointerDistance(): number {
    const points = Array.from(this.activeTouchPointers.values());
    if (points.length < 2) {
      return 0;
    }
    const [a, b] = points;
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  private computePointerMidpointX(): number {
    if (this.activeTouchPointers.size === 0) {
      return this.touchPointerContainer
        ? this.touchPointerContainer.getBoundingClientRect().left + this.touchPointerContainer.clientWidth / 2
        : 0;
    }
    const total = Array.from(this.activeTouchPointers.values()).reduce((sum, point) => sum + point.x, 0);
    return total / this.activeTouchPointers.size;
  }

  private isTouchPointer(event: PointerEvent): boolean {
    return event.pointerType === 'touch' || event.pointerType === 'pen';
  }

  private syncTimeScaleToViewport(): void {
    if (!this.viewport) {
      return;
    }
    const desiredZoom = this.viewport.zoomLevel();
    if (this.timeScale.zoomLevel() !== desiredZoom) {
      this.timeScale.setZoomLevel(desiredZoom);
    }
    this.viewport.setPixelsPerMs(this.timeScale.pixelsPerMs());
  }

  private categorySortKey(category: string | null): number {
    switch (category) {
      case 'vehicle-service':
        return 0;
      case 'personnel-service':
        return 1;
      case 'vehicle':
        return 2;
      case 'personnel':
        return 3;
      default:
        return 99;
    }
  }

  private clampCenter(center: Date, start: Date, end: Date): Date {
    const startMs = start.getTime();
    const endMs = end.getTime();
    const value = center.getTime();
    if (value <= startMs) {
      return new Date(start);
    }
    if (value >= endMs) {
      return new Date(end);
    }
    return new Date(center);
  }

  private resolveBarClasses(activity: PreparedActivity): string[] {
    const classes: string[] = [];
    if (activity.serviceId) {
      classes.push('gantt-activity--within-service');
      if (activity.serviceRole === 'start') {
        classes.push('gantt-activity--service-boundary', 'gantt-activity--service-boundary-start');
      } else if (activity.serviceRole === 'end') {
        classes.push('gantt-activity--service-boundary', 'gantt-activity--service-boundary-end');
      }
    } else {
      classes.push('gantt-activity--outside-service');
    }
    return classes;
  }

}
