import type {
  AiPilotConfig,
  AiPilotFaq,
  AiPilotScheduleMode,
  AiPilotTone,
} from '#shared/types';

import { db } from '../db';

const TZ = 'America/Mexico_City';

export const DEFAULT_AI_PILOT_CONFIG: AiPilotConfig = {
  enabled: true,
  agentName: 'Recepción · COW-HUB',
  tone: 'ejecutivo',
  scheduleMode: 'always',
  customInstructions:
    'Responde siempre en español de México, de forma breve y clara. Ubicación oficial: Paseo San Isidro 111, Metepec. Teléfono: +52 (722) 222 0000. Correo: info@cowhub.mx. Horario: Lun-Vie 7:00 a 21:00 y Sáb 9:00 a 15:00. Nunca inventes precios ni disponibilidad: usa siempre las herramientas del negocio.',
  faqs: [
    {
      q: '¿Emiten factura fiscal?',
      a: 'Sí, emitimos factura fiscal (CFDI) en todas las reservas de espacios y membresías.',
    },
    {
      q: '¿Qué incluye el acceso a coworking y salas?',
      a: 'Internet dedicado de alta velocidad, café de barra, recepción ejecutiva y acceso a áreas comunes.',
    },
  ],
  tools: {
    checkAvailability: true,
    createTour: true,
  },
  maxAutoTurns: 12,
};

function sanitizeTone(v: unknown): AiPilotTone {
  return v === 'cercano' || v === 'directo' || v === 'ejecutivo' ? v : 'ejecutivo';
}

function sanitizeSchedule(v: unknown): AiPilotScheduleMode {
  return v === 'after_hours' ? 'after_hours' : 'always';
}

function sanitizeFaqs(raw: unknown): AiPilotFaq[] {
  if (!Array.isArray(raw)) return DEFAULT_AI_PILOT_CONFIG.faqs;
  return raw
    .map((item) => {
      const obj = item as { q?: unknown; a?: unknown };
      return {
        q: String(obj?.q ?? '').trim().slice(0, 200),
        a: String(obj?.a ?? '').trim().slice(0, 500),
      };
    })
    .filter((f) => f.q && f.a)
    .slice(0, 20);
}

/// Lee `/config/ai_pilot` en Firestore aplicando defaults seguros.
export async function getAiPilotConfig(): Promise<AiPilotConfig> {
  try {
    const snap = await db().collection('config').doc('ai_pilot').get();
    if (!snap.exists) return { ...DEFAULT_AI_PILOT_CONFIG };
    const d = snap.data() ?? {};
    return {
      enabled: d.enabled !== false,
      agentName: String(d.agent_name ?? DEFAULT_AI_PILOT_CONFIG.agentName).trim() || DEFAULT_AI_PILOT_CONFIG.agentName,
      tone: sanitizeTone(d.tone),
      scheduleMode: sanitizeSchedule(d.schedule_mode),
      customInstructions: String(d.custom_instructions ?? DEFAULT_AI_PILOT_CONFIG.customInstructions).trim(),
      faqs: sanitizeFaqs(d.faqs),
      tools: {
        checkAvailability: d.tools?.check_availability !== false,
        createTour: d.tools?.create_tour !== false,
      },
      maxAutoTurns: Math.min(30, Math.max(2, Number(d.max_auto_turns ?? DEFAULT_AI_PILOT_CONFIG.maxAutoTurns) || 12)),
      updatedAt: d.updated_at?.toMillis?.() ?? undefined,
    };
  } catch (err) {
    console.warn('[ai-pilot] No se pudo leer /config/ai_pilot, usando defaults:', err);
    return { ...DEFAULT_AI_PILOT_CONFIG };
  }
}

/// Guarda `/config/ai_pilot` en Firestore (invocado solo por ADMIN).
export async function saveAiPilotConfig(input: Partial<AiPilotConfig>): Promise<AiPilotConfig> {
  const current = await getAiPilotConfig();
  const next: AiPilotConfig = {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : current.enabled,
    agentName:
      typeof input.agentName === 'string' && input.agentName.trim()
        ? input.agentName.trim().slice(0, 60)
        : current.agentName,
    tone: input.tone ? sanitizeTone(input.tone) : current.tone,
    scheduleMode: input.scheduleMode ? sanitizeSchedule(input.scheduleMode) : current.scheduleMode,
    customInstructions:
      typeof input.customInstructions === 'string'
        ? input.customInstructions.trim().slice(0, 2500)
        : current.customInstructions,
    faqs: input.faqs ? sanitizeFaqs(input.faqs) : current.faqs,
    tools: {
      checkAvailability:
        typeof input.tools?.checkAvailability === 'boolean'
          ? input.tools.checkAvailability
          : current.tools.checkAvailability,
      createTour:
        typeof input.tools?.createTour === 'boolean'
          ? input.tools.createTour
          : current.tools.createTour,
    },
    maxAutoTurns:
      typeof input.maxAutoTurns === 'number'
        ? Math.min(30, Math.max(2, Math.round(input.maxAutoTurns)))
        : current.maxAutoTurns,
    updatedAt: Date.now(),
  };

  await db().collection('config').doc('ai_pilot').set(
    {
      enabled: next.enabled,
      agent_name: next.agentName,
      tone: next.tone,
      schedule_mode: next.scheduleMode,
      custom_instructions: next.customInstructions,
      faqs: next.faqs,
      tools: {
        check_availability: next.tools.checkAvailability,
        create_tour: next.tools.createTour,
      },
      max_auto_turns: next.maxAutoTurns,
      updated_at: new Date(),
    },
    { merge: true },
  );

  return next;
}

/// Evalúa si el AI Pilot debe operar en este momento según el horario CDMX.
export function isWithinPilotSchedule(cfg: AiPilotConfig): boolean {
  if (cfg.scheduleMode === 'always') return true;
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '12');

  // Horario de recepción: Lun-Vie 7-21, Sáb 9-15. 'after_hours' = fuera de ese rango.
  if (weekday === 'Sun') return true;
  if (weekday === 'Sat') return hour < 9 || hour >= 15;
  return hour < 7 || hour >= 21;
}
