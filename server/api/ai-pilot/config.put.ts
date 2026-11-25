import type { AiPilotConfig } from '#shared/types';

import { saveAiPilotConfig } from '../../utils/ai-pilot/config';
import { requireAdmin } from '../../utils/staff-auth';

/// PUT /api/ai-pilot/config - guarda configuración del AI Pilot (solo ADMIN).
export default defineEventHandler(async (event): Promise<{ config: AiPilotConfig }> => {
  await requireAdmin(event);
  const body = (await readBody<Partial<AiPilotConfig>>(event)) ?? {};
  const config = await saveAiPilotConfig(body);
  return { config };
});
