import type { BookableSpace } from '#shared/types';

import { db } from '../../utils/db';
import { toBookableSpace } from '../../utils/public-booking';

/// GET /api/public/spaces - catálogo público de espacios reservables desde Firestore.
export default defineEventHandler(async (): Promise<BookableSpace[]> => {
  const snap = await db().collection('spaces').where('active', '==', true).get();
  return snap.docs
    .map(toBookableSpace)
    .sort((a, b) => (a.name < b.name ? -1 : 1));
});
