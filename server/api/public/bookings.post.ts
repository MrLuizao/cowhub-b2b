
import { db, FieldValue } from '../../utils/db';
import {
  sendPublicBookingReceivedEmail,
  sendPublicBookingStaffNotice,
} from '../../utils/mail';
import {
  resolveB2bOrigin,
  resolveStaffNotifyEmails,
  sendStaffTopicPush,
} from '../../utils/public-notify';
import {
  CLOSE_HOUR,
  MAX_ADVANCE_DAYS,
  MAX_DURATION_H,
  OPEN_HOUR,
  genFolio,
  isValidDateKey,
  overlaps,
  todayCDMX,
  toSpaceBooking,
} from '../../utils/public-booking';

interface BookingBody {
  space_id?: string;
  date?: string;
  mode?: string;
  start_hour?: number;
  duration_hours?: number;
  people?: number;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+()\-.\s\d]{7,20}$/;

/// POST /api/public/bookings - reserva pública desde cowhub-book.
/// Valida espacio, fecha, horario, personas y conflictos; crea el doc
/// con folio CH-XXXXXX en `space_bookings` (status confirmed).
export default defineEventHandler(async (event) => {
  const body = (await readBody<BookingBody>(event)) ?? {};

  const spaceId = String(body.space_id ?? '').trim();
  const date = String(body.date ?? '').trim();
  const mode = body.mode === 'day' ? 'day' : 'hour';
  const startHour = Number(body.start_hour);
  const duration = Number(body.duration_hours ?? 1);
  const people = Number(body.people ?? 1);
  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const phone = String(body.phone ?? '').trim() || null;
  const company = String(body.company ?? '').trim() || null;

  // --- Validaciones básicas ---
  if (!spaceId || !isValidDateKey(date)) {
    throw createError({ statusCode: 400, statusMessage: 'Datos de reserva incompletos' });
  }
  const today = todayCDMX();
  const maxDate = new Date(Date.now() + MAX_ADVANCE_DAYS * 86400_000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  if (date < today || date > maxDate) {
    throw createError({ statusCode: 400, statusMessage: 'Fecha fuera de rango' });
  }
  if (!name || name.length < 3 || !EMAIL_RE.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Nombre y correo válidos son requeridos' });
  }
  if (phone && !PHONE_RE.test(phone)) {
    throw createError({ statusCode: 400, statusMessage: 'Teléfono inválido' });
  }

  // --- Espacio ---
  const spaceSnap = await db().collection('spaces').doc(spaceId).get();
  if (!spaceSnap.exists || spaceSnap.data()?.active !== true) {
    throw createError({ statusCode: 404, statusMessage: 'Espacio no disponible' });
  }
  const space = spaceSnap.data()!;
  if (people < 1 || people > (space.capacity ?? 1)) {
    throw createError({ statusCode: 400, statusMessage: `Capacidad máxima: ${space.capacity}` });
  }

  // --- Horario ---
  let startHourN: number | null = null;
  let endHourN: number | null = null;
  if (mode === 'hour') {
    if (!Number.isInteger(startHour) || startHour < OPEN_HOUR || startHour >= CLOSE_HOUR) {
      throw createError({ statusCode: 400, statusMessage: 'Hora de inicio inválida' });
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > MAX_DURATION_H) {
      throw createError({ statusCode: 400, statusMessage: `Duración entre 1 y ${MAX_DURATION_H} horas` });
    }
    startHourN = startHour;
    endHourN = startHour + duration;
    if (endHourN > CLOSE_HOUR) {
      throw createError({ statusCode: 400, statusMessage: `El horario debe terminar antes de las ${CLOSE_HOUR}:00` });
    }
  }

  // --- Total ---
  const totalMxn =
    mode === 'day'
      ? (space.price_per_day ?? (space.price_per_hour ?? 0) * (CLOSE_HOUR - OPEN_HOUR))
      : (space.price_per_hour ?? 0) * (duration || 1);

  // --- Conflicto + creación en transacción ---
  const bookingsRef = db().collection('space_bookings');
  let folio = '';
  let bookingId = '';

  for (let attempt = 0; attempt < 5; attempt++) {
    folio = genFolio('CH');
    bookingId = folio;
    const clash = await db().runTransaction(async (tx) => {
      const existing = await tx.get(
        bookingsRef
          .where('space_id', '==', spaceId)
          .where('date', '==', date)
          .where('status', 'in', ['pending', 'confirmed']),
      );
      const intervals = existing.docs.map((d) => {
        const b = d.data();
        return {
          mode: b.mode === 'day' ? 'day' : 'hour',
          startHour: b.start_hour ?? null,
          endHour: b.end_hour ?? null,
        };
      });
      if (mode === 'day' ? intervals.length > 0 : overlaps(startHourN!, endHourN!, intervals)) {
        return true;
      }
      tx.set(bookingsRef.doc(bookingId), {
        folio,
        space_id: spaceId,
        space_name: space.name ?? '',
        date,
        mode,
        start_hour: startHourN,
        end_hour: endHourN,
        guests: { name, email, phone, company },
        people,
        total_mxn: totalMxn,
        status: 'pending',
        source: 'web',
        notes: null,
        created_at: FieldValue.serverTimestamp(),
      });
      return false;
    });
    if (clash) {
      throw createError({
        statusCode: 409,
        statusMessage: 'El horario seleccionado ya no está disponible',
      });
    }
    break;
  }

  const snap = await bookingsRef.doc(bookingId).get();
  const booking = toSpaceBooking(snap);

  const timeLabel =
    mode === 'day' ? 'Día completo' : `${startHourN}:00 - ${endHourN}:00`;
  const agendaUrl = `${resolveB2bOrigin(event)}/agenda-web`;
  const staffEmails = await resolveStaffNotifyEmails();

  await Promise.allSettled([
    sendPublicBookingReceivedEmail({
      to: email,
      name,
      folio,
      spaceName: booking.spaceName,
      date,
      timeLabel,
      people,
      totalMxn,
    }),
    ...staffEmails.map((to) =>
      sendPublicBookingStaffNotice({
        to,
        folio,
        spaceName: booking.spaceName,
        date,
        timeLabel,
        people,
        totalMxn,
        guestName: name,
        guestEmail: email,
        guestPhone: phone,
        agendaUrl,
      }),
    ),
    sendStaffTopicPush({
      title: `Nueva reserva por confirmar (${folio})`,
      body: `${name} · ${booking.spaceName} (${date} · ${timeLabel})`,
      data: { kind: 'booking', folio, route: '/agenda-web' },
    }),
  ]);

  return { booking };
});
