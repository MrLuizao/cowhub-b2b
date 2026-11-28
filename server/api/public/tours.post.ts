
import { db, FieldValue } from '../../utils/db';
import {
  sendPublicTourReceivedEmail,
  sendPublicTourStaffNotice,
} from '../../utils/mail';
import {
  resolveB2bOrigin,
  resolveStaffNotifyEmails,
  sendStaffTopicPush,
} from '../../utils/public-notify';
import { genFolio, isValidDateKey, maxToursForDate, todayCDMX, toTourRequest } from '../../utils/public-booking';

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
  if (preferredDate) {
    if (preferredDate < todayCDMX()) {
      throw createError({ statusCode: 400, statusMessage: 'La fecha seleccionada ya pasó' });
    }
    const maxForDay = maxToursForDate(preferredDate);
    if (maxForDay === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Los domingos permanecemos cerrados' });
    }
    const existingSnap = await db()
      .collection('tour_requests')
      .where('preferred_date', '==', preferredDate)
      .get();
    const activeCount = existingSnap.docs.filter((d) => d.data().status !== 'cancelled').length;
    if (activeCount >= maxForDay) {
      throw createError({
        statusCode: 409,
        statusMessage: 'La fecha seleccionada ya no tiene lugares disponibles para tours',
      });
    }
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
  const tour = toTourRequest(snap);

  const agendaUrl = `${resolveB2bOrigin(event)}/agenda-web`;
  const staffEmails = await resolveStaffNotifyEmails();

  await Promise.allSettled([
    sendPublicTourReceivedEmail({
      to: email,
      name,
      folio,
      preferredDate,
      people,
    }),
    ...staffEmails.map((to) =>
      sendPublicTourStaffNotice({
        to,
        folio,
        name,
        company,
        email,
        phone,
        preferredDate,
        people,
        message,
        agendaUrl,
      }),
    ),
    sendStaffTopicPush({
      title: `Nueva solicitud de tour (${folio})`,
      body: `${name}${company ? ` · ${company}` : ''} · ${preferredDate ?? 'Fecha por definir'}`,
      data: { kind: 'tour', folio, route: '/agenda-web' },
    }),
  ]);

  return { tour };
});
