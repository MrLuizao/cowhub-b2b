import type { Host } from '#shared/types';

import { db, toHost } from '../../../utils/db';
import { requireStaff } from '../../../utils/staff-auth';

export default defineEventHandler(async (event): Promise<Host> => {
  const staff = await requireStaff(event);
  const id = getRouterParam(event, 'id') ?? '';

  const ref = db().collection('hosts').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw createError({ statusCode: 404, statusMessage: 'Anfitrión no encontrado' });
  }

  /// Recepcionista solo VE - gestionar el turno es gerente o admin.
  if (staff.role === 'RECEPTIONIST') {
    throw createError({ statusCode: 403, statusMessage: 'Solo lectura' });
  }
  /// Gerente: solo integrantes asignados a su sede.
  if (staff.role !== 'ADMIN') {
    const branchIds = (snap.data()?.branch_ids as string[]) ?? [];
    if (!staff.branchId || !branchIds.includes(staff.branchId)) {
      throw createError({ statusCode: 403, statusMessage: 'Fuera de tu sede' });
    }
  }

  await ref.update({ is_on_duty: !(snap.data()?.is_on_duty === true) });
  return toHost(await ref.get());
});
