import type { BookableSpace } from '#shared/types';

import { db } from '../../utils/db';
import { toBookableSpace } from '../../utils/public-booking';
import { requireStaff } from '../../utils/staff-auth';

export default defineEventHandler(async (event): Promise<BookableSpace> => {
  const staff = await requireStaff(event);
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'ID de sala requerido' });
  }

  const docRef = db().collection('spaces').doc(id);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    throw createError({ statusCode: 404, message: 'Sala no encontrada' });
  }

  const existing = docSnap.data() || {};
  const existingBranches: string[] = Array.isArray(existing.branch_ids) ? existing.branch_ids : [];

  // Verificación de permisos: Admin puede editar todo. Gerente solo si la sala está en su sede.
  if (staff.role === 'RECEPTIONIST') {
    throw createError({ statusCode: 403, message: 'Recepción no tiene permisos para editar salas' });
  }
  if (staff.role === 'MANAGER') {
    if (!staff.branchId || !existingBranches.includes(staff.branchId)) {
      throw createError({ statusCode: 403, message: 'No puedes editar salas que no pertenezcan a tu sede' });
    }
  }

  const body = await readBody(event);
  const updateData: Record<string, any> = {
    updated_at: new Date(),
  };

  if (body.name !== undefined) updateData.name = String(body.name).trim();
  if (body.tagline !== undefined) updateData.tagline = String(body.tagline).trim();
  if (body.description !== undefined) updateData.description = String(body.description).trim();
  if (body.capacity !== undefined) updateData.capacity = Math.max(1, Number(body.capacity) || 1);
  if (body.pricePerHour !== undefined) updateData.price_per_hour = Math.max(0, Number(body.pricePerHour) || 0);
  if (body.pricePerDay !== undefined) {
    updateData.price_per_day = body.pricePerDay != null ? Math.max(0, Number(body.pricePerDay)) : null;
  }
  if (body.image !== undefined) updateData.image = String(body.image).trim();
  if (body.gallery !== undefined && Array.isArray(body.gallery)) updateData.gallery = body.gallery;
  if (body.amenities !== undefined && Array.isArray(body.amenities)) updateData.amenities = body.amenities;
  if (body.category !== undefined) updateData.category = String(body.category);
  if (body.featured !== undefined) updateData.featured = body.featured === true;
  if (body.active !== undefined) updateData.active = body.active === true;
  if (body.sort !== undefined) updateData.sort = Number(body.sort) || 10;

  // Solo Admin puede alterar a qué sedes pertenece la sala
  if (staff.role === 'ADMIN' && body.branchIds !== undefined && Array.isArray(body.branchIds)) {
    updateData.branch_ids = body.branchIds;
  }

  await docRef.update(updateData);
  const updatedSnap = await docRef.get();
  return toBookableSpace(updatedSnap);
});
