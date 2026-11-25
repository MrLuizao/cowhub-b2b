import type { AiMode } from '#shared/types';

import { db } from '../../../utils/db';
import { requireBranchScope, requireStaff } from '../../../utils/staff-auth';

/// POST /api/support/:id/mode
/// Permite al staff tomar control humano o devolver la conversación al AI Pilot.
export default defineEventHandler(async (event): Promise<{ ok: boolean; aiMode: AiMode }> => {
  const staff = await requireStaff(event);
  const id = getRouterParam(event, 'id') ?? '';
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID requerido' });
  }

  const body = (await readBody<{ aiMode?: string }>(event)) ?? {};
  const aiMode: AiMode = body.aiMode === 'auto' ? 'auto' : 'human';

  const convRef = db().collection('conversations').doc(id);
  const convSnap = await convRef.get();
  if (!convSnap.exists) {
    throw createError({ statusCode: 404, statusMessage: 'Conversación no encontrada' });
  }

  const conv = convSnap.data()!;
  requireBranchScope(staff, String(conv.branch_id ?? ''));

  await convRef.update({
    ai_mode: aiMode,
    escalated: false,
    escalation_reason: null,
    ...(aiMode === 'auto' ? { ai_turns_count: 0 } : {}),
  });

  return { ok: true, aiMode };
});
