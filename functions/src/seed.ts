import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { BRAND_TIMEZONE, db, localDateString, requireStaff } from './utils';

const DEMO_PASSWORD = 'demo1234';
const DAY = 86_400_000;

async function ensureUser(
  email: string,
  displayName: string,
): Promise<string> {
  const auth = getAuth();
  try {
    return (await auth.getUserByEmail(email)).uid;
  } catch {
    const user = await auth.createUser({ email, password: DEMO_PASSWORD, displayName });
    return user.uid;
  }
}

/// Curva de tráfico determinista (misma forma que el mock) para dailyStats.
function trafficCurve(daySeed: number): number[] {
  const arr = new Array<number>(24).fill(0);
  let a = daySeed;
  const rnd = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let h = 6; h <= 22; h++) {
    const morning = Math.exp(-((h - 8) ** 2) / 4.5);
    const evening = Math.exp(-((h - 19) ** 2) / 5.5);
    const base = 0.16 + 0.52 * morning + 0.78 * evening;
    arr[h] = Math.round(Math.max(0.05, base + (rnd() - 0.5) * 0.08) * 40);
  }
  return arr;
}

/// Siembra el esquema completo de FIRESTORE.md.
/// Primera corrida: sin auth (config/brand no existe). Re-seed: solo ADMIN.
export const seedDemo = onCall(async (request) => {
  const brandRef = db.collection('config').doc('brand');
  const brandSnap = await brandRef.get();
  if (brandSnap.exists) {
    const staff = await requireStaff(request);
    if (staff.role !== 'ADMIN') {
      throw new HttpsError('permission-denied', 'Solo admin re-siembra');
    }
  }

  const now = Date.now();
  const batch = db.batch();

  // ═══ config/brand ═══
  batch.set(brandRef, {
    name: 'COW-HUB',
    logo_url: '',
    colors: { primary: '#f97316', accent: '#f97316', background: '#0a0a0a' },
    timezone: BRAND_TIMEZONE,
    currency: 'MXN',
    socials: {},
  });

  // ═══ branches ═══
  const branches = [
    { id: 'select', name: 'Metepec Centro', max: 120, open: 420, close: 1260, address: 'Paseo San Isidro 111, Metepec', lat: 19.2548, lng: -99.6057 },
    { id: 'cowork', name: 'Coworking Flexible', max: 60, open: 420, close: 1260, address: 'Paseo San Isidro 111, Metepec', lat: 19.2549, lng: -99.6056 },
    { id: 'salas', name: 'Salas de Juntas', max: 40, open: 420, close: 1260, address: 'Paseo San Isidro 111, Metepec', lat: 19.2547, lng: -99.6058 },
    { id: 'auditorio', name: 'Auditorio Metepec', max: 200, open: 480, close: 1260, address: 'Paseo San Isidro 111, Metepec', lat: 19.2546, lng: -99.6059 },
  ];
  for (const b of branches) {
    batch.set(db.collection('branches').doc(b.id), {
      name: b.name,
      image_url: `https://picsum.photos/seed/ch-${b.id}/800/500`,
      address: b.address,
      max_capacity: b.max,
      current_capacity: 0,
      status: 'OPEN',
      open_minutes: b.open,
      close_minutes: b.close,
      lat: b.lat,
      lng: b.lng,
    });
  }

  // ═══ plans — price en pesos MXN (Stripe recibe ×100) ═══
  const plans = [
    { id: 'classic', name: 'Plan Classic', price: 199, features: ['Acceso a 1 sede', 'Actividades grupales', 'Pase digital QR'], highlight: false, all: false },
    { id: 'plus', name: 'Plan Plus', price: 299, features: ['Acceso a todas las sedes', 'Actividades grupales', 'Invita a 1 amigo/mes'], highlight: false, all: true },
    { id: 'black', name: 'Plan Black', price: 399, features: ['Acceso a todas las sedes', 'Actividades + invitados ilimitados', 'Cupones exclusivos'], highlight: true, all: true },
    { id: 'select', name: 'Plan Select', price: 249, features: ['Solo sede Select', 'Zona premium', 'Pase digital QR'], highlight: false, all: false },
    { id: 'xpress', name: 'Plan Xpress', price: 179, features: ['Solo sede Xpress', 'Horario extendido', 'Pase digital QR'], highlight: false, all: false },
  ];
  for (const p of plans) {
    batch.set(db.collection('plans').doc(p.id), {
      name: p.name,
      price: p.price,
      features: p.features,
      highlight: p.highlight,
      all_branches: p.all,
      stripe_product_id: null,
      stripe_price_id: null,
      active: true,
    });
  }

  // ═══ hosts ═══
  const hosts = [
    { id: 't1', name: 'Marcos Villalba', specialty: 'Recepción · Operación', branchIds: ['select', 'centro'], shift: 'MAÑANA', onDuty: true },
    { id: 't2', name: 'Lucía Ortega', specialty: 'Comunidad · Eventos', branchIds: ['select'], shift: 'MAÑANA', onDuty: true },
    { id: 't3', name: 'Diego Salas', specialty: 'Reservas · Agenda', branchIds: ['centro', 'carranza'], shift: 'TARDE', onDuty: true },
    { id: 't4', name: 'Carla Mendoza', specialty: 'Hospitalidad', branchIds: ['carranza', 'select'], shift: 'TARDE', onDuty: false },
    { id: 't5', name: 'Iván Paredes', specialty: 'Auditorio · Producción', branchIds: ['xpress', 'carranza'], shift: 'NOCHE', onDuty: false },
  ];
  for (const t of hosts) {
    batch.set(db.collection('hosts').doc(t.id), {
      branch_ids: t.branchIds,
      name: t.name,
      specialty: t.specialty,
      photo_url: `https://picsum.photos/seed/ch-${t.id}/300/300`,
      shift: t.shift,
      is_on_duty: t.onDuty,
      active: true,
    });
  }

  // ═══ activities ═══
  const activities = [
    { id: 'cl1', name: 'Salón de Juntas Modular', hostId: 't1', host: 'Marcos Villalba', branchIds: ['select', 'salas'], room: 'Sala Andamio', start: 540, end: 660, cap: 12, times: { salas: { start_minutes: 720, end_minutes: 840, room: 'Sala Proyector' } } },
    { id: 'cl2', name: 'Auditorio Metepec', hostId: 't2', host: 'Lucía Ortega', branchIds: ['auditorio'], room: 'Auditorio', start: 540, end: 900, cap: 120, times: null },
    { id: 'cl3', name: 'Cabinas Focus', hostId: 't3', host: 'Diego Salas', branchIds: ['cowork'], room: 'Cabina 1', start: 780, end: 840, cap: 8, times: null },
    { id: 'cl4', name: 'Terraza Sur', hostId: 't4', host: 'Carla Mendoza', branchIds: ['select'], room: 'Terraza', start: 1020, end: 1080, cap: 30, times: null },
    { id: 'cl4b', name: 'Hot Desk Flexible', hostId: '', host: 'Roxana Medina', branchIds: ['cowork'], room: 'Área abierta', start: 540, end: 1140, cap: 40, times: null },
    { id: 'cl4b2', name: 'Sala Andamio', hostId: 't5', host: 'Iván Paredes', branchIds: ['select'], room: 'Andamio', start: 600, end: 720, cap: 10, times: null },
  ];
  for (const c of activities) {
    batch.set(db.collection('activities').doc(c.id), {
      name: c.name,
      branch_ids: c.branchIds,
      host_id: c.hostId,
      host: c.host,
      room: c.room,
      start_minutes: c.start,
      end_minutes: c.end,
      capacity: c.cap,
      booked: 0,
      branch_times: c.times ?? {},
    });
  }

  await batch.commit();

  // ═══ auth users: staff + miembros ═══
  const adminUid = await ensureUser('admin@cowhub.mx', 'Admin Global');
  const managerUid = await ensureUser('gerente@cowhub.mx', 'Gerente Select');
  const recepUid = await ensureUser('recepcion@cowhub.mx', 'Recepción Select');

  const staffBatch = db.batch();
  staffBatch.set(db.collection('staff').doc(adminUid), { name: 'Admin Global', role: 'ADMIN', branch_id: null, active: true });
  staffBatch.set(db.collection('staff').doc(managerUid), { name: 'Gerente Select', role: 'MANAGER', branch_id: 'select', active: true });
  staffBatch.set(db.collection('staff').doc(recepUid), { name: 'Recepción Select', role: 'RECEPTIONIST', branch_id: 'select', active: true });
  await staffBatch.commit();

  const members = [
    { email: 'miembro1@cowhub.mx', name: 'Luis Rojas', branch: 'select', plan: 'black', num: 'CH-00421', until: now + 45 * DAY, status: 'ACTIVE' },
    { email: 'miembro2@cowhub.mx', name: 'Carla Mendoza', branch: 'carranza', plan: 'plus', num: 'CH-01187', until: now - 12 * DAY, status: 'EXPIRED' },
    { email: 'miembro3@cowhub.mx', name: 'Diego Salas', branch: 'centro', plan: 'select', num: 'CH-00873', until: now + 30 * DAY, status: 'ACTIVE' },
    { email: 'miembro4@cowhub.mx', name: 'Roxana Vega', branch: 'select', plan: 'black', num: 'CH-00219', until: now - 1 * DAY, status: 'ACTIVE' },
    { email: 'miembro5@cowhub.mx', name: 'Iván Paredes', branch: 'xpress', plan: 'xpress', num: 'CH-01540', until: now - 40 * DAY, status: 'EXPIRED' },
  ];
  const memberIds: string[] = [];
  const memberBatch = db.batch();
  for (const m of members) {
    const uid = await ensureUser(m.email, m.name);
    memberIds.push(uid);
    memberBatch.set(db.collection('users').doc(uid), {
      branch_id: m.branch,
      name: m.name,
      photo_url: `https://picsum.photos/seed/ch-${m.num}/300/300`,
      member_number: m.num,
      qr_code: uid,
      membership_status: m.status,
      membership_plan_id: m.plan,
      membership_until: Timestamp.fromMillis(m.until),
      first_name: null, middle_name: null, paternal_last_name: null,
      maternal_last_name: null, sex: null, birth_date: null,
      phone: null, id_number: null,
      stripe_customer_id: null,
      last_checkin_at: null,
      active_checkin_id: null,
      active_checkin_branch: null,
      created_at: FieldValue.serverTimestamp(),
    });
  }
  await memberBatch.commit();

  // ═══ payments (historial) ═══
  const payBatch = db.batch();
  const seeds = [
    { m: 0, plan: 'black', name: 'Plan Black', amount: 399, method: 'terminal', ago: 1 },
    { m: 2, plan: 'select', name: 'Plan Select', amount: 249, method: 'terminal', ago: 1 },
    { m: 3, plan: 'black', name: 'Plan Black', amount: 399, method: 'cash', ago: 0.7, declined: true },
    { m: 1, plan: 'plus', name: 'Plan Plus', amount: 299, method: 'cash', ago: 1.5 },
  ];
  seeds.forEach((s, i) => {
    payBatch.set(db.collection('payments').doc(), {
      member_id: memberIds[s.m] ?? '',
      member_name: members[s.m]?.name ?? '',
      member_number: members[s.m]?.num ?? '',
      branch_id: members[s.m]?.branch ?? '',
      plan_id: s.plan,
      plan: s.name,
      amount: s.amount,
      currency: 'mxn',
      provider: 'manual',
      method: s.method,
      transaction_id: `TX-SEED-${i + 1}`,
      stripe_payment_intent_id: null,
      stripe_charge_id: null,
      receipt_url: null,
      status: s.declined ? 'DECLINED' : 'APPROVED',
      failure_reason: s.declined ? 'Fondos insuficientes' : null,
      created_at: Timestamp.fromMillis(now - s.ago * DAY),
      created_by: 'reception',
    });
  });
  await payBatch.commit();

  // ═══ promotions (banner + cupones) ═══
  const promoBatch = db.batch();
  promoBatch.set(db.collection('promotions').doc('banner-1'), {
    type: 'banner', branch_id: null,
    title: 'Café de especialidad 25% OFF',
    subtitle: 'Café de barra · solo esta semana',
    badge: '-25%',
    image_url: 'https://picsum.photos/seed/ch-banner-1/900/500',
    created_at: Timestamp.fromMillis(now - DAY),
    expires_at: null,
  });
  const coupons = [
    { id: 'c1', title: 'Café de especialidad -25%', desc: 'En el café de barra de recepción', badge: '-25%', code: 'CH-PRO25', plans: ['plus', 'black'] },
    { id: 'c2', title: 'Invita a un amigo', desc: 'Pase de invitado gratis para un acompañante', badge: '1 FREE', code: 'CH-GUEST1', plans: ['black'] },
    { id: 'c3', title: 'Bebidas 2x1', desc: 'Bebidas del café de barra después de las 18:00', badge: '2x1', code: 'CH-BEB2X1', plans: ['classic', 'plus', 'select', 'xpress'] },
    { id: 'c4', title: 'Merch COW-HUB -15%', desc: 'Tazas, organizadores y accesorios', badge: '-15%', code: 'CH-MERCH15', plans: ['classic', 'select', 'xpress'] },
  ];
  for (const c of coupons) {
    promoBatch.set(db.collection('promotions').doc(c.id), {
      type: 'coupon', branch_id: null,
      title: c.title, description: c.desc, badge: c.badge, code: c.code,
      plan_ids: c.plans,
      created_at: Timestamp.fromMillis(now - 2 * DAY),
      expires_at: null,
    });
  }
  await promoBatch.commit();

  // ═══ sponsorAds ═══
  const adBatch = db.batch();
  const ads = [
    { id: 'ad1', advertiser: 'Café del Centro', title: 'Café de especialidad -20%', color: 0xfff97316, branch: null, status: 'ACTIVE', imp: 8420, taps: 512, ends: 30 },
    { id: 'ad2', advertiser: 'Papelería Office', title: 'Cuadernos y plumas -15%', color: 0xffef4444, branch: 'select', status: 'ACTIVE', imp: 3210, taps: 198, ends: 15 },
    { id: 'ad3', advertiser: 'Coworking Partners', title: 'Estacionamiento -10% en coworking', color: 0xff22c55e, branch: 'centro', status: 'PAUSED', imp: 1180, taps: 74, ends: 45 },
  ];
  for (const a of ads) {
    adBatch.set(db.collection('sponsorAds').doc(a.id), {
      advertiser: a.advertiser,
      title: a.title,
      subtitle: 'Solo con tu credencial de miembro',
      badge: 'ALIADO',
      brand_color: a.color,
      image_url: `https://picsum.photos/seed/${a.id}/700/400`,
      cta_label: 'Ver oferta',
      branch_id: a.branch,
      status: a.status,
      ends_at: Timestamp.fromMillis(now + a.ends * DAY),
      impressions: a.imp,
      taps: a.taps,
      description: '',
      address: '',
      lat: 19.25, lng: -99.6,
      phone: '',
      socials: {},
      photos: [],
      created_at: Timestamp.fromMillis(now - 10 * DAY),
    });
  }
  await adBatch.commit();

  // ═══ pushLogs + store ═══
  const miscBatch = db.batch();
  miscBatch.set(db.collection('pushLogs').doc(), {
    title: 'Tour guiado del centro',
    body: 'Agenda tu visita al Business Center este sábado a las 11:00.'
    audience: 'ALL', branch_id: null, kind: 'BRAND',
    status: 'SENT', scheduled_at: null, sent: 1248,
    created_at: Timestamp.fromMillis(now - DAY / 2),
  });
  const products = [
    { name: 'Café de especialidad 250g', category: 'Bebidas', price: 189, tag: 'POPULAR' },
    { name: 'Organizador de escritorio', category: 'Accesorios', price: 249, tag: null },
    { name: 'Taza COW-HUB edición Metepec', category: 'Ropa', price: 199, tag: 'NUEVO' },
    { name: 'Set de post-its y marcadores', category: 'Accesorios', price: 149, tag: null },
  ];
  for (const p of products) {
    miscBatch.set(db.collection('store').doc('catalog').collection('products').doc(), {
      name: p.name, category: p.category, price: p.price,
      old_price: null, image_url: '', tag: p.tag,
    });
  }
  await miscBatch.commit();

  // ═══ dailyStats (14 días) + forecasts ═══
  const statsBatch = db.batch();
  const weekdayCurve: Record<string, number[]> = {};
  for (const b of branches) {
    for (let d = 14; d >= 1; d--) {
      const date = new Date(now - d * DAY);
      const dateStr = localDateString(date);
      const curve = trafficCurve(d * 7 + branches.indexOf(b));
      const total = curve.reduce((s, v) => s + v, 0);
      const granted = Math.round(total * 0.94);
      statsBatch.set(db.collection('dailyStats').doc(`${b.id}_${dateStr}`), {
        branch_id: b.id,
        date: dateStr,
        total,
        granted,
        denied: total - granted,
        by_method: { qr: Math.round(granted * 0.65), usb: Math.round(granted * 0.35) },
        by_plan: { classic: Math.round(granted * 0.3), plus: Math.round(granted * 0.25), black: Math.round(granted * 0.2), select: Math.round(granted * 0.15), xpress: Math.round(granted * 0.1) },
        by_hour: curve,
        peak_capacity: Math.max(...curve),
        unique_members: Math.round(granted * 0.6),
      });
      const wd = String(((date.getDay() + 6) % 7) + 1);
      const prev = weekdayCurve[`${b.id}_${wd}`] ?? new Array<number>(24).fill(0);
      weekdayCurve[`${b.id}_${wd}`] = curve.map((v, h) => (prev[h] ?? 0) * 0.5 + v * 0.5);
    }
    const byWeekday: Record<string, number[]> = {};
    for (let wd = 1; wd <= 7; wd++) {
      byWeekday[String(wd)] =
        weekdayCurve[`${b.id}_${wd}`] ?? trafficCurve(wd + branches.indexOf(b));
    }
    statsBatch.set(db.collection('forecasts').doc(b.id), {
      by_weekday: byWeekday,
      sample_days: 14,
      updated_at: FieldValue.serverTimestamp(),
    });
  }
  await statsBatch.commit();

  return {
    ok: true,
    staff: {
      'admin@cowhub.mx': 'ADMIN global',
      'gerente@cowhub.mx': 'MANAGER sede select',
      'recepcion@cowhub.mx': 'RECEPTIONIST sede select',
    },
    members: members.length,
    password: DEMO_PASSWORD,
  };
});
