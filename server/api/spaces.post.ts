import type { BookableSpace } from '#shared/types';

import { db } from '../utils/db';
import { toBookableSpace } from '../utils/public-booking';
import { requireStaff } from '../utils/staff-auth';

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default defineEventHandler(async (event): Promise<BookableSpace> => {
  const staff = await requireStaff(event);
  if (staff.role !== 'ADMIN') {
    throw createError({ statusCode: 403, message: 'Solo un administrador puede crear salas' });
  }

  const body = await readBody(event);
  const name = (body.name || '').trim();
  if (!name) {
    throw createError({ statusCode: 400, message: 'El nombre de la sala es obligatorio' });
  }

  const rawId = (body.id || slugify(name)).trim();
  const id = rawId || `sala-${Date.now().toString(36)}`;

  const docRef = db().collection('spaces').doc(id);
  const existing = await docRef.get();
  if (existing.exists) {
    throw createError({ statusCode: 409, message: `Ya existe una sala con el identificador '${id}'` });
  }

  const spaceData = {
    id,
    name,
    tagline: (body.tagline || '').trim(),
    description: (body.description || '').trim(),
    capacity: Math.max(1, Number(body.capacity) || 1),
    price_per_hour: Math.max(0, Number(body.pricePerHour) || 0),
    price_per_day: body.pricePerDay != null ? Math.max(0, Number(body.pricePerDay)) : null,
    image: (body.image || '').trim() || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&q=80',
    gallery: Array.isArray(body.gallery) ? body.gallery.filter(Boolean) : [],
    amenities: Array.isArray(body.amenities) ? body.amenities.filter(Boolean) : [],
    category: body.category || 'sala-juntas',
    featured: body.featured === true,
    active: body.active !== false,
    sort: Number(body.sort) || 10,
    branch_ids: Array.isArray(body.branchIds) && body.branchIds.length > 0 ? body.branchIds : ['select'],
    created_at: new Date(),
    updated_at: new Date(),
  };

  await docRef.set(spaceData);
  const snap = await docRef.get();
  return toBookableSpace(snap);
});
