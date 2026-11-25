import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import type { AiPilotConfig, AiPilotSimulationResult } from '#shared/types';

import { getBusinessFeatures } from '../config';
import { db } from '../db';
import { todayCDMX } from '../public-booking';
import { sendStaffTopicPush } from '../public-notify';
import { getAiPilotConfig, isWithinPilotSchedule } from './config';
import {
  executeCowhubTool,
  getBusinessSnapshot,
  getCowhubToolDeclarations,
  type GeminiFunctionDeclaration,
} from './cowhub-adapter';

const GEMINI_MODELS = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash'];
const GEMINI_TURN_TIMEOUT_MS = 15000;
const MAX_TOOL_ROUNDS = 3;

interface GeminiPart {
  text?: string;
  functionCall?: {
    name: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      role?: string;
      parts?: GeminiPart[];
    };
  }>;
}

async function callGeminiWithTools(
  contents: GeminiContent[],
  systemInstruction: string,
  declarations: GeminiFunctionDeclaration[],
): Promise<GeminiPart[] | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const body: Record<string, unknown> = {
    contents,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 420,
    },
  };
  if (declarations.length > 0) {
    body.tools = [{ functionDeclarations: declarations }];
  }

  for (const model of GEMINI_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TURN_TIMEOUT_MS);
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
        console.error(`[ai-pilot] (${model}) HTTP ${res.status}:`, errText.slice(0, 220));
        if (res.status === 503 || res.status === 429 || res.status === 404) continue;
        return null;
      }

      const data = (await res.json()) as GeminiApiResponse;
      const parts = data.candidates?.[0]?.content?.parts ?? null;
      if (parts) return parts;
    } catch (err) {
      console.error(`[ai-pilot] (${model}) error:`, err);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function toneInstruction(tone: AiPilotConfig['tone']): string {
  if (tone === 'cercano') {
    return 'Usa un tono cálido, amigable y cercano, tuteando con respeto.';
  }
  if (tone === 'directo') {
    return 'Usa un tono muy conciso, práctico y directo al punto (máximo 2-3 frases).';
  }
  return 'Usa un tono ejecutivo, amable y profesional, acorde a un Business Center premium.';
}

async function buildSystemInstruction(
  cfg: AiPilotConfig,
  contactInfo: { name: string; phone?: string | null; isMember: boolean },
): Promise<string> {
  const snapshot = await getBusinessSnapshot();
  const spacesText = snapshot.spaces
    .map(
      (s) =>
        `- ${s.name} (id: ${s.id}, cap: ${s.capacity} personas, $${s.pricePerHour} MXN/hr${s.pricePerDay ? `, $${s.pricePerDay} MXN/día` : ''})`,
    )
    .join('\n');
  const plansText = snapshot.plans
    .map((p) => `- ${p.name}: $${p.price} MXN/mes (${p.features.slice(0, 3).join(', ')})`)
    .join('\n');
  const faqsText = cfg.faqs.map((f) => `P: ${f.q}\nR: ${f.a}`).join('\n\n');

  return `Eres parte del equipo de "${cfg.agentName}" en COW-HUB Metepec.
Hoy es ${todayCDMX()} (zona horaria America/Mexico_City).
${toneInstruction(cfg.tone)}

Reglas estrictas:
- NUNCA menciones ni insinúes que eres una IA, un bot o un asistente virtual. Habla siempre con naturalidad como parte del equipo de recepción de COW-HUB Metepec.
- NUNCA uses guion largo (—). Usa punto, dos puntos o guion simple (-).
- Responde de forma breve y clara (idealmente 2 a 4 líneas, sin bloques largos de markdown).
- NUNCA inventes precios, horarios libres ni folios. Si preguntan disponibilidad exacta, llama a check_space_availability.
- Si quieren agendar un tour y falta nombre, correo o teléfono, pídelos amablemente antes de llamar create_tour_request.
- Si el cliente pide cambiar o reprogramar la fecha u horario de un tour o reserva existente, SIEMPRE llama a reschedule_tour_or_booking para actualizarlo realmente en la agenda. NUNCA confirmes un cambio de fecha sin haber ejecutado esa herramienta con éxito.
- Si el usuario pide hablar con un gerente o asesor específico, expresa una queja, problema de cobro o algo que no puedes resolver con certeza, llama SIEMPRE a escalate_to_human y dile amablemente que enseguida lo atiende un compañero de recepción.

Instrucciones del negocio:
${cfg.customInstructions}

Contacto actual:
- Nombre: ${contactInfo.name}${contactInfo.phone ? ` · Teléfono: ${contactInfo.phone}` : ''}
- Tipo: ${contactInfo.isMember ? 'Miembro registrado (App)' : 'Visitante web (COW-HUB Book)'}

Espacios activos:
${spacesText || '(Sin espacios cargados)'}

Membresías activas:
${plansText || '(Sin planes cargados)'}

Preguntas frecuentes:
${faqsText || '(Sin FAQs adicionales)'}`;
}

/// Ejecuta un turno del AI Pilot sobre un historial dado (usado tanto en vivo como en el simulador).
export async function generateAiPilotReply(opts: {
  cfg: AiPilotConfig;
  history: Array<{ sender: 'member' | 'staff' | 'ai'; text: string }>;
  contact: { name: string; phone?: string | null; isMember: boolean };
  dryRun?: boolean;
}): Promise<AiPilotSimulationResult> {
  const systemInstruction = await buildSystemInstruction(opts.cfg, opts.contact);
  const declarations = getCowhubToolDeclarations(opts.cfg);

  const contents: GeminiContent[] = opts.history.slice(-12).map((m) => ({
    role: m.sender === 'member' ? 'user' : 'model',
    parts: [{ text: m.text }],
  }));

  if (contents.length === 0) {
    return {
      reply: `¡Hola ${opts.contact.name}! Soy ${opts.cfg.agentName}. ¿En qué te podemos apoyar hoy?`,
      escalated: false,
      escalationReason: null,
      toolsUsed: [],
      aiPowered: false,
    };
  }

  const toolsUsed: Array<{ name: string; args: Record<string, unknown> }> = [];
  let escalated = false;
  let escalationReason: string | null = null;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const parts = await callGeminiWithTools(contents, systemInstruction, declarations);
    if (!parts) break;

    const fnCallPart = parts.find((p) => p.functionCall);
    const textPart = parts.find((p) => typeof p.text === 'string' && p.text.trim().length > 0);

    if (fnCallPart?.functionCall && round < MAX_TOOL_ROUNDS) {
      const fnName = fnCallPart.functionCall.name;
      const fnArgs = fnCallPart.functionCall.args ?? {};
      toolsUsed.push({ name: fnName, args: fnArgs });

      const exec = await executeCowhubTool(fnName, fnArgs, {
        dryRun: opts.dryRun,
        defaultVisitorName: opts.contact.name,
        defaultVisitorPhone: opts.contact.phone,
      });

      if (exec.escalateReason) {
        escalated = true;
        escalationReason = exec.escalateReason;
      }

      contents.push({ role: 'model', parts });
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: fnName,
              response: exec.result,
            },
          },
        ],
      });
      continue;
    }

    if (textPart?.text) {
      return {
        reply: textPart.text.replace(/—/g, '-').trim(),
        escalated,
        escalationReason,
        toolsUsed,
        aiPowered: true,
      };
    }
    break;
  }

  // Fallback seguro si Gemini no está configurado o agotó tiempo
  const lastUserMsg = [...opts.history].reverse().find((m) => m.sender === 'member')?.text ?? '';
  const asksHuman = /\b(humano|persona|asesor|gerente|queja|reembolso|cancelar)\b/i.test(lastUserMsg);
  if (asksHuman) {
    return {
      reply: 'Con gusto te comunico con nuestro equipo de recepción para atenderte personalmente en un momento.',
      escalated: true,
      escalationReason: 'Cliente solicitó atención humana',
      toolsUsed,
      aiPowered: false,
    };
  }

  return {
    reply: `Gracias por escribirnos, ${opts.contact.name}. En este momento nuestro equipo de recepción revisará tu mensaje y te responderá a la brevedad.`,
    escalated: true,
    escalationReason: 'Respuesta automática no disponible (fallback a recepción)',
    toolsUsed,
    aiPowered: false,
  };
}

/// Dispara un turno real del AI Pilot sobre una conversación abierta en Firestore.
/// Diseñado para correr en segundo plano vía `event.waitUntil(...)`.
export async function runAiPilotTurn(conversationId: string): Promise<void> {
  try {
    const features = await getBusinessFeatures();
    if (!features.ai_autopilot?.enabled) return;

    const cfg = await getAiPilotConfig();
    if (!cfg.enabled || !isWithinPilotSchedule(cfg)) return;

    const convRef = db().collection('conversations').doc(conversationId);
    const convSnap = await convRef.get();
    if (!convSnap.exists) return;

    const conv = convSnap.data()!;
    if (conv.status !== 'open') return;
    if (conv.ai_mode !== 'auto') return;

    // Evitar respuestas duplicadas por mensajes consecutivos rápidos (lock 15s)
    const lockMs = (conv.ai_processing_at as Timestamp | undefined)?.toMillis?.() ?? 0;
    if (lockMs && Date.now() - lockMs < 15_000) return;

    // Guardrail de turnos máximos consecutivos
    const turns = Number(conv.ai_turns_count ?? 0);
    if (turns >= cfg.maxAutoTurns) {
      await escalateConversation(
        convRef,
        conversationId,
        String(conv.member_name ?? 'Contacto'),
        'Límite de turnos automáticos alcanzado',
        'Para darte una atención más personalizada, te comunico ahora mismo con nuestro equipo de recepción.',
        cfg.agentName,
      );
      return;
    }

    await convRef.update({ ai_processing_at: Timestamp.now() });

    const msgsSnap = await convRef
      .collection('messages')
      .orderBy('created_at', 'asc')
      .limitToLast(12)
      .get();

    const history = msgsSnap.docs.map((d) => {
      const m = d.data();
      const sender: 'member' | 'staff' | 'ai' =
        m.sender === 'staff' ? 'staff' : m.sender === 'ai' ? 'ai' : 'member';
      return { sender, text: String(m.text ?? '') };
    });

    // Solo responder si el último mensaje efectivamente es del cliente
    const lastMsg = history[history.length - 1];
    if (!lastMsg || lastMsg.sender !== 'member') {
      await convRef.update({ ai_processing_at: FieldValue.delete() });
      return;
    }

    const result = await generateAiPilotReply({
      cfg,
      history,
      contact: {
        name: String(conv.member_name ?? 'Visitante'),
        phone: conv.visitor_phone ? String(conv.visitor_phone) : null,
        isMember: Boolean(conv.member_id),
      },
      dryRun: false,
    });

    // Re-verificar que un humano no haya tomado control mientras pensaba Gemini
    const freshSnap = await convRef.get();
    if (!freshSnap.exists || freshSnap.data()?.ai_mode !== 'auto') {
      return;
    }

    if (result.escalated) {
      await escalateConversation(
        convRef,
        conversationId,
        String(conv.member_name ?? 'Contacto'),
        result.escalationReason || 'Requiere atención humana',
        result.reply,
        cfg.agentName,
      );
      return;
    }

    const msgRef = convRef.collection('messages').doc();
    const now = FieldValue.serverTimestamp();
    const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

    await db().runTransaction(async (tx) => {
      tx.set(msgRef, {
        sender: 'ai',
        sender_name: cfg.agentName,
        text: result.reply,
        created_at: now,
        read: false,
        expires_at: expiresAt,
      });
      tx.update(convRef, {
        last_message_at: now,
        last_message_preview: result.reply.slice(0, 100),
        unread_member: FieldValue.increment(1),
        ai_turns_count: FieldValue.increment(1),
        ai_processing_at: FieldValue.delete(),
        expires_at: expiresAt,
      });
    });
  } catch (err) {
    console.error('[ai-pilot] Error en runAiPilotTurn:', err);
  }
}

async function escalateConversation(
  convRef: FirebaseFirestore.DocumentReference,
  conversationId: string,
  contactName: string,
  reason: string,
  replyText: string,
  agentName: string,
): Promise<void> {
  const msgRef = convRef.collection('messages').doc();
  const now = FieldValue.serverTimestamp();
  const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

  await db().runTransaction(async (tx) => {
    tx.set(msgRef, {
      sender: 'ai',
      sender_name: agentName,
      text: replyText,
      created_at: now,
      read: false,
      expires_at: expiresAt,
    });
    tx.update(convRef, {
      ai_mode: 'human',
      escalated: true,
      escalation_reason: reason,
      last_message_at: now,
      last_message_preview: replyText.slice(0, 100),
      unread_member: FieldValue.increment(1),
      unread_staff: FieldValue.increment(1),
      ai_processing_at: FieldValue.delete(),
      expires_at: expiresAt,
    });
  });

  void sendStaffTopicPush({
    title: `Escalado a recepción: ${contactName}`,
    body: reason,
    data: { kind: 'support', escalated: '1', conversation_id: conversationId, route: '/soporte' },
  }).catch(() => undefined);
}
