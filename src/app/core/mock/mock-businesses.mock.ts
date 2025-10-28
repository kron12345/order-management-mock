import { Business } from '../models/business.model';

export const MOCK_BUSINESSES: Business[] = [
  {
    id: 'G-114',
    title: 'Abstimmung mit Planung',
    description:
      'Termin mit der Planungsgruppe vereinbaren, um die Anpassungen der Fahrzeiten zu bestätigen.',
    createdAt: '2025-10-20T09:15:00',
    dueDate: '2025-10-27T12:00:00',
    status: 'in_arbeit',
    assignment: {
      type: 'group',
      name: 'Planung',
    },
    documents: [
      {
        id: 'DOC-001',
        name: 'Fahrplanentwurf.pdf',
        url: '#',
      },
    ],
    linkedOrderItemIds: ['A-2025-0001-OP-001', 'A-2025-0001-OP-002'],
  },
  {
    id: 'G-207',
    title: 'Abnahme mit Kunden',
    description:
      'Offene Punkte mit dem Kunden klären und finales Feedback dokumentieren.',
    createdAt: '2025-10-18T08:00:00',
    dueDate: '2025-10-28T17:00:00',
    status: 'neu',
    assignment: {
      type: 'person',
      name: 'Laura Steiner',
    },
    documents: [
      {
        id: 'DOC-010',
        name: 'Fragenkatalog.docx',
        url: '#',
      },
      {
        id: 'DOC-011',
        name: 'Meeting-Notizen.txt',
        url: '#',
      },
    ],
    linkedOrderItemIds: ['A-2025-0001-OP-002'],
  },
];
