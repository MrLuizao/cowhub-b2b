import type { SupportMessage } from '#shared/types';

import { db } from '../../../../utils/db';
import { readVisitorToken, verifyVisitorToken } from '../../../../utils/public-support';

/// GET /api/public/support/:id/messages
/// Devuelve los mensajes actuales de una conversación web validando X-Visitor-Token.
/// Si la conversación fue resuelta/eliminada por staff, responde status: 'resolved'.
export default defineEventHandler(async (event): Promise<{
  status: 'open' | 'resolved';
  messages: SupportMessage[];
}> => {
  const id = getRouterParam(event, 'id') ?? '';
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID requerido' });
  }

  const token = readVisitorToken(event);
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Token de sesión requerido' });
  }

  const convRef = db().collection('conversations').doc(id);
  const convSnap = await convRef.get();
  if (!convSnap.exists) {
    return { status: 'resolved', messages: [] };
  }

  const conv = convSnap.data()!;
  if (conv.source !== 'web' || !verifyVisitorToken(token, String(conv.visitor_token_hash ?? ''))) {
    throw createError({ statusCode: 403, statusMessage: 'Sesión de chat no válida' });
  }

  if (conv.status === 'resolved') {
    return { status: 'resolved', messages: [] };
  }

  // Solo escribir en Firestore si realmente había mensajes sin leer por el visitante
  if (Number(conv.unread_member ?? 0) > 0) {
    await convRef.update({ unread_member: 0 }).catch(() => undefined);
  }

  const snap = await convRef
    .collection('messages')
    .orderBy('created_at', 'asc')
    .limit(100)
    .get();

  const messages: SupportMessage[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      conversationId: id,
      sender: data.sender === 'staff' ? 'staff' : data.sender === 'ai' ? 'ai' : 'member',
      senderName: String(data.sender_name ?? ''),
      text: String(data.text ?? ''),
      createdAt: data.created_at?.toMillis?.() ?? Date.now(),
      read: data.read === true,
    };
  });

  return { status: 'open', messages };
});
