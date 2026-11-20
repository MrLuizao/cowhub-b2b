import { defineEventHandler } from 'h3';

import { db } from '../../utils/db';
import { requireBranchScope, requireStaff } from '../../utils/staff-auth';

/// DELETE /api/members/{id}
/// Elimina completamente un miembro (solo ADMIN).
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const id = getRouterParam(event, 'id') ?? '';

  const ref = db().collection('users').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw createError({ statusCode: 404, statusMessage: 'Miembro no encontrado' });
  }
  const existing = snap.data() ?? {};
  requireBranchScope(staff, existing.branch_id as string);

  /// Solo ADMIN puede eliminar miembros
  if (staff.role !== 'ADMIN') {
    throw createError({ statusCode: 403, statusMessage: 'Solo el administrador puede eliminar miembros' });
  }

  await ref.delete();

  return { success: true, message: 'Miembro eliminado correctamente' };
});
