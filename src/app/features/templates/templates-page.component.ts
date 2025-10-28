import { Component } from '@angular/core';
import { MATERIAL_IMPORTS } from '../../core/material.imports.imports';
import { ScheduleTemplateListComponent } from '../schedule-templates/schedule-template-list.component';
import { TrafficPeriodListComponent } from '../traffic-periods/traffic-period-list.component';

@Component({
  selector: 'app-templates-page',
  standalone: true,
  imports: [...MATERIAL_IMPORTS, ScheduleTemplateListComponent, TrafficPeriodListComponent],
  templateUrl: './templates-page.component.html',
  styleUrl: './templates-page.component.scss',
})
export class TemplatesPageComponent {}
