import { OrderItem } from './order-item.model';

export interface Order {
  id: string;
  name: string;
  customerId?: string;
  customer?: string;
  tags?: string[];
  items: OrderItem[];
  comment?: string;
}
