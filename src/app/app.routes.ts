import { Routes } from '@angular/router';
import { OrderListComponent } from './features/orders/order-list/order-list.component';
import { BusinessListComponent } from './features/business/business-list.component';
import { TrainPlanListComponent } from './features/train-plans/train-plan-list.component';
import { TemplatesPageComponent } from './features/templates/templates-page.component';

export const routes: Routes = [
  { path: '', component: OrderListComponent, title: 'Aufträge' },
  { path: 'businesses', component: BusinessListComponent, title: 'Geschäfte' },
  {
    path: 'templates',
    component: TemplatesPageComponent,
    title: 'Vorlagen',
  },
  {
    path: 'plans',
    component: TrainPlanListComponent,
    title: 'Fahrpläne',
  },
  { path: '**', redirectTo: '' },
];
