import { db } from '../../utils/db';
import { requireAdmin, requireStaff } from '../../utils/staff-auth';

export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  requireAdmin(staff);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID requerido' });
  }

  const ref = db().collection('hosts').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw createError({ statusCode: 404, statusMessage: 'Anfitrión no encontrado' });
  }

  await ref.delete();
  return { ok: true, id };
});
