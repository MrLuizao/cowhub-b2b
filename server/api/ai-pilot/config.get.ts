import type { AiPilotConfig } from '#shared/types';

import { getAiPilotConfig } from '../../utils/ai-pilot/config';
import { getBusinessFeatures } from '../../utils/config';
import { requireStaff } from '../../utils/staff-auth';

/// GET /api/ai-pilot/config - devuelve configuración actual del AI Pilot (Admin y Gerente).
export default defineEventHandler(async (event): Promise<{
  provisioned: boolean;
  hasGeminiKey: boolean;
  config: AiPilotConfig;
}> => {
  const staff = await requireStaff(event);
  if (staff.role === 'RECEPTIONIST') {
    throw createError({ statusCode: 403, statusMessage: 'Sin acceso al módulo Piloto IA' });
  }

  const [features, config] = await Promise.all([
    getBusinessFeatures(),
    getAiPilotConfig(),
  ]);

  return {
    provisioned: Boolean(features.ai_autopilot?.enabled),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
    config,
  };
});
