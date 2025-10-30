import { Routes } from '@angular/router';
import { OrderListComponent } from './features/orders/order-list/order-list.component';
import { BusinessListComponent } from './features/business/business-list.component';
import { TrainPlanListComponent } from './features/train-plans/train-plan-list.component';
import { TemplatesPageComponent } from './features/templates/templates-page.component';
import { PlanningDashboardComponent } from './features/planning/planning-dashboard.component';
import { MasterDataLandingComponent } from './features/master-data/master-data-landing.component';

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
    path: 'templates',
    component: TemplatesPageComponent,
    title: 'Vorlagen',
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
    component: PlanningDashboardComponent,
    title: 'Planung',
    data: { section: 'planning' },
  },
  {
    path: 'master-data',
    component: MasterDataLandingComponent,
    title: 'Stammdaten',
    data: { section: 'master-data' },
  },
  { path: '**', redirectTo: '' },
];
