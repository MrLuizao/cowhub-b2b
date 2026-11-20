#!/usr/bin/env node
/// Migra las colecciones heredadas del gym a las nuevas de COW-HUB:
///   trainers  → hosts        (docs tal cual)
///   classes   → activities   (coach_id→host_id, coach→host)
///   bookings / bookings_archive: class_id→activity_id, class_date→activity_date
/// Uso: node scripts/migrate-domains.mjs   (lee service-account.json de la raíz)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(
  readFileSync(resolve(process.cwd(), 'service-account.json'), 'utf8'),
);
const app = initializeApp({ credential: cert(sa) });
const db = getFirestore(app);

async function copyCollection(src, dst, mapData) {
  const snap = await db.collection(src).get();
  let copied = 0;
  for (const doc of snap.docs) {
    const target = db.collection(dst).doc(doc.id);
    const existing = await target.get();
    if (existing.exists) {
      console.log(`  ~ ${src}/${doc.id} ya existe en ${dst}, se omite`);
      continue;
    }
    await target.set(mapData ? mapData(doc.data()) : doc.data());
    copied++;
  }
  console.log(`✓ ${src} → ${dst}: ${copied} docs copiados (${snap.size} leídos)`);
  return snap.size;
}

async function renameBookingFields(col) {
  const snap = await db.collection(col).get();
  let updated = 0;
  for (const doc of snap.docs) {
    const clean = { ...doc.data() };
    if ('class_id' in clean) { clean.activity_id = clean.class_id; delete clean.class_id; }
    if ('class_date' in clean) { clean.activity_date = clean.class_date; delete clean.class_date; }
    await doc.ref.set(clean);
    updated++;
  }
  console.log(`✓ ${col}: ${updated} docs con activity_id/activity_date`);
}

const trainers = await copyCollection('trainers', 'hosts');
const classes = await copyCollection('classes', 'activities', (d) => {
  const out = { ...d };
  if ('coach_id' in out) { out.host_id = out.coach_id; delete out.coach_id; }
  if ('coach' in out) { out.host = out.coach; delete out.coach; }
  return out;
});
await renameBookingFields('bookings');
await renameBookingFields('bookings_archive');

console.log(`\nListo. trainers:${trainers} classes:${classes} migrados.`);
console.log('Las colecciones viejas (trainers/classes) NO se borraron — verifica en el B2B y bórralas a mano si todo se ve bien.');
process.exit(0);
