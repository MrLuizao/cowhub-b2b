import type { BookableSpace } from '#shared/types';

import { db } from '../utils/db';
import { toBookableSpace } from '../utils/public-booking';
import { requireStaff } from '../utils/staff-auth';

/// GET /api/spaces - lista de salas para la consola administrativa.
/// Staff con sede fija ve solo las de su sede; Admin ve todas o filtra por query ?branchId.
export default defineEventHandler(async (event): Promise<BookableSpace[]> => {
  const staff = await requireStaff(event);
  const query = getQuery(event);
  const targetBranch = (query.branchId as string) || staff.branchId;

  const snap = await db().collection('spaces').get();
  let list = snap.docs.map(toBookableSpace);

  if (targetBranch) {
    list = list.filter((sp) => sp.branchIds?.includes(targetBranch));
  }

  return list.sort((a, b) => {
    const sortA = a.sort ?? 99;
    const sortB = b.sort ?? 99;
    if (sortA !== sortB) return sortA - sortB;
    return a.name.localeCompare(b.name, 'es');
  });
});
