import { Component, computed, effect, inject, signal } from '@angular/core';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import { ScheduleTemplateListComponent } from '../schedule-templates/schedule-template-list.component';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-templates-page',
  standalone: true,
  imports: [...MATERIAL_IMPORTS, ScheduleTemplateListComponent],
  templateUrl: './templates-page.component.html',
  styleUrl: './templates-page.component.scss',
})
export class TemplatesPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly templateHighlightId = signal<string | null>(null);

  readonly templateHighlight = computed(() => this.templateHighlightId());

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.templateHighlightId.set(params.get('highlightTemplate'));
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
  }
}
