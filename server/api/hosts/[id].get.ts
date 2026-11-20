import type { HostDetail } from '#shared/types';

import { db, toActivity, toHost } from '../../utils/db';
import { requireStaff } from '../../utils/staff-auth';

export default defineEventHandler(async (event): Promise<HostDetail> => {
  await requireStaff(event);
  const id = getRouterParam(event, 'id') ?? '';

  const snap = await db().collection('hosts').doc(id).get();
  if (!snap.exists) {
    throw createError({ statusCode: 404, statusMessage: 'Anfitrión no encontrado' });
  }

  const activitiesSnap = await db()
    .collection('activities')
    .where('host_id', '==', id)
    .get();
  const activities = activitiesSnap.docs
    .map(toActivity)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  return {
    host: toHost(snap),
    activities,
    stats: {
      activities: activities.length,
      attendees: activities.reduce((t, c) => t + c.booked, 0),
    },
  };
});
