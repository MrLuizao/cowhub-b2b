#!/usr/bin/env node
/// Crea un usuario staff: Firebase Auth (email/password) + doc staff/{uid}.
/// Uso: node scripts/create-staff.mjs <email> <password> [role] [name] [branchId]
///   role: ADMIN | MANAGER | RECEPTIONIST (default ADMIN)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const [email, password, role = 'ADMIN', name, branchId] = process.argv.slice(2);
if (!email || !password) {
  console.error('Uso: node scripts/create-staff.mjs <email> <password> [role] [name] [branchId]');
  process.exit(1);
}
if (!['ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(role)) {
  console.error('role debe ser ADMIN | MANAGER | RECEPTIONIST');
  process.exit(1);
}

const sa = JSON.parse(
  readFileSync(resolve(process.cwd(), 'service-account.json'), 'utf8'),
);
const app = initializeApp({ credential: cert(sa) });
const auth = getAuth(app);
const db = getFirestore(app);

console.log('Proyecto:', sa.project_id);

let uid;
try {
  const user = await auth.getUserByEmail(email);
  uid = user.uid;
  await auth.updateUser(uid, { password, emailVerified: true });
  console.log('✓ Auth existente actualizado:', email);
} catch {
  const user = await auth.createUser({ email, password, emailVerified: true });
  uid = user.uid;
  console.log('✓ Auth creado:', email);
}

await db.collection('staff').doc(uid).set(
  {
    email,
    name: name ?? email.split('@')[0],
    role,
    branch_id: branchId ?? null,
    active: true,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  },
  { merge: true },
);
console.log('✓ staff/{uid} →', { uid, role, name: name ?? email.split('@')[0] });
console.log('Listo. Entra al B2B con', email);
