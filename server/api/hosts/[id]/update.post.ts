import type { Host } from '#shared/types';
import { HOST_AVATAR_IDS } from '#shared/host-avatars';

import { db, toHost } from '../../../utils/db';
import { requireStaff } from '../../../utils/staff-auth';

const SHIFTS = ['MAÑANA', 'TARDE', 'NOCHE'] as const;
/// Campos que el gerente puede tocar en integrantes de su sede.
const MANAGER_KEYS = new Set(['shift', 'isOnDuty', 'addBranchId', 'removeBranchId']);

export default defineEventHandler(async (event): Promise<Host> => {
  const staff = await requireStaff(event);
  const id = getRouterParam(event, 'id') ?? '';

  const ref = db().collection('hosts').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw createError({ statusCode: 404, statusMessage: 'Anfitrión no encontrado' });
  }
  const data = snap.data() ?? {};
  const currentBranchIds = (data.branch_ids as string[]) ?? [];

  /// Recepcionista solo VE - la edición (incluso MANAGER_KEYS) es
  /// gerente de la sede o admin.
  if (staff.role === 'RECEPTIONIST') {
    throw createError({ statusCode: 403, statusMessage: 'Solo lectura' });
  }

  const body = await readBody<
    Partial<Host> & {
      addBranchId?: string;
      removeBranchId?: string;
      activityIds?: string[];
    }
  >(event);

  if (staff.role !== 'ADMIN') {
    if (!staff.branchId || !currentBranchIds.includes(staff.branchId)) {
      throw createError({ statusCode: 403, statusMessage: 'Fuera de tu sede' });
    }
    const bodyKeys = Object.keys(body ?? {});
    if (bodyKeys.some((k) => !MANAGER_KEYS.has(k))) {
      throw createError({
        statusCode: 403,
        statusMessage: 'El gerente solo edita turno/disponibilidad y sede local',
      });
    }
  }

  const update: Record<string, unknown> = {};

  if (typeof body.name === 'string' && body.name.trim().length >= 3) {
    update.name = body.name.trim();
  }
  if (typeof body.specialty === 'string' && body.specialty.trim()) {
    update.specialty = body.specialty.trim();
  }
  if (
    typeof body.shift === 'string' &&
    (SHIFTS as readonly string[]).includes(body.shift)
  ) {
    update.shift = body.shift;
  }
  if (typeof body.isOnDuty === 'boolean') {
    update.is_on_duty = body.isOnDuty;
  }
  /// Avatar ilustrado - campo global, solo admin (no está en MANAGER_KEYS).
  if (
    typeof body.avatar === 'string' &&
    (HOST_AVATAR_IDS as readonly string[]).includes(body.avatar)
  ) {
    update.avatar = body.avatar;
  }

  /// branch_ids: admin manda el arreglo completo; gerente solo add/remove
  /// de su propia sede.
  let branchIds = currentBranchIds;
  if (staff.role === 'ADMIN' && Array.isArray(body.branchIds)) {
    const valid = new Set(
      (await db().collection('branches').get()).docs.map((d) => d.id),
    );
    branchIds = body.branchIds.filter((b) => valid.has(b));
  }
  if (
    typeof body.addBranchId === 'string' &&
    (staff.role === 'ADMIN' || body.addBranchId === staff.branchId) &&
    !branchIds.includes(body.addBranchId)
  ) {
    branchIds = [...branchIds, body.addBranchId];
  }
  if (
    typeof body.removeBranchId === 'string' &&
    (staff.role === 'ADMIN' || body.removeBranchId === staff.branchId)
  ) {
    branchIds = branchIds.filter((b) => b !== body.removeBranchId);
  }
  update.branch_ids = branchIds;

  if (Object.keys(update).length > 0) await ref.update(update);

  /// Reasignación de espacios por id (solo admin - es campo global).
  if (staff.role === 'ADMIN' && Array.isArray(body.activityIds)) {
    const activitiesSnap = await db()
      .collection('activities')
      .where('host_id', '==', id)
      .get();
    const newName = (update.name as string) ?? (data.name as string) ?? '';
    const batch = db().batch();
    for (const doc of activitiesSnap.docs) {
      if (!body.activityIds.includes(doc.id)) {
        batch.update(doc.ref, { host_id: '', host: 'Sin asignar' });
      }
    }
    const toAssign = await Promise.all(
      body.activityIds.map((cid) => db().collection('activities').doc(cid).get()),
    );
    for (const c of toAssign) {
      if (c.exists) batch.update(c.ref, { host_id: id, host: newName });
    }
    await batch.commit();
  } else if (typeof update.name === 'string') {
    /// La etiqueta `host` es denormalizada - resincronizarla por host_id.
    const activitiesSnap = await db()
      .collection('activities')
      .where('host_id', '==', id)
      .get();
    const batch = db().batch();
    for (const doc of activitiesSnap.docs) {
      batch.update(doc.ref, { host: update.name });
    }
    await batch.commit();
  }

  return toHost(await ref.get());
});
