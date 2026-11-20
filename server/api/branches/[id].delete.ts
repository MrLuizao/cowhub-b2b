import { db } from '../../utils/db';
import { requireAdmin, requireStaff } from '../../utils/staff-auth';

export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  requireAdmin(staff);
  const id = getRouterParam(event, 'id') ?? '';

  const ref = db().collection('branches').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw createError({ statusCode: 404, statusMessage: 'Sede no encontrada' });
  }

  const [members, activities, hosts] = await Promise.all([
    db().collection('users').where('branch_id', '==', id).count().get(),
    db().collection('activities').where('branch_ids', 'array-contains', id).count().get(),
    db().collection('hosts').where('branch_ids', 'array-contains', id).count().get(),
  ]);
  const total =
    members.data().count + activities.data().count + hosts.data().count;
  if (total > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `No se puede eliminar '${snap.data()?.name}': tiene ${members.data().count} miembro(s), ${activities.data().count} actividad(s) y ${hosts.data().count} anfitrión(es) asignados`,
    });
  }
  await ref.delete();
  return { ok: true };
});
