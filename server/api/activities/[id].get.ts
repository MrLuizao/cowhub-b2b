import type { ActivityDetail } from '#shared/types';

import { db, toBranch, toActivity, toHost } from '../../utils/db';
import { requireStaff } from '../../utils/staff-auth';

export default defineEventHandler(async (event): Promise<ActivityDetail> => {
  await requireStaff(event);
  const id = getRouterParam(event, 'id') ?? '';

  const snap = await db().collection('activities').doc(id).get();
  if (!snap.exists) {
    throw createError({ statusCode: 404, statusMessage: 'Actividad no encontrada' });
  }
  const activity = toActivity(snap);

  const [branchesSnap, hostSnap] = await Promise.all([
    db().collection('branches').get(),
    activity.hostId
      ? db().collection('hosts').doc(activity.hostId).get()
      : Promise.resolve(null),
  ]);

  return {
    activity,
    branches: branchesSnap.docs
      .map(toBranch)
      .filter((b) => activity.branchIds.includes(b.id)),
    host: hostSnap?.exists ? toHost(hostSnap) : null,
  };
});
