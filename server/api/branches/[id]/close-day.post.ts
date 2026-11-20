import { db } from '../../../utils/db';
import {
  archivePastBookings,
  sweepCheckins,
  sweepActivityBookings,
} from '../../../utils/close-day';
import { requireStaff } from '../../../utils/staff-auth';

/// Cierre manual de una sede: barre SUS check-ins vivos a dailyStats
/// (misma agregación que el cron global), borra los docs, limpia los
/// punteros activos de los miembros y resetea su ocupación.
/// Gerente/recepcionista solo cierran su propia sede; admin cualquiera.
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const branchId = getRouterParam(event, 'id') ?? '';
  if (!branchId) {
    throw createError({ statusCode: 400, statusMessage: 'Sede requerida' });
  }
  /// Cualquier staff cierra el ocupación - gerente y recepcionista solo la
  /// suya; el ajuste manual (+/-) sí sigue restringido a gerente/admin.
  if (staff.role !== 'ADMIN' && staff.branchId !== branchId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Solo puedes cerrar el ocupación de tu propia sede',
    });
  }

  const branchRef = db().collection('branches').doc(branchId);
  if (!(await branchRef.get()).exists) {
    throw createError({ statusCode: 404, statusMessage: 'Sede no encontrada' });
  }

  const snap = await db()
    .collection('checkins')
    .where('branch_id', '==', branchId)
    .get();
  const days = await sweepCheckins(snap.docs);
  const activities = await sweepActivityBookings(branchId);
  const archived = await archivePastBookings(branchId);
  await branchRef.update({ current_capacity: 0 });

  return { swept: snap.size, days, activities, archived };
});
