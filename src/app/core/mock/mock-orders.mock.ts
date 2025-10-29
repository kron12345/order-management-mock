import { Order } from '../models/order.model';

export const MOCK_ORDERS: Order[] = [
  {
    id: 'A-2025-0001',
    name: 'S-Bahn Olten–Basel',
    customer: 'SOB',
    tags: ['S-Bahn', 'Quartal Q4', 'Prio hoch'],
    comment: 'Viele Auftragspositionen sind mit spezifischen Geschäften oder Vorlagen verknüpft.',
    items: [
      {
        id: 'A-2025-0001-OP-001',
        name: 'Zug 1 / 00:00',
        type: 'Fahrplan',
        start: '2025-10-27T00:00:00',
        end: '2025-10-27T00:45:00',
        responsible: 'Team Nord',
        fromLocation: 'Olten',
        toLocation: 'Basel SBB',
        trafficPeriodId: 'TPER-1',
        linkedBusinessIds: ['G-114'],
        linkedTemplateId: 'TPL-77',
        linkedTrainPlanId: 'TP-2025-0001',
      },
      {
        id: 'A-2025-0001-OP-002',
        name: 'Zug 2 / 00:15',
        type: 'Fahrplan',
        start: '2025-10-27T00:15:00',
        end: '2025-10-27T01:00:00',
        responsible: 'Team Nord',
        deviation: '+3 min',
        fromLocation: 'Olten',
        toLocation: 'Basel SBB',
        trafficPeriodId: 'TPER-1',
        linkedBusinessIds: ['G-114', 'G-207'],
        linkedTemplateId: 'TPL-77',
        linkedTrainPlanId: 'TP-2025-0002',
      },
    ],
  },
  {
    id: 'A-2025-0002',
    name: 'RE Zürich–Bern',
    customer: 'SBB',
    tags: ['RE', 'Neu'],
    items: [],
  },
];
