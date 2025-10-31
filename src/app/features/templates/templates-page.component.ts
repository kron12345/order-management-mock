import { Component, computed, effect, inject, signal } from '@angular/core';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import { ScheduleTemplateListComponent } from '../schedule-templates/schedule-template-list.component';
import { TrafficPeriodListComponent } from '../traffic-periods/traffic-period-list.component';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-templates-page',
  standalone: true,
  imports: [...MATERIAL_IMPORTS, ScheduleTemplateListComponent, TrafficPeriodListComponent],
  templateUrl: './templates-page.component.html',
  styleUrl: './templates-page.component.scss',
})
export class TemplatesPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly selectedTabIndex = signal(0);
  private readonly templateHighlightId = signal<string | null>(null);
  private readonly periodHighlightId = signal<string | null>(null);

  readonly selectedIndex = computed(() => this.selectedTabIndex());
  readonly templateHighlight = computed(() => this.templateHighlightId());
  readonly periodHighlight = computed(() => this.periodHighlightId());

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const tab = params.get('tab');
        this.selectedTabIndex.set(tab === 'traffic-periods' ? 1 : 0);
        this.templateHighlightId.set(params.get('highlightTemplate'));
        this.periodHighlightId.set(params.get('highlightPeriod'));
      });

    effect(() => {
      const highlight = this.templateHighlight();
      if (!highlight) {
        return;
      }
      window.setTimeout(() => {
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { highlightTemplate: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }, 2000);
    });

    effect(() => {
      const highlight = this.periodHighlight();
      if (!highlight) {
        return;
      }
      window.setTimeout(() => {
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { highlightPeriod: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }, 2000);
    });
  }

  onTabChange(index: number) {
    this.selectedTabIndex.set(index);
    const tab = index === 1 ? 'traffic-periods' : 'templates';
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
