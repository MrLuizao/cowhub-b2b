import type { DocumentSnapshot } from 'firebase-admin/firestore';

import type { BookableSpace, SpaceBooking, TourRequest } from '#shared/types';

/// Reglas de la agenda pública de espacios (cowhub-book).
export const OPEN_HOUR = 7;
export const CLOSE_HOUR = 20; // último slot termina a las 20:00
export const MAX_DURATION_H = 6;
export const MAX_ADVANCE_DAYS = 60;

export const TOUR_MAX_WEEKDAY = 6;
export const TOUR_MAX_SATURDAY = 3;
export const TOUR_MAX_SUNDAY = 0;

export function maxToursForDate(dateKey: string): number {
  const day = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  if (day === 0) return TOUR_MAX_SUNDAY;
  if (day === 6) return TOUR_MAX_SATURDAY;
  return TOUR_MAX_WEEKDAY;
}

const TZ = 'America/Mexico_City';

/// 'YYYY-MM-DD' de hoy en CDMX.
export function todayCDMX(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function isValidDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z'));
}

const FOLIO_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/// Folio legible sin caracteres ambiguos: 'CH-4K9X2P'.
export function genFolio(prefix: string, len = 6): string {
  let out = '';
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  for (const n of buf) out += FOLIO_ALPHABET[n % FOLIO_ALPHABET.length];
  return `${prefix}-${out}`;
}

export function toBookableSpace(s: DocumentSnapshot): BookableSpace {
  const d = s.data() ?? {};
  return {
    id: s.id,
    name: d.name ?? '',
    tagline: d.tagline ?? '',
    description: d.description ?? '',
    capacity: d.capacity ?? 0,
    pricePerHour: d.price_per_hour ?? 0,
    pricePerDay: d.price_per_day ?? null,
    image: d.image ?? '',
    gallery: Array.isArray(d.gallery) ? d.gallery : [],
    amenities: Array.isArray(d.amenities) ? d.amenities : [],
    category: d.category ?? 'sala-juntas',
    featured: d.featured === true,
    branchIds: Array.isArray(d.branch_ids) ? d.branch_ids : [],
    active: d.active !== false,
    sort: typeof d.sort === 'number' ? d.sort : 99,
  };
}

export function toSpaceBooking(s: DocumentSnapshot): SpaceBooking {
  const d = s.data() ?? {};
  const g = d.guests ?? {};
  return {
    id: s.id,
    folio: d.folio ?? s.id,
    spaceId: d.space_id ?? '',
    spaceName: d.space_name ?? '',
    date: d.date ?? '',
    mode: d.mode === 'day' ? 'day' : 'hour',
    startHour: d.start_hour ?? null,
    endHour: d.end_hour ?? null,
    guests: {
      name: g.name ?? '',
      email: g.email ?? '',
      phone: g.phone ?? null,
      company: g.company ?? null,
    },
    people: d.people ?? 1,
    totalMxn: d.total_mxn ?? 0,
    status: ['cancelled', 'completed', 'no_show'].includes(d.status)
      ? d.status
      : 'confirmed',
    source: d.source === 'b2b' ? 'b2b' : 'web',
    notes: d.notes ?? null,
    createdAt:
      d.created_at?.toMillis?.() ?? (typeof d.created_at === 'number' ? d.created_at : 0),
  };
}

export function toTourRequest(s: DocumentSnapshot): TourRequest {
  const d = s.data() ?? {};
  return {
    id: s.id,
    folio: d.folio ?? s.id,
    name: d.name ?? '',
    company: d.company ?? null,
    email: d.email ?? '',
    phone: d.phone ?? '',
    preferredDate: d.preferred_date ?? null,
    people: d.people ?? 1,
    interest: d.interest ?? null,
    message: d.message ?? null,
    privacyAccepted: d.privacy_accepted === true,
    status: ['contacted', 'done', 'cancelled'].includes(d.status)
      ? d.status
      : 'new',
    createdAt:
      d.created_at?.toMillis?.() ?? (typeof d.created_at === 'number' ? d.created_at : 0),
  };
}

/// ¿El rango [s,e) choca con una reserva existente (misma fecha)?
/// `existing`: bookings confirmados del espacio en esa fecha.
export function overlaps(
  s: number,
  e: number,
  existing: { mode: string; startHour: number | null; endHour: number | null }[],
): boolean {
  for (const b of existing) {
    if (b.mode === 'day') return true; // día completo bloquea todo
    if (b.mode !== 'hour' || b.startHour == null || b.endHour == null) continue;
    if (s < b.endHour && e > b.startHour) return true;
  }
  return false;
}
