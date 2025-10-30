import { Activity } from '../models/activity';
import { DEMO_RESOURCES } from './demo-resources';
import { clampToFullDayRange } from '../core/utils/time-range';
import { MS_IN_HOUR, addDays, addHours, addMinutes, startOfDay } from '../core/utils/time-math';

const DEPOTS = ['Depot Nord', 'Depot Süd', 'Depot West', 'Depot Ost'];
const LOCATIONS = [
  'Werkstatt A',
  'Werkstatt B',
  'Knoten X',
  'Knoten Y',
  'Hauptbahnhof',
  'ZOB',
  'Flughafen',
  'Logistikzentrum',
  'Rangierbahnhof',
  'Werk R1',
];

const baseDay = addDays(startOfDay(new Date()), -7);

const activities: Activity[] = [];
let minStart = Number.POSITIVE_INFINITY;
let maxEnd = Number.NEGATIVE_INFINITY;

const depotFor = (resourceIndex: number, dayOffset: number) =>
  DEPOTS[(resourceIndex + dayOffset) % DEPOTS.length];

const locationFor = (resourceIndex: number, dayOffset: number, segment: number) =>
  LOCATIONS[(resourceIndex * 7 + dayOffset * 3 + segment * 5) % LOCATIONS.length];

const pushActivity = (activity: Activity) => {
  activities.push(activity);
  const startMs = new Date(activity.start).getTime();
  const endMs = new Date(activity.end).getTime();
  minStart = Math.min(minStart, startMs);
  maxEnd = Math.max(maxEnd, endMs);
};

DEMO_RESOURCES.forEach((resource, resourceIndex) => {
  for (let dayOffset = 0; dayOffset < 30; dayOffset += 1) {
    const dayStart = addDays(baseDay, dayOffset);
    const isRestDay = (resourceIndex + dayOffset) % 11 === 0;
    if (isRestDay) {
      continue;
    }

    const depot = depotFor(resourceIndex, dayOffset);
    const serviceId = `${resource.id}-svc-${dayOffset}`;
    const blockCount = ((resourceIndex + dayOffset) % 3) + 2;
    let cursor = addHours(dayStart, 4 + (resourceIndex % 4));
    let currentLocation = locationFor(resourceIndex, dayOffset, 0);

    const serviceStartDuration = 12 + ((resourceIndex + dayOffset) % 4) * 4;
    const serviceStartEnd = addMinutes(cursor, serviceStartDuration);

    pushActivity({
      id: `${serviceId}-start`,
      resourceId: resource.id,
      title: 'Dienstbeginn',
      start: cursor.toISOString(),
      end: serviceStartEnd.toISOString(),
      type: 'service-start',
      serviceId,
      serviceRole: 'start',
      from: depot,
      to: currentLocation,
    });

    cursor = serviceStartEnd;

    for (let block = 0; block < blockCount; block += 1) {
      const durationMinutes =
        80 + ((resourceIndex * 29 + dayOffset * 17 + block * 41) % 160);
      const start = cursor;
      const end = addMinutes(start, durationMinutes);
      const nextLocation = locationFor(resourceIndex, dayOffset, block + 1);

      pushActivity({
        id: `${serviceId}-seg-${block}`,
        resourceId: resource.id,
        title:
          block === 0
            ? 'Planfahrt'
            : block === blockCount - 1
              ? 'Rückführung'
              : 'Dienstleistung',
        start: start.toISOString(),
        end: end.toISOString(),
        type: block === 1 ? 'break' : block === blockCount - 1 ? 'travel' : 'service',
        serviceId,
        serviceRole: 'segment',
        from: currentLocation,
        to: nextLocation,
      });

      currentLocation = nextLocation;

      const pauseMinutes = block === blockCount - 1 ? 20 : 45;
      cursor = addMinutes(end, pauseMinutes);
    }

    const serviceEndDuration = 15 + ((resourceIndex + dayOffset) % 4) * 5;
    const serviceEndStart = cursor;
    const serviceEndEnd = addMinutes(serviceEndStart, serviceEndDuration);

    pushActivity({
      id: `${serviceId}-end`,
      resourceId: resource.id,
      title: 'Dienstende',
      start: serviceEndStart.toISOString(),
      end: serviceEndEnd.toISOString(),
      type: 'service-end',
      serviceId,
      serviceRole: 'end',
      from: currentLocation,
      to: depot,
    });

    cursor = addMinutes(serviceEndEnd, 10);

    if ((resourceIndex + dayOffset) % 4 === 0) {
      const standbyEnd = addMinutes(cursor, 50 + ((resourceIndex + dayOffset) % 3) * 10);
      pushActivity({
        id: `${serviceId}-standby`,
        resourceId: resource.id,
        title: 'Bereitschaft',
        start: cursor.toISOString(),
        end: standbyEnd.toISOString(),
        type: 'other',
        serviceId: null,
        serviceRole: null,
        from: depot,
        to: depot,
      });
      cursor = standbyEnd;
    }
  }
});

export const DEMO_ACTIVITIES: Activity[] = activities;

const rawStart = new Date(minStart - 6 * MS_IN_HOUR);
const rawEnd = new Date(maxEnd + 6 * MS_IN_HOUR);

export const DEMO_TIME_RANGE = clampToFullDayRange(rawStart, rawEnd);
