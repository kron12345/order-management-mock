import { Routes } from '@angular/router';
import { OrderListComponent } from './features/orders/order-list/order-list.component';

export const routes: Routes = [
  { path: '', component: OrderListComponent, title: 'Aufträge' },
];
