import { db } from '../../utils/db';
import { requireStaff } from '../../utils/staff-auth';

export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  if (staff.role !== 'ADMIN') {
    throw createError({ statusCode: 403, message: 'Solo un administrador global puede eliminar salas' });
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'ID de sala requerido' });
  }

  const docRef = db().collection('spaces').doc(id);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw createError({ statusCode: 404, message: 'Sala no encontrada' });
  }

  await docRef.delete();
  return { ok: true, id };
});
