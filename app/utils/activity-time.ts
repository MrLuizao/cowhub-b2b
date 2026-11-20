import type { ActivityBranchTime, Activity } from '#shared/types';

/// Horario/sala efectivos de una actividad en una sede: override local si existe,
/// si no los valores base de la actividad.
export function activityTimeAt(
  activity: Activity,
  branchId: string | null | undefined,
): ActivityBranchTime {
  const local = branchId ? activity.branchTimes?.[branchId] : undefined;
  return {
    startMinutes: local?.startMinutes ?? activity.startMinutes,
    endMinutes: local?.endMinutes ?? activity.endMinutes,
    room: local?.room ?? activity.room,
  };
}
