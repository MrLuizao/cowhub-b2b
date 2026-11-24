import { db } from '../../utils/db';
import {
  sendPublicBookingConfirmedEmail,
  sendPublicTourStatusEmail,
} from '../../utils/mail';
import { requireStaff } from '../../utils/staff-auth';

interface NotifyStatusBody {
  kind?: 'booking' | 'tour';
  id?: string;
  status?: string;
  reason?: string;
}

/// POST /api/agenda-web/notify-status
/// Notifica al cliente por correo cuando un miembro del equipo confirma,
/// agenda o cancela una reserva o solicitud de tour.
export default defineEventHandler(async (event) => {
  await requireStaff(event);
  const body = (await readBody<NotifyStatusBody>(event)) ?? {};
  const kind = body.kind;
  const id = String(body.id ?? '').trim();
  const status = String(body.status ?? '').trim();
  const reason = String(body.reason ?? '').trim() || undefined;

  if (!id || (kind !== 'booking' && kind !== 'tour')) {
    throw createError({ statusCode: 400, statusMessage: 'Parámetros inválidos' });
  }

  if (kind === 'booking') {
    if (status !== 'confirmed' && status !== 'cancelled') {
      return { sent: false };
    }
    const snap = await db().collection('space_bookings').doc(id).get();
    if (!snap.exists) return { sent: false };
    const b = snap.data()!;
    const email = String(b.guests?.email ?? '').trim();
    if (!email) return { sent: false };
    const timeLabel =
      b.mode === 'day' ? 'Día completo' : `${b.start_hour}:00 - ${b.end_hour}:00`;
    const sent = await sendPublicBookingConfirmedEmail({
      to: email,
      name: String(b.guests?.name ?? 'Cliente'),
      folio: String(b.folio ?? id),
      spaceName: String(b.space_name ?? ''),
      date: String(b.date ?? ''),
      timeLabel,
      status,
      reason,
    }).catch(() => false);
    return { sent };
  }

  if (status !== 'contacted' && status !== 'done' && status !== 'cancelled') {
    return { sent: false };
  }
  const snap = await db().collection('tour_requests').doc(id).get();
  if (!snap.exists) return { sent: false };
  const t = snap.data()!;
  const email = String(t.email ?? '').trim();
  if (!email) return { sent: false };
  const sent = await sendPublicTourStatusEmail({
    to: email,
    name: String(t.name ?? 'Cliente'),
    folio: String(t.folio ?? id),
    preferredDate: t.preferred_date ?? null,
    status,
    reason,
  }).catch(() => false);
  return { sent };
});
