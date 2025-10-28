import { Component, inject, signal } from '@angular/core';
import {
  ActivatedRoute,
  ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MATERIAL_IMPORTS } from './core/material.imports.imports';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ...MATERIAL_IMPORTS],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);

  readonly pageTitle = signal('Auftragsmanager');

  constructor() {
    this.updateTitle();
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.updateTitle());
  }

  private updateTitle() {
    const title =
      this.extractTitle(this.activatedRoute.snapshot) ?? 'Auftragsmanager';
    this.pageTitle.set(title);
  }

  private extractTitle(route: ActivatedRouteSnapshot): string | undefined {
    let current: ActivatedRouteSnapshot | null = route;
    let title: string | undefined;
    while (current) {
      if (current.title) {
        title = current.title;
      } else if (current.data && current.data['title']) {
        title = current.data['title'];
      }
      current = current.firstChild ?? null;
    }
    return title;
  }
}
