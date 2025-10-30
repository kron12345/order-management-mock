import { Resource } from '../models/resource';

export const DEMO_RESOURCES: Resource[] = Array.from({ length: 30 }, (_, index) => {
  const id = `R-${(index + 1).toString().padStart(3, '0')}`;
  return {
    id,
    name: `Fahrzeug ${id}`,
    attributes: {
      type: index % 3 === 0 ? 'Regionalzug' : index % 3 === 1 ? 'IC' : 'Güterzug',
      depot: ['Berlin', 'Hamburg', 'Rostock'][index % 3],
    },
  };
});

