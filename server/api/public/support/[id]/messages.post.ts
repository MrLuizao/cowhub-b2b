import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import type { SupportMessage } from '#shared/types';

import { db } from '../../../../utils/db';
import { readVisitorToken, verifyVisitorToken } from '../../../../utils/public-support';
import { rateLimit } from '../../../../utils/rate-limit';

/// POST /api/public/support/:id/messages
/// Permite a un visitante web enviar mensajes adicionales en su conversación abierta.
export default defineEventHandler(async (event): Promise<SupportMessage> => {
  const id = getRouterParam(event, 'id') ?? '';
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID requerido' });
  }

  const token = readVisitorToken(event);
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Token de sesión requerido' });
  }

  await rateLimit(`public-support-msg:${id}`, 20, 60_000);

  const body = await readBody<{ text?: string }>(event);
  const text = String(body?.text ?? '').trim();
  if (!text || text.length > 1000) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Escribe un mensaje válido (máximo 1000 caracteres)',
    });
  }

  const convRef = db().collection('conversations').doc(id);
  const convSnap = await convRef.get();
  if (!convSnap.exists) {
    throw createError({ statusCode: 410, statusMessage: 'Conversación cerrada' });
  }

  const conv = convSnap.data()!;
  if (conv.source !== 'web' || !verifyVisitorToken(token, String(conv.visitor_token_hash ?? ''))) {
    throw createError({ statusCode: 403, statusMessage: 'Sesión de chat no válida' });
  }
  if (conv.status === 'resolved') {
    throw createError({ statusCode: 410, statusMessage: 'Conversación cerrada' });
  }

  const senderName = String(conv.member_name ?? 'Visitante');
  const msgRef = convRef.collection('messages').doc();
  const now = FieldValue.serverTimestamp();
  const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

  await db().runTransaction(async (tx) => {
    tx.set(msgRef, {
      sender: 'member',
      sender_name: senderName,
      text,
      created_at: now,
      read: false,
      expires_at: expiresAt,
    });
    tx.update(convRef, {
      last_message_at: now,
      last_message_preview: text.slice(0, 100),
      unread_staff: FieldValue.increment(1),
      expires_at: expiresAt,
    });
  });

  return {
    id: msgRef.id,
    conversationId: id,
    sender: 'member',
    senderName,
    text,
    createdAt: Date.now(),
    read: false,
  };
});
