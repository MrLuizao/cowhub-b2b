import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import type { SupportMessage } from '#shared/types';

import { getAiPilotConfig, isWithinPilotSchedule } from '../../../utils/ai-pilot/config';
import { runAiPilotTurn } from '../../../utils/ai-pilot/engine';
import { getBusinessFeatures } from '../../../utils/config';
import { db } from '../../../utils/db';
import { sendStaffTopicPush } from '../../../utils/public-notify';
import {
  generateVisitorToken,
  getClientIp,
  hashVisitorToken,
  resolveDefaultBranchId,
} from '../../../utils/public-support';
import { rateLimit } from '../../../utils/rate-limit';

interface StartVisitorChatBody {
  name?: string;
  phone?: string;
  message?: string;
}

const PHONE_RE = /^[+()\-.\s\d]{7,20}$/;

/// POST /api/public/support/conversations
/// Inicia una conversación de soporte en vivo desde cowhub-book (visitante anónimo).
export default defineEventHandler(async (event): Promise<{
  conversationId: string;
  visitorToken: string;
  message: SupportMessage;
}> => {
  const ip = getClientIp(event);
  await rateLimit(`public-support-conv:${ip}`, 5, 60_000);

  const body = (await readBody<StartVisitorChatBody>(event)) ?? {};
  const name = String(body.name ?? '').trim();
  const phone = String(body.phone ?? '').trim() || null;
  const messageText = String(body.message ?? '').trim();

  if (name.length < 2 || name.length > 80) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ingresa tu nombre (mínimo 2 caracteres)',
    });
  }
  if (phone && !PHONE_RE.test(phone)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'El teléfono ingresado no es válido',
    });
  }
  if (!messageText || messageText.length > 1000) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Escribe tu mensaje (máximo 1000 caracteres)',
    });
  }

  const [branchId, features, pilotCfg] = await Promise.all([
    resolveDefaultBranchId(),
    getBusinessFeatures(),
    getAiPilotConfig(),
  ]);
  const autoPilotActive =
    Boolean(features.ai_autopilot?.enabled) &&
    pilotCfg.enabled &&
    isWithinPilotSchedule(pilotCfg);

  const visitorToken = generateVisitorToken();
  const visitorTokenHash = hashVisitorToken(visitorToken);

  const convRef = db().collection('conversations').doc();
  const msgRef = convRef.collection('messages').doc();
  const now = FieldValue.serverTimestamp();
  const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

  const batch = db().batch();
  batch.set(convRef, {
    source: 'web',
    member_id: null,
    member_name: name,
    visitor_phone: phone,
    visitor_token_hash: visitorTokenHash,
    branch_id: branchId,
    status: 'open',
    ai_mode: autoPilotActive ? 'auto' : 'human',
    escalated: false,
    escalation_reason: null,
    ai_turns_count: 0,
    created_at: now,
    last_message_at: now,
    last_message_preview: messageText.slice(0, 100),
    unread_member: 0,
    unread_staff: autoPilotActive ? 0 : 1,
    expires_at: expiresAt,
  });
  batch.set(msgRef, {
    sender: 'member',
    sender_name: name,
    text: messageText,
    created_at: now,
    read: false,
    expires_at: expiresAt,
  });
  await batch.commit();

  if (autoPilotActive) {
    // Atiende el AI Pilot en segundo plano; solo alertará al staff si escala a humano
    event.waitUntil(runAiPilotTurn(convRef.id));
  } else {
    // Sin piloto activo: notificación push best-effort al tópico de recepción
    event.waitUntil(
      sendStaffTopicPush({
        title: `Nuevo chat web: ${name}`,
        body: messageText.slice(0, 120),
        data: { kind: 'support', source: 'web', conversation_id: convRef.id, route: '/soporte' },
      }).catch(() => undefined),
    );
  }

  return {
    conversationId: convRef.id,
    visitorToken,
    message: {
      id: msgRef.id,
      conversationId: convRef.id,
      sender: 'member',
      senderName: name,
      text: messageText,
      createdAt: Date.now(),
      read: false,
    },
  };
});
