import type { BookableSpace } from '#shared/types';

import { db } from '../../utils/db';
import { toBookableSpace } from '../../utils/public-booking';
import { requireStaff } from '../../utils/staff-auth';

export default defineEventHandler(async (event): Promise<BookableSpace> => {
  await requireStaff(event);
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'ID de sala requerido' });
  }

  const doc = await db().collection('spaces').doc(id).get();
  if (!doc.exists) {
    throw createError({ statusCode: 404, message: 'Sala no encontrada' });
  }

  return toBookableSpace(doc);
});
