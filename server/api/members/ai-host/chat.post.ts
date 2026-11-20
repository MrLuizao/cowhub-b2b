import type { MemberAiHostChatResponse } from '#shared/types';
import { db } from '../../../utils/db';
import { generateHostChatWithGemini, type ChatMessage } from '../../../utils/gemini';
import { requireMember } from '../../../utils/member-auth';

/**
 * Parámetro a nivel de código para encender/apagar el Host de Bolsillo.
 * Cambiar este valor a `true` (o definir AI_HOST_CHAT_ENABLED='1') para habilitarlo.
 */
const AI_HOST_CHAT_ENABLED = process.env.AI_HOST_CHAT_ENABLED === '1' || false;

export default defineEventHandler(async (event): Promise<MemberAiHostChatResponse> => {
  if (!AI_HOST_CHAT_ENABLED) {
    throw createError({
      statusCode: 404,
      statusMessage:
        'La función de Host IA conversacional se encuentra temporalmente inactiva a nivel de código.',
    });
  }

  const memberCtx = await requireMember(event);
  const body = await readBody<{
    message?: string;
    history?: ChatMessage[];
  }>(event);

  const rawMessage = (body?.message || '').trim();
  if (!rawMessage) {
    throw createError({
      statusCode: 400,
      statusMessage: 'El mensaje no puede estar vacío.',
    });
  }

  // Cargar datos del miembro y de su sede para contextualizar la respuesta
  const userRef = db().collection('users').doc(memberCtx.id);
  const userSnap = await userRef.get();
  const userData = userSnap.data() ?? {};

  const firstName = String(userData.name || memberCtx.name || 'Miembro').split(' ')[0];
  const branchId = String(userData.branch_id || memberCtx.branchId || '');

  let branchName = 'nuestro coworking';
  if (branchId) {
    const branchSnap = await db().collection('branches').doc(branchId).get();
    if (branchSnap.exists) {
      branchName = String(branchSnap.data()?.name || branchName);
    }
  }

  const weeklyGoal = Number(userData.weekly_goal ?? 4);

  const systemInstruction = `Eres el "Asistente COW-HUB", el asistente oficial del business center ${branchName} en México.
Estás conversando directamente con ${firstName}, miembro del coworking (su meta semanal son ${weeklyGoal} días de asistencia).

Reglas de conducta y estilo:
1. Habla en español mexicano natural, cálido, profesional y cercano (tono de un business center premium).
2. Respuestas concisas, prácticas y estructuradas para leerse rápidamente en un smartphone (usa negritas, viñetas cortas y emojis oportunos).
3. Especialízate en: reservas de salas de juntas y espacios, horarios y disponibilidad, membresías y planes, escritorios dedicados y oficinas privadas, wifi y conectividad, café de barra, amenidades del centro y agendar visitas guiadas.
4. Si el miembro reporta un problema con el espacio, el wifi o el servicio, indícale que recepción lo atenderá de inmediato en su sede.
5. Invita siempre a la acción y a aprovechar al máximo su membresía en ${branchName}.`;

  const history: ChatMessage[] = Array.isArray(body?.history)
    ? body.history
        .filter((h) => h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string')
        .slice(-8)
        .map((h) => ({ role: h.role, text: h.text.trim() }))
    : [];

  history.push({ role: 'user', text: rawMessage });

  const result = await generateHostChatWithGemini(history, systemInstruction);

  return {
    reply: result.reply,
    aiPowered: result.aiPowered,
  };
});
