import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Injector,
  Input,
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
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
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

interface GanttRow {
  resource: Resource;
  bars: GanttBar[];
  services: GanttServiceRange[];
}

const ROW_HEIGHT = 64;
const ZOOM_LEVELS: ZoomLevel[] = ['month', 'week', 'day', 'hour', '15min'];

@Component({
  selector: 'app-gantt',
  standalone: true,
  imports: [
    CommonModule,
    ScrollingModule,
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
  private viewportResizeObserver: ResizeObserver | null = null;
  private lastScrollbarWidth = -1;

  private viewport!: TimeViewport;
  private viewportInitialized = false;

  private readonly resourcesSignal = signal<Resource[]>([]);
  private readonly activitiesSignal = signal<PreparedActivity[]>([]);
  private readonly filterTerm = signal('');
  private readonly cursorTimeSignal = signal<Date | null>(null);
  private readonly viewportReady = signal(false);

  @ViewChild('headerScroller', { read: TrackHorizontalScrollDirective })
  private headerScrollerDir?: TrackHorizontalScrollDirective;

  @ViewChildren('rowScroller', { read: TrackHorizontalScrollDirective })
  private rowScrollerDirs?: QueryList<TrackHorizontalScrollDirective>;

  @ViewChild(CdkVirtualScrollViewport)
  private virtualViewport?: CdkVirtualScrollViewport;

  @Input({ required: true })
  set resources(value: Resource[]) {
    this.resourcesSignal.set(value ?? []);
  }

  @Input({ required: true })
  set activities(value: Activity[]) {
    const prepared = (value ?? []).map((activity) => ({
      ...activity,
      startMs: new Date(activity.start).getTime(),
      endMs: new Date(activity.end).getTime(),
    }));
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
    this.initializeViewport(normalizedStart, normalizedEnd);
  }

  readonly zoomLevels = ZOOM_LEVELS;
  readonly rowHeight = ROW_HEIGHT;

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

  readonly rows = computed<GanttRow[]>(() => {
    if (!this.viewportReady()) {
      return [];
    }
    const start = this.viewport.viewStart();
    const end = this.viewport.viewEnd();
    const visible: GanttRow[] = [];
    const startMs = start.getTime();
    const endMs = end.getTime();
    const pxPerMs = this.timeScale.pixelsPerMs();

    this.filteredResources().forEach((resource) => {
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
        });
        const serviceId = activity.serviceId;
        if (serviceId) {
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
      }
      const services = Array.from(serviceMap.values()).map((entry) => ({
        id: entry.id,
        label: `Dienst ${this.serviceLabelFormatter.format(new Date(entry.startMs))} – ${this.serviceLabelFormatter.format(new Date(entry.endMs))}`,
        left: entry.left,
        width: Math.max(1, entry.right - entry.left),
      }));
      visible.push({ resource, bars, services });
    });

    return visible;
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

  readonly visibleResourceCount = computed(() => this.filteredResources().length);
  readonly visibleActivityCount = computed(() =>
    this.rows().reduce((sum, row) => sum + row.bars.length, 0),
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
    this.setupViewportScrollbarObserver();
    if (this.rowScrollerDirs) {
      queueMicrotask(() => {
        const scrollLeft = this.scrollX();
        this.rowScrollerDirs?.forEach((dir) => dir.setScrollLeft(scrollLeft));
        this.updateScrollbarCompensation();
      });
      this.rowScrollerDirs.changes
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          const scrollLeft = this.scrollX();
          this.rowScrollerDirs?.forEach((dir) => dir.setScrollLeft(scrollLeft));
          queueMicrotask(() => this.updateScrollbarCompensation());
        });
    }
  }

  trackResource(_: number, row: GanttRow) {
    return row.resource.id;
  }

  onZoomIn() {
    if (!this.viewportReady()) {
      return;
    }
    this.viewport.zoomIn(this.viewport.viewCenter());
  }

  onZoomOut() {
    if (!this.viewportReady()) {
      return;
    }
    this.viewport.zoomOut(this.viewport.viewCenter());
  }

  onZoomLevelChange(level: ZoomLevel) {
    if (!this.viewportReady()) {
      return;
    }
    this.viewport.setZoom(level, this.viewport.viewCenter());
  }

  onFilterChange(value: string) {
    this.filterTerm.set(value);
    this.virtualViewport?.checkViewportSize();
  }

  onGotoToday() {
    if (!this.viewportReady()) {
      return;
    }
    this.viewport.gotoToday();
    this.scrollViewportToCurrent();
  }

  onGotoDate(date: Date) {
    if (!this.viewportReady()) {
      return;
    }
    this.viewport.goto(date);
    this.scrollViewportToCurrent();
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
      return;
    }
    if (event.shiftKey) {
      event.preventDefault();
      const delta = event.deltaY;
      this.viewport.scrollBy(delta);
      return;
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
        break;
      case '-':
      case '_':
        event.preventDefault();
        this.viewport.zoomOut(this.viewport.viewCenter());
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
    this.viewport.setPixelsPerMs(this.timeScale.pixelsPerMs());
    this.viewportInitialized = true;
    this.viewportReady.set(true);
    this.registerViewportReactions();
  }

  private registerViewportReactions() {
    runInInjectionContext(this.injector, () => {
      effect(
        () => {
          if (!this.viewportReady()) {
            return;
          }
          this.timeScale.setZoomLevel(this.viewport.zoomLevel());
          this.viewport.setPixelsPerMs(this.timeScale.pixelsPerMs());
        },
        { allowSignalWrites: true },
      );
    });
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

  private setupViewportScrollbarObserver() {
    const viewportElement = this.virtualViewport?.elementRef.nativeElement ?? null;
    if (!viewportElement) {
      return;
    }

    this.updateScrollbarCompensation();
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(() => this.updateScrollbarCompensation());
    }

    if (typeof ResizeObserver !== 'undefined') {
      this.viewportResizeObserver = new ResizeObserver(() => this.updateScrollbarCompensation());
      this.viewportResizeObserver.observe(viewportElement);
      const headerElement = this.headerScrollerDir?.element ?? null;
      if (headerElement) {
        this.viewportResizeObserver.observe(headerElement);
      }
      this.destroyRef.onDestroy(() => this.viewportResizeObserver?.disconnect());
    } else if (typeof window !== 'undefined') {
      const onResize = () => this.updateScrollbarCompensation();
      window.addEventListener('resize', onResize);
      this.destroyRef.onDestroy(() => window.removeEventListener('resize', onResize));
    }
  }

  private updateScrollbarCompensation() {
    const viewportElement = this.virtualViewport?.elementRef.nativeElement ?? null;
    const headerElement = this.headerScrollerDir?.element ?? null;
    const firstRowElement = this.rowScrollerDirs?.first?.element ?? null;
    let width = 0;

    if (viewportElement) {
      width = Math.max(width, viewportElement.offsetWidth - viewportElement.clientWidth);
    }
    if (headerElement && firstRowElement) {
      const diff = headerElement.clientWidth - firstRowElement.clientWidth;
      width = Math.max(width, diff > 0 ? diff : 0);
    }

    const roundedWidth = Math.round(width);
    if (roundedWidth !== this.lastScrollbarWidth) {
      this.lastScrollbarWidth = roundedWidth;
      this.hostElement.nativeElement.style.setProperty(
        '--gantt-scrollbar-width',
        `${roundedWidth}px`,
      );
    }
  }

  private scrollViewportToCurrent() {
    this.virtualViewport?.checkViewportSize();
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
