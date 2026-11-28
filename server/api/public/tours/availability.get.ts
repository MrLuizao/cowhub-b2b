import { db } from '../../../utils/db';
import {
  maxToursForDate,
  todayCDMX,
  TOUR_MAX_SATURDAY,
  TOUR_MAX_SUNDAY,
  TOUR_MAX_WEEKDAY,
} from '../../../utils/public-booking';

const MONTH_RE = /^\d{4}-\d{2}$/;

/// GET /api/public/tours/availability?month=YYYY-MM
/// Devuelve conteo de tours agendados por fecha (sin PII) y días llenos.
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const today = todayCDMX();
  const rawMonth = String(query.month ?? today.slice(0, 7)).trim();
  const month = MONTH_RE.test(rawMonth) ? rawMonth : today.slice(0, 7);

  const startDate = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

  const snap = await db()
    .collection('tour_requests')
    .where('preferred_date', '>=', startDate)
    .where('preferred_date', '<=', endDate)
    .get();

  const counts: Record<string, number> = {};
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.status === 'cancelled') continue;
    const d = String(data.preferred_date ?? '');
    if (!d) continue;
    counts[d] = (counts[d] ?? 0) + 1;
  }

  const fullDates: string[] = [];
  for (let day = 1; day <= lastDay; day++) {
    const dateKey = `${month}-${String(day).padStart(2, '0')}`;
    const max = maxToursForDate(dateKey);
    if (max === 0 || (counts[dateKey] ?? 0) >= max) {
      fullDates.push(dateKey);
    }
  }

  return {
    month,
    today,
    maxPerDay: {
      weekday: TOUR_MAX_WEEKDAY,
      saturday: TOUR_MAX_SATURDAY,
      sunday: TOUR_MAX_SUNDAY,
    },
    counts,
    fullDates,
  };
});
