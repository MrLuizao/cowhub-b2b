import type { H3Event } from 'h3';

import { db } from './db';
import { useAdmin } from './firebase-admin';

/// Resuelve correos de notificación del negocio: si `BUSINESS_NOTIFY_EMAIL` (o
/// `MAIL_TO`) tiene correos configurados, envía únicamente a esa lista; solo si
/// está vacía recurre al staff activo en Firestore/Auth.
export async function resolveStaffNotifyEmails(): Promise<string[]> {
  const emails = new Set<string>();
  const envRaw = process.env.BUSINESS_NOTIFY_EMAIL || process.env.MAIL_TO || '';
  for (const part of envRaw.split(',')) {
    const clean = part.trim().toLowerCase();
    if (clean) emails.add(clean);
  }
  if (emails.size > 0) {
    return Array.from(emails);
  }
  try {
    const staffSnap = await db().collection('staff').get();
    await Promise.all(
      staffSnap.docs.map(async (doc) => {
        const data = doc.data();
        if (data.active === false) return;
        const role = String(data.role ?? '');
        if (!['ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(role)) return;
        try {
          const user = await useAdmin().auth.getUser(doc.id);
          if (user.email) emails.add(user.email.toLowerCase());
        } catch {
          /* staff sin correo en Auth */
        }
      }),
    );
  } catch (err) {
    console.warn('[public-notify] No se pudieron resolver correos de staff:', err);
  }
  return Array.from(emails);
}

/// Envía push FCM al tópico de staff/recepción si hay dispositivos suscritos.
export async function sendStaffTopicPush(opts: {
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {
  try {
    await useAdmin().messaging.send({
      topic: 'staff_reception',
      notification: {
        title: opts.title,
        body: opts.body,
      },
      data: opts.data,
    });
  } catch (err) {
    console.warn('[public-notify] Push FCM staff_reception omitido:', err);
  }
}

export function resolveB2bOrigin(event: H3Event): string {
  const proto = getRequestHeader(event, 'x-forwarded-proto') || 'https';
  const host = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
  if (host) return `${proto}://${host}`;
  return 'https://cowhub-b2b.vercel.app';
}
