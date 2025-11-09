import { Routes } from '@angular/router';
import { OrderListComponent } from './features/orders/order-list/order-list.component';
import { BusinessListComponent } from './features/business/business-list.component';
import { TrainPlanListComponent } from './features/train-plans/train-plan-list.component';
import { TemplatesPageComponent } from './features/templates/templates-page.component';
import { MasterDataLandingComponent } from './features/master-data/master-data-landing.component';
import { CustomAttributeSettingsComponent } from './features/settings/custom-attribute-settings.component';
import { TimetableManagerComponent } from './features/timetable-manager/timetable-manager.component';
import { CustomerListComponent } from './features/customers/customer-list.component';

export const routes: Routes = [
  {
    path: '',
    component: OrderListComponent,
    title: 'Aufträge',
    data: { section: 'manager' },
  },
  {
    path: 'businesses',
    component: BusinessListComponent,
    title: 'Geschäfte',
    data: { section: 'manager' },
  },
  {
    path: 'customers',
    component: CustomerListComponent,
    title: 'Kunden',
    data: { section: 'manager' },
  },
  {
    path: 'templates',
    component: TemplatesPageComponent,
    title: 'Vorlagen',
    data: { section: 'manager' },
  },
  {
    path: 'fahrplanmanager',
    component: TimetableManagerComponent,
    title: 'Fahrplanmanager',
    data: { section: 'manager' },
  },
  {
    path: 'plans',
    component: TrainPlanListComponent,
    title: 'Fahrpläne',
    data: { section: 'manager' },
  },
  {
    path: 'planning',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/planning/planning-dashboard.component').then(
            (m) => m.PlanningDashboardComponent,
          ),
        title: 'Planung',
        data: { section: 'planning' },
      },
      {
        path: 'external',
        loadComponent: () =>
          import('./features/planning/planning-external-board.component').then(
            (m) => m.PlanningExternalBoardComponent,
          ),
        title: 'Planung',
        data: { section: 'planning' },
      },
    ],
  },
  {
    path: 'master-data',
    component: MasterDataLandingComponent,
    title: 'Stammdaten',
    data: { section: 'master-data' },
  },
  {
    path: 'settings',
    component: CustomAttributeSettingsComponent,
    title: 'Einstellungen',
    data: { section: 'settings' },
  },
  {
    path: 'master',
    redirectTo: 'master-data',
  },
  {
    path: 'legacy-master',
    redirectTo: 'master-data',
  },
  { path: '**', redirectTo: '' },
];
