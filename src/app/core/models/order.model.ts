import { OrderStatus } from './order-status';
import { OrderItem } from './order-item.model';

export interface Order {
  id: string;
  name: string;
  customer?: string;
  status: OrderStatus;
  tags?: string[];
  items: OrderItem[];
  comment?: string;
}
