import type { AiPilotConfig, AiPilotSimulationResult } from '#shared/types';

import { getAiPilotConfig } from '../../utils/ai-pilot/config';
import { generateAiPilotReply } from '../../utils/ai-pilot/engine';
import { requireStaff } from '../../utils/staff-auth';

interface SimulateBody {
  message?: string;
  history?: Array<{ sender: 'member' | 'ai'; text: string }>;
  configOverride?: Partial<AiPilotConfig>;
}

/// POST /api/ai-pilot/simulate - sandbox de prueba (dryRun) para Admin/Gerente.
export default defineEventHandler(async (event): Promise<AiPilotSimulationResult> => {
  const staff = await requireStaff(event);
  if (staff.role === 'RECEPTIONIST') {
    throw createError({ statusCode: 403, statusMessage: 'Sin acceso al simulador' });
  }

  const body = (await readBody<SimulateBody>(event)) ?? {};
  const message = String(body.message ?? '').trim();
  if (!message) {
    throw createError({ statusCode: 400, statusMessage: 'Escribe un mensaje de prueba' });
  }

  const savedCfg = await getAiPilotConfig();
  const cfg: AiPilotConfig = {
    ...savedCfg,
    ...(body.configOverride ?? {}),
    tools: {
      ...savedCfg.tools,
      ...(body.configOverride?.tools ?? {}),
    },
  };

  const prior = Array.isArray(body.history)
    ? body.history.slice(-10).map((m) => ({
        sender: (m.sender === 'ai' ? 'ai' : 'member') as 'member' | 'ai',
        text: String(m.text ?? ''),
      }))
    : [];

  return generateAiPilotReply({
    cfg,
    history: [...prior, { sender: 'member', text: message }],
    contact: {
      name: 'Cliente de prueba',
      phone: '7220000000',
      isMember: false,
    },
    dryRun: true,
  });
});
