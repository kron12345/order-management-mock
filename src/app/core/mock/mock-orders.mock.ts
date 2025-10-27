import { Order } from '../models/order.model';

export const MOCK_ORDERS: Order[] = [
  {
    id: 'A-2025-0001',
    name: 'S-Bahn Olten–Basel',
    customer: 'SOB',
    status: 'in_progress',
    tags: ['S-Bahn', 'Quartal Q4', 'Prio hoch'],
    comment: 'Deep-Link zu Geschäft #G-114 und Vorlage #TPL-77',
    linkedBusinessId: 'G-114',
    linkedTemplateId: 'TPL-77',
    items: [
      {
        id: 'A-2025-0001-OP-001',
        name: 'Zug 1 / 00:00',
        type: 'TTT',
        start: '2025-10-27T00:00:00',
        end: '2025-10-27T00:45:00',
        responsible: 'Team Nord',
      },
      {
        id: 'A-2025-0001-OP-002',
        name: 'Zug 2 / 00:15',
        type: 'TTT',
        start: '2025-10-27T00:15:00',
        end: '2025-10-27T01:00:00',
        responsible: 'Team Nord',
        deviation: '+3 min',
      },
    ],
  },
  {
    id: 'A-2025-0002',
    name: 'RE Zürich–Bern',
    customer: 'SBB',
    status: 'open',
    tags: ['RE', 'Neu'],
    items: [],
  },
];
