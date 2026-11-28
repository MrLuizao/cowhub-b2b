import { db } from '../../../../utils/db';
import { CLOSE_HOUR, OPEN_HOUR, todayCDMX } from '../../../../utils/public-booking';

const MONTH_RE = /^\d{4}-\d{2}$/;

/// GET /api/public/spaces/:id/availability?month=YYYY-MM
/// Devuelve resumen de ocupación diaria del mes para pintar disponibilidad en el calendario.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? '';
  const query = getQuery(event);
  const today = todayCDMX();
  const rawMonth = String(query.month ?? today.slice(0, 7)).trim();
  const month = MONTH_RE.test(rawMonth) ? rawMonth : today.slice(0, 7);

  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const startDate = `${month}-01`;
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

  // Rango de un solo campo para evitar requerir índice compuesto en Firestore
  const snap = await db()
    .collection('space_bookings')
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .get();

  const hoursPerDay = CLOSE_HOUR - OPEN_HOUR;
  const byDate = new Map<string, { fullDay: boolean; hours: Set<number> }>();

  for (const doc of snap.docs) {
    const b = doc.data();
    if (b.space_id !== id) continue;
    if (b.status !== 'pending' && b.status !== 'confirmed') continue;
    const d = String(b.date ?? '');
    if (!d) continue;

    let entry = byDate.get(d);
    if (!entry) {
      entry = { fullDay: false, hours: new Set<number>() };
      byDate.set(d, entry);
    }

    if (b.mode === 'day') {
      entry.fullDay = true;
    } else {
      const s = Number(b.start_hour ?? 0);
      const e = Number(b.end_hour ?? 0);
      for (let h = Math.max(OPEN_HOUR, s); h < Math.min(CLOSE_HOUR, e); h++) {
        entry.hours.add(h);
      }
    }
  }

  const days: Record<string, { full: boolean; bookedHours: number }> = {};
  for (const [dateKey, entry] of byDate.entries()) {
    const bookedHours = entry.fullDay ? hoursPerDay : entry.hours.size;
    days[dateKey] = {
      full: entry.fullDay || bookedHours >= hoursPerDay,
      bookedHours,
    };
  }

  return {
    month,
    totalHours: hoursPerDay,
    days,
  };
});
