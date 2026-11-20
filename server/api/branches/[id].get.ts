import type { BranchDetail } from '#shared/types';

import { db, toBranch, toActivity, toHost } from '../../utils/db';
import { requireStaff } from '../../utils/staff-auth';

export default defineEventHandler(async (event): Promise<BranchDetail> => {
  await requireStaff(event);
  const id = getRouterParam(event, 'id') ?? '';

  const snap = await db().collection('branches').doc(id).get();
  if (!snap.exists) {
    throw createError({ statusCode: 404, statusMessage: 'Sede no encontrada' });
  }
  const branch = toBranch(snap);

  const [activitiesSnap, hostsSnap] = await Promise.all([
    db().collection('activities').where('branch_ids', 'array-contains', id).get(),
    db().collection('hosts').where('branch_ids', 'array-contains', id).get(),
  ]);
  const allHosts = (
    await db().collection('hosts').get()
  ).docs.map(toHost);

  const activities = activitiesSnap.docs
    .map(toActivity)
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const hosts = hostsSnap.docs.map(toHost);

  return {
    branch,
    activities,
    hosts,
    availableHosts: allHosts.filter((t) => !t.branchIds.includes(id)),
    stats: {
      occupancy:
        branch.maxCapacity > 0 ? branch.currentCapacity / branch.maxCapacity : 0,
      activities: activities.length,
      hostsOnDuty: hosts.filter((t) => t.isOnDuty).length,
    },
  };
});
