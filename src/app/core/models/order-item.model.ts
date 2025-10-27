export interface OrderItem {
  id: string;
  name: string;
  type: 'TTT' | 'Fahrzeugsegment' | 'Sonstiges';
  start: string; // ISO
  end: string; // ISO
  responsible?: string;
  deviation?: string;
}
