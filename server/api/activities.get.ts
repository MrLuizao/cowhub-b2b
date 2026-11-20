import type { Activity } from '#shared/types';

import { db, toActivity } from '../utils/db';
import { requireStaff } from '../utils/staff-auth';

export default defineEventHandler(async (event): Promise<Activity[]> => {
  await requireStaff(event);
  const query = getQuery(event);
  const branchId = typeof query.branchId === 'string' ? query.branchId : null;
  const ref = db().collection('activities') as FirebaseFirestore.Query;
  const scoped = branchId ? ref.where('branch_ids', 'array-contains', branchId) : ref;
  const snap = await scoped.get();
  return snap.docs
    .map(toActivity)
    .sort((a, b) => a.startMinutes - b.startMinutes);
});
