
import { db, FieldValue } from '../../utils/db';
import { genFolio, isValidDateKey, toTourRequest } from '../../utils/public-booking';

interface TourBody {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  preferred_date?: string;
  people?: number;
  interest?: string;
  message?: string;
  privacy_accepted?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+()\-.\s\d]{7,20}$/;

/// POST /api/public/tours - lead del formulario /tour de cowhub-book.
export default defineEventHandler(async (event) => {
  const body = (await readBody<TourBody>(event)) ?? {};

  const name = String(body.name ?? '').trim();
  const company = String(body.company ?? '').trim() || null;
  const email = String(body.email ?? '').trim().toLowerCase();
  const phone = String(body.phone ?? '').trim();
  const preferredDate = String(body.preferred_date ?? '').trim() || null;
  const people = Math.min(10, Math.max(1, Number(body.people ?? 1) || 1));
  const interest = String(body.interest ?? '').trim() || null;
  const message = String(body.message ?? '').trim() || null;

  if (!name || name.length < 3) {
    throw createError({ statusCode: 400, statusMessage: 'Nombre requerido' });
  }
  if (!EMAIL_RE.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Correo inválido' });
  }
  if (!PHONE_RE.test(phone)) {
    throw createError({ statusCode: 400, statusMessage: 'Teléfono/WhatsApp inválido' });
  }
  if (preferredDate && !isValidDateKey(preferredDate)) {
    throw createError({ statusCode: 400, statusMessage: 'Fecha inválida' });
  }
  if (body.privacy_accepted !== true) {
    throw createError({ statusCode: 400, statusMessage: 'Debes aceptar el aviso de privacidad' });
  }

  const folio = genFolio('TOUR');
  const ref = db().collection('tour_requests').doc(folio);
  await ref.set({
    folio,
    name,
    company,
    email,
    phone,
    preferred_date: preferredDate,
    people,
    interest,
    message,
    privacy_accepted: true,
    status: 'new',
    source: 'web',
    created_at: FieldValue.serverTimestamp(),
  });

  const snap = await ref.get();
  return { tour: toTourRequest(snap) };
});
