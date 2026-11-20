import type { BookableSpace } from '#shared/types';

import { db } from '../../../utils/db';
import {
  isValidDateKey,
  OPEN_HOUR,
  CLOSE_HOUR,
  toBookableSpace,
  todayCDMX,
} from '../../../utils/public-booking';

/// GET /api/public/spaces/:id?date=YYYY-MM-DD
/// Devuelve el espacio + intervalos ocupados confirmados para esa fecha.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? '';
  const date = String(getQuery(event).date ?? '');

  const spaceSnap = await db().collection('spaces').doc(id).get();
  if (!spaceSnap.exists) {
    throw createError({ statusCode: 404, statusMessage: 'Espacio no encontrado' });
  }
  const space: BookableSpace = toBookableSpace(spaceSnap);

  let booked: { mode: string; startHour: number | null; endHour: number | null }[] = [];
  if (isValidDateKey(date) && date >= todayCDMX()) {
    const snap = await db()
      .collection('space_bookings')
      .where('space_id', '==', id)
      .where('date', '==', date)
      .where('status', '==', 'confirmed')
      .get();
    booked = snap.docs.map((d) => {
      const b = d.data();
      return {
        mode: b.mode === 'day' ? 'day' : 'hour',
        startHour: b.start_hour ?? null,
        endHour: b.end_hour ?? null,
      };
    });
  }

  return {
    space,
    hours: { open: OPEN_HOUR, close: CLOSE_HOUR },
    booked,
  };
});
