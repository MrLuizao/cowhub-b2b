import type {
  ChurnRiskLevel,
  RetentionPlaybookId,
  SupportIntent,
} from '#shared/types';

const GEMINI_MODELS = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash'];
const GEMINI_TIMEOUT_MS = 9000;

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

/**
 * Llama a la API REST de Google Gemini con timeout corto.
 * Retorna `null` si no hay `GEMINI_API_KEY` o si la llamada falla, permitiendo
 * que el caller use un fallback contextual determinista sin romper el flujo.
 */
export async function generateWithGemini(
  prompt: string,
  systemInstruction?: string,
  jsonMode = false,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.45,
      maxOutputTokens: 320,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  for (const model of GEMINI_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[gemini] (${model}) HTTP ${res.status}:`, errText.slice(0, 220));
        if (res.status === 503 || res.status === 429 || res.status === 404) continue;
        return null;
      }

      const data = (await res.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) return text;
    } catch (err) {
      console.error(`[gemini] (${model}) error:`, err);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export interface RetentionMessageContext {
  memberName: string;
  daysSinceLastVisit: number;
  avgVisitsPerWeek: number;
  points: number;
  weeklyGoal: number;
  playbook: RetentionPlaybookId;
  action: 'push' | 'ticket' | 'bonus_push';
  topFactors: string[];
}

export function buildFallbackRetentionMessage(ctx: RetentionMessageContext): {
  title: string;
  message: string;
} {
  const firstName = ctx.memberName.split(' ')[0] || 'Miembro';

  switch (ctx.playbook) {
    case 'streak_rescue':
      if (ctx.action === 'bonus_push') {
        return {
          title: `🔥 ¡Bono de rescate +25 pts para ti, ${firstName}!`,
          message: `Hola ${firstName}, abonamos +25 pts de impulso a tu cuenta (tienes ${ctx.points + 25} pts). Regresa esta semana por tus ${ctx.weeklyGoal} visitas y desbloquea +50 pts extra.`,
        };
      }
      return {
        title: `🔥 ¡No dejes enfriar tus ${ctx.points} puntos, ${firstName}!`,
        message: `Hola ${firstName}, llevas ${ctx.daysSinceLastVisit} días sin visitarnos. Estás muy cerca de canjear una recompensa con tus ${ctx.points} pts acumulados. ¡Te esperamos hoy!`,
      };

    case 'schedule_unlock':
      return {
        title: `📅 Mejores horarios disponibles para ti, ${firstName}`,
        message: `Hola ${firstName}, notamos que varias de tus reservas recientes se cancelaron. ¿Te ayudamos a encontrar un horario con más cupo en tus espacios favoritas esta semana?`,
      };

    case 'payment_assist':
      return {
        title: `💳 Apoyo con tu membresía, ${firstName}`,
        message: `Hola ${firstName}, queremos asegurarnos de que no tengas ningún inconveniente con tu membresía ni pierdas tus ${ctx.points} puntos acumulados. ¿Te apoyamos desde recepción?`,
      };

    case 'human_care':
      return {
        title: `👋 Seguimiento personal de tu sede`,
        message: `Hola ${firstName}, te escribimos de gerencia porque hace ${ctx.daysSinceLastVisit} días no te vemos y queremos saber si todo estuvo bien en tus últimas visitas o si podemos mejorar algo para ti.`,
      };

    case 'habit_boost':
    default:
      return {
        title: `💪 ¡Retoma tu ritmo hoy, ${firstName}!`,
        message: `Hola ${firstName}, hace ${ctx.daysSinceLastVisit} días no ocupas tu espacio en COW-HUB. Una reserva hoy basta para retomar tu meta semanal de ${ctx.weeklyGoal} días.`,
      };
  }
}

export async function generateRetentionPlaybookMessage(
  ctx: RetentionMessageContext,
): Promise<{ title: string; message: string; aiPowered: boolean }> {
  const fallback = buildFallbackRetentionMessage(ctx);

  const systemPrompt =
    'Eres el asistente de retención de un coworking en México. Redacta en español mexicano natural, cálido, conciso y directo (sin exagerar signos ni sonar robótico). Responde únicamente en JSON con las llaves {"title": string, "message": string}. El title máximo 55 caracteres y el message máximo 210 caracteres.';

  const userPrompt = `Miembro: ${ctx.memberName}
Días sin asistir: ${ctx.daysSinceLastVisit}
Promedio semanal último mes: ${ctx.avgVisitsPerWeek.toFixed(1)} visitas/sem (meta: ${ctx.weeklyGoal})
Puntos acumulados: ${ctx.points} pts
Causas de riesgo detectadas: ${ctx.topFactors.join(', ') || 'Baja asistencia reciente'}
Jugada seleccionada: ${ctx.playbook}
Canal: ${ctx.action === 'ticket' ? 'Mensaje directo de soporte/gerencia' : ctx.action === 'bonus_push' ? 'Notificación Push otorgando +25 puntos de bono de rescate hoy' : 'Notificación Push móvil'}`;

  const raw = await generateWithGemini(userPrompt, systemPrompt, true);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { title?: string; message?: string };
      if (parsed.title && parsed.message) {
        return {
          title: parsed.title.slice(0, 65),
          message: parsed.message.slice(0, 260),
          aiPowered: true,
        };
      }
    } catch {
      // Cae a fallback
    }
  }

  return { ...fallback, aiPowered: false };
}

export interface SupportCopilotInput {
  memberName: string;
  planName: string;
  membershipStatus: string;
  membershipUntil: string | null;
  points: number;
  goalStreak: number;
  weeklyGoal: number;
  churnRiskLevel: ChurnRiskLevel;
  daysSinceLastVisit: number;
  messages: Array<{ sender: 'member' | 'staff'; text: string }>;
}

export function classifySupportIntent(lastMemberMessage: string): {
  intent: SupportIntent;
  intentLabel: string;
  urgency: 'high' | 'normal';
} {
  const text = lastMemberMessage.toLowerCase();

  if (
    /queja|molest|mal servicio|cancelar|baja|reembolso|devolucion|sucio|groser|no sirve/.test(
      text,
    )
  ) {
    return { intent: 'complaint', intentLabel: '🚨 Queja / Retención', urgency: 'high' };
  }
  if (/pago|cobr|mensualidad|tarjeta|factura|venc|renov|precio|plan|cargo/.test(text)) {
    return { intent: 'billing', intentLabel: '💳 Cobro / Membresía', urgency: 'normal' };
  }
  if (/espacio|sala|oficina|hot desk|horario|cupo|reserv|encargado|anfitrión/.test(text)) {
    return { intent: 'activities', intentLabel: '📅 Espacios / Horarios', urgency: 'normal' };
  }
  if (/qr|acceso|entrar|pin|recompensa|punto|canje|codigo/.test(text)) {
    return { intent: 'access', intentLabel: '🔑 Acceso / Puntos', urgency: 'normal' };
  }
  return { intent: 'general', intentLabel: '💬 Consulta General', urgency: 'normal' };
}

export async function generateSupportCopilotSuggestions(
  input: SupportCopilotInput,
): Promise<{
  intent: SupportIntent;
  intentLabel: string;
  urgency: 'high' | 'normal';
  suggestions: string[];
  aiPowered: boolean;
}> {
  const lastMemberMsg =
    [...input.messages].reverse().find((m) => m.sender === 'member')?.text || '';
  const classification = classifySupportIntent(lastMemberMsg);
  if (input.churnRiskLevel === 'high') {
    classification.urgency = 'high';
  }

  const firstName = input.memberName.split(' ')[0] || 'hola';
  const untilLabel = input.membershipUntil || 'sin fecha registrada';

  const fallbackSuggestionsByIntent: Record<SupportIntent, string[]> = {
    billing: [
      `Hola ${firstName}, revisé tu ficha: tienes el plan ${input.planName} (${input.membershipStatus === 'ACTIVE' ? `vigente hasta el ${untilLabel}` : 'vencido'}). ¿Te apoyo con tu renovación o comprobante?`,
      `¡Con gusto, ${firstName}! Puedes renovar directamente en recepción o desde la app. Además tienes ${input.points} puntos acumulados en tu cuenta.`,
      `Hola ${firstName}, déjame validar el movimiento en caja de tu sede y te confirmo en un par de minutos.`,
    ],
    activities: [
      `Hola ${firstName}, recuerda que puedes reservar o liberar tu espacio desde la app hasta con 7 días de anticipación. ¿Qué sala o oficina buscas?`,
      `¡Hola ${firstName}! Si un espacio aparece ocupado hoy, te recomiendo revisar 1 hora antes por lugares liberados o dime qué horario prefieres para ayudarte.`,
      `Con gusto reviso la disponibilidad del espacio en tu sede, ${firstName}. ¿Para qué día y hora te gustaría reservar?`,
    ],
    complaint: [
      `Hola ${firstName}, lamento mucho el inconveniente. Ya lo reporté con la gerencia de tu sede para atenderlo hoy mismo. ¿Nos das oportunidad de compensarte en tu próxima visita?`,
      `Gracias por avisarnos, ${firstName}. Para nosotros es prioridad que trabajes cómodo; el gerente de sede revisará tu caso personalmente.`,
      `Hola ${firstName}, entendemos tu molestia y queremos resolverlo de inmediato. ¿Prefieres que te marquemos o lo vemos hoy en recepción cuando nos visites?`,
    ],
    access: [
      `Hola ${firstName}, tu membresía ${input.planName} aparece ${input.membershipStatus === 'ACTIVE' ? `ACTIVA (vence el ${untilLabel})` : 'por renovar'} y cuentas con ${input.points} puntos disponibles.`,
      `¡Hola ${firstName}! Si tienes detalle con tu QR o código de canje, al llegar a recepción te damos acceso con tu número de miembro sin problema.`,
      `Hola ${firstName}, tienes ${input.points} pts y racha de ${input.goalStreak} sem. Puedes generar tu código de recompensa en la pestaña Premios de la app.`,
    ],
    general: [
      `¡Hola ${firstName}! Te atendemos de recepción. Veo que tienes activo tu plan ${input.planName} (vence el ${untilLabel}). ¿En qué te podemos apoyar hoy?`,
      `Con gusto te ayudo, ${firstName}. También aprovecho para recordarte que tienes ${input.points} puntos acumulados en tu perfil.`,
      `Hola ${firstName}, ya estamos revisando tu solicitud en sede y te respondemos en un momento.`,
    ],
  };

  const historyText = input.messages
    .slice(-6)
    .map((m) => `${m.sender === 'member' ? 'Miembro' : 'Recepción'}: ${m.text}`)
    .join('\n');

  const systemPrompt =
    'Eres el copiloto de atención a miembros de un coworking en México. Genera exactamente 3 opciones de respuesta breves, amables y útiles para que recepción conteste con 1 click usando los datos reales del miembro. Responde únicamente en JSON con el formato {"suggestions": [string, string, string]}. Cada respuesta debe tener máximo 190 caracteres.';

  const userPrompt = `Datos reales del miembro:
- Nombre: ${input.memberName}
- Plan: ${input.planName} (${input.membershipStatus}, vence: ${untilLabel})
- Puntos de lealtad: ${input.points} pts (racha: ${input.goalStreak} semanas, meta: ${input.weeklyGoal}/sem)
- Días sin asistir: ${input.daysSinceLastVisit} (Riesgo de abandono: ${input.churnRiskLevel})

Historial reciente del chat:
${historyText || '(Conversación recién abierta)'}`;

  const raw = await generateWithGemini(userPrompt, systemPrompt, true);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { suggestions?: string[] };
      if (Array.isArray(parsed.suggestions) && parsed.suggestions.length >= 2) {
        return {
          ...classification,
          suggestions: parsed.suggestions.slice(0, 3).map((s) => String(s).trim()),
          aiPowered: true,
        };
      }
    } catch {
      // Cae a fallback
    }
  }

  return {
    ...classification,
    suggestions: fallbackSuggestionsByIntent[classification.intent],
    aiPowered: false,
  };
}

/// Sugerencias del Copiloto IA para visitantes web (cowhub-book) sin ficha de miembro.
export async function generateVisitorCopilotSuggestions(input: {
  visitorName: string;
  visitorPhone?: string | null;
  messages: Array<{ sender: 'member' | 'staff'; text: string }>;
}): Promise<{
  intent: SupportIntent;
  intentLabel: string;
  urgency: 'high' | 'normal';
  suggestions: string[];
  aiPowered: boolean;
}> {
  const lastVisitorMsg =
    [...input.messages].reverse().find((m) => m.sender === 'member')?.text || '';
  const classification = classifySupportIntent(lastVisitorMsg);
  const firstName = input.visitorName.split(' ')[0] || 'hola';

  const fallbackByIntent: Record<SupportIntent, string[]> = {
    billing: [
      `Hola ${firstName}, con gusto te comparto nuestros precios de salas por hora, día completo y membresías mensuales. ¿Qué espacio te interesa?`,
      `¡Hola ${firstName}! Aceptamos tarjeta, transferencia y emitimos factura fiscal. ¿Para cuántas personas buscas espacio?`,
      `Con gusto te cotizo hoy mismo, ${firstName}. ¿Prefieres oficina privada, sala de juntas o pase de coworking?`,
    ],
    activities: [
      `¡Hola ${firstName}! Puedes reservar salas de juntas, auditorio o cabinas directo en la web o te ayudamos desde aquí. ¿Para qué fecha y hora lo necesitas?`,
      `Hola ${firstName}, contamos con salas desde 4 hasta 40 personas en Metepec. ¿Cuántas personas asistirán?`,
      `Con gusto reviso disponibilidad ahora mismo, ${firstName}. ¿Qué día y horario tienes en mente?`,
    ],
    complaint: [
      `Hola ${firstName}, lamentamos el inconveniente. Con gusto lo revisamos de inmediato desde recepción en Metepec para ayudarte.`,
      `Gracias por avisarnos, ${firstName}. ¿Nos puedes compartir un poco más de detalle para resolverlo cuanto antes?`,
      `Hola ${firstName}, ya canalicé tu comentario con nuestro equipo para darte una solución hoy mismo.`,
    ],
    access: [
      `¡Hola ${firstName}! Estamos en Paseo San Isidro 111, Metepec. Nuestro horario es Lun-Vie 7:00 a 21:00 y Sáb 9:00 a 15:00.`,
      `Hola ${firstName}, con gusto te agendamos una visita guiada de 30 minutos sin compromiso para que conozcas las instalaciones.`,
      `¡Claro, ${firstName}! Al llegar a recepción te damos acceso inmediato con tu nombre o folio de reserva.`,
    ],
    general: [
      `¡Hola ${firstName}! Bienvenido a COW-HUB Metepec. ¿Buscas reservar una sala, oficina privada o agendar un tour para conocernos?`,
      `Hola ${firstName}, con gusto te ayudamos desde recepción. Cuéntame qué necesitas y te doy información al momento.`,
      `¡Hola ${firstName}! Si gustas podemos agendar un tour de 30 minutos sin compromiso en Paseo San Isidro 111, Metepec.`,
    ],
  };

  const historyText = input.messages
    .slice(-6)
    .map((m) => `${m.sender === 'member' ? 'Visitante' : 'Recepción'}: ${m.text}`)
    .join('\n');

  const systemPrompt =
    'Eres el copiloto de atención comercial de COW-HUB Metepec (Business Center con oficinas privadas, salas de juntas, auditorio, coworking flexible y tours en Paseo San Isidro 111, Metepec; horario Lun-Vie 7:00-21:00, Sáb 9:00-15:00). Genera exactamente 3 respuestas breves, amables y claras para que recepción conteste con 1 click a un visitante web interesado. Responde únicamente en JSON con el formato {"suggestions": [string, string, string]}. Máximo 190 caracteres por respuesta y sin usar guion largo.';

  const userPrompt = `Visitante web: ${input.visitorName}${input.visitorPhone ? ` (Tel: ${input.visitorPhone})` : ''}

Historial reciente del chat:
${historyText || '(Consulta recién iniciada)'}`;

  const raw = await generateWithGemini(userPrompt, systemPrompt, true);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { suggestions?: string[] };
      if (Array.isArray(parsed.suggestions) && parsed.suggestions.length >= 2) {
        return {
          ...classification,
          suggestions: parsed.suggestions.slice(0, 3).map((s) => String(s).trim()),
          aiPowered: true,
        };
      }
    } catch {
      // Cae a fallback
    }
  }

  return {
    ...classification,
    suggestions: fallbackByIntent[classification.intent],
    aiPowered: false,
  };
}

export async function generateMemberHostTip(input: {
  memberName: string;
  branchName: string;
  bestHourWindow: string;
  bestHourOccupancyPct: number;
  usualHourLabel: string;
  usualHourOccupancyPct: number;
  currentGoal: number;
  suggestedGoal: number | null;
  visitsThisWeek: number;
  streak: number;
}): Promise<{ tip: string; aiPowered: boolean }> {
  const firstName = input.memberName.split(' ')[0] || 'Atleta';
  const remaining = Math.max(0, input.currentGoal - input.visitsThisWeek);

  const crowdDiff = input.usualHourOccupancyPct - input.bestHourOccupancyPct;
  const crowdComp =
    crowdDiff >= 10 && input.usualHourLabel !== input.bestHourWindow.split(' ')[0]
      ? ` (vs ${input.usualHourOccupancyPct}% a las ${input.usualHourLabel})`
      : '';

  const fallbackTip =
    input.suggestedGoal && input.suggestedGoal < input.currentGoal
      ? `${firstName}, ajustar tu meta a ${input.suggestedGoal} días te ayudará a asegurar los +50 pts esta semana. Hoy entre ${input.bestHourWindow} tendrás tu espacio casi vacío (${input.bestHourOccupancyPct}% de ocupación).`
      : remaining === 0
        ? `¡Meta semanal cumplida, ${firstName}! Si reservas hoy en ${input.branchName}, el horario de ${input.bestHourWindow} estará al ${input.bestHourOccupancyPct}% de capacidad.`
        : `${firstName}, te ${remaining === 1 ? 'falta 1 visita' : `faltan ${remaining} visitas`} para tus +50 pts. Si reservas hoy entre ${input.bestHourWindow} tendrás ~${input.bestHourOccupancyPct}% de ocupación${crowdComp}.`;

  const systemPrompt =
    'Eres el Asistente IA de COW-HUB dentro de la app móvil de un business center en México. Escribe un consejo motivador, directo y ultra conciso (máximo 185 caracteres, 1 o 2 oraciones) combinando la mejor ventana para reservar hoy y el progreso de meta semanal del miembro.';

  const userPrompt = `Miembro: ${firstName}
Sede: ${input.branchName}
Hora habitual: ${input.usualHourLabel} (${input.usualHourOccupancyPct}% ocupación estimado)
Mejor ventana hoy: ${input.bestHourWindow} (${input.bestHourOccupancyPct}% ocupación estimado)
Visitas esta semana: ${input.visitsThisWeek}/${input.currentGoal} (racha: ${input.streak} semanas)
Meta sugerida: ${input.suggestedGoal ? `${input.suggestedGoal} días/sem` : 'Mantener actual'}`;

  const raw = await generateWithGemini(userPrompt, systemPrompt, false);
  if (raw) {
    return {
      tip: raw.replace(/^["']|["']$/g, '').slice(0, 210),
      aiPowered: true,
    };
  }

  return { tip: fallbackTip, aiPowered: false };
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export function buildFallbackHostReply(msg: string): string {
  const lower = msg.toLowerCase();

  if (
    lower.includes('reserv') ||
    lower.includes('sala') ||
    lower.includes('espacio') ||
    lower.includes('horario') ||
    lower.includes('disponib')
  ) {
    return (
      '📅 **Reservas en COW-HUB:**\n\n' +
      '• **Salas de juntas y eventos:** reserva por hora o día completo desde la app o recepción.\n' +
      '• **Hot desk y coworking:** tu lugar de trabajo diario está incluido en tu membresía.\n' +
      '• Puedes liberar o mover tu reserva hasta con anticipación desde la app.\n\n' +
      '¿Buscas una sala para una junta o un espacio por horas? Dime fecha y horario y te ayudo.'
    );
  }

  if (
    lower.includes('wifi') ||
    lower.includes('internet') ||
    lower.includes('conex') ||
    lower.includes('red')
  ) {
    return (
      '📶 **Conectividad:**\n\n' +
      '• Wi-Fi empresarial de alta velocidad disponible en todo el centro.\n' +
      '• La red principal está en la recepción; pide tu acceso si es tu primera visita.\n' +
      '• Hay estaciones de trabajo con cable de red en las cabinas Focus para videollamadas estables.\n\n' +
      '¿Necesitas ayuda para conectarte? Avísale a recepción.'
    );
  }

  if (
    lower.includes('cafe') ||
    lower.includes('café') ||
    lower.includes('comida') ||
    lower.includes('bebida') ||
    lower.includes('snack') ||
    lower.includes('barra')
  ) {
    return (
      '☕ **Café de barra:**\n\n' +
      '• Café de especialidad, snacks y bebidas disponibles en el café de barra durante el horario del centro.\n' +
      '• Los miembros pueden llevar su propio alimento y usar las áreas comunes.\n\n' +
      '¿Algo más en lo que te pueda apoyar hoy?'
    );
  }

  if (
    lower.includes('oficina') ||
    lower.includes('escritorio') ||
    lower.includes('privada') ||
    lower.includes('dedicada')
  ) {
    return (
      '🏢 **Oficinas privadas y escritorios dedicados:**\n\n' +
      '• Oficinas privadas para equipos de 1 a 20 personas, con contratos mensuales flexibles.\n' +
      '• Escritorios dedicados para trabajo diario con más privacidad que el hot desk.\n' +
      '• Agenda una visita guiada con nuestro equipo comercial para ver opciones y precios.\n\n' +
      '¿Te interesa una oficina privada? Te conecto con ventas.'
    );
  }

  if (
    lower.includes('visita') ||
    lower.includes('tour') ||
    lower.includes('conocer') ||
    lower.includes('recorrido')
  ) {
    return (
      '🏛️ **Visita al centro:**\n\n' +
      '• Puedes agendar un tour guiado por recepción o desde la web.\n' +
      '• El tour incluye recepción, coworking, salas de juntas y amenidades.\n' +
      '• Si vienes como visitante, registra tu llegada en recepción.\n\n' +
      '¿Agendamos tu visita? Te confirmo horarios disponibles.'
    );
  }

  return (
    '👋 ¡Hola! Soy el asistente de COW-HUB, tu business center en Metepec. Puedo ayudarte con reservas de salas y espacios, horarios, membresías, wifi, café de barra o agendar una visita.\n\n' +
    '¿En qué te puedo apoyar hoy?'
  );
}

export async function generateHostChatWithGemini(
  messages: ChatMessage[],
  systemInstruction?: string,
): Promise<{ reply: string; aiPowered: boolean }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.text || '';

  if (apiKey && messages.length > 0) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7500);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const contents = messages.map((m) => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.text }],
      }));

      const body: Record<string, unknown> = {
        contents,
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 550,
        },
      };

      if (systemInstruction) {
        body.systemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.ok) {
        const data = (await res.json()) as GeminiResponse;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
          return { reply: text, aiPowered: true };
        }
      }
    } catch {
      // Fallback contextual
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    reply: buildFallbackHostReply(lastUserMsg),
    aiPowered: false,
  };
}
