#!/usr/bin/env node
/// Siembra el catálogo público de espacios reservables (`spaces`) que
/// consume cowhub-book vía /api/public/spaces. Idempotente (upsert por id).
/// Uso: node scripts/seed-public-spaces.mjs
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(
  readFileSync(resolve(process.cwd(), 'service-account.json'), 'utf8'),
);
const app = initializeApp({ credential: cert(sa) });
const db = getFirestore(app);

console.log('Sembrando espacios públicos en', sa.project_id);

const spaces = [
  {
    id: 'andamio',
    name: 'Sala Andamio',
    tagline: 'Juntas ejecutivas para 12',
    description:
      'Nuestra sala insignia: mesa de trabajo en madera, pantalla 4K, videoconferencia integral y servicio de café de barra. Pensada para decisiones que mueven el negocio.',
    capacity: 12,
    price_per_hour: 350,
    price_per_day: 2400,
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200&q=80',
      'https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=1200&q=80',
      'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200&q=80',
    ],
    amenities: ['Pantalla 4K', 'Videoconferencia', 'Café de barra', 'Blinds motorizados'],
    category: 'sala-juntas',
    featured: true,
    branch_ids: ['select', 'salas'],
    active: true,
    sort: 1,
  },
  {
    id: 'proyector',
    name: 'Sala Proyector',
    tagline: 'Demos y presentaciones para 16',
    description:
      'Formato auditorium reducido con proyector láser, iluminación de escena y control de sonido. Ideal para demos de producto, pitch days y capacitaciones.',
    capacity: 16,
    price_per_hour: 300,
    price_per_day: 2000,
    image: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1600&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=80',
      'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=1200&q=80',
    ],
    amenities: ['Proyector 4K', 'Sonido integrado', 'Iluminación de escena', 'Streaming'],
    category: 'sala-juntas',
    featured: false,
    branch_ids: ['select', 'salas'],
    active: true,
    sort: 2,
  },
  {
    id: 'auditorio',
    name: 'Auditorio Metepec',
    tagline: 'Eventos y lanzamientos para 60',
    description:
      'El espacio más grande del centro: butacas numeradas, escenario con iluminación profesional y backstage. Perfecto para conferencias, lanzamientos y galas.',
    capacity: 60,
    price_per_hour: 800,
    price_per_day: 6000,
    image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1600&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=1200&q=80',
      'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1200&q=80',
    ],
    amenities: ['Escenario', 'Iluminación LED', 'Sonido PA', 'Backstage', 'Streaming'],
    category: 'evento',
    featured: true,
    branch_ids: ['auditorio'],
    active: true,
    sort: 3,
  },
  {
    id: 'terraza',
    name: 'Terraza Sur',
    tagline: 'Networking al aire libre',
    description:
      'Espacio exterior con café de grano, sombreadero retráctil y vista al boulevard. El escenario perfecto para after offices y reuniones informales.',
    capacity: 40,
    price_per_hour: 250,
    price_per_day: 1500,
    image: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1600&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=1200&q=80',
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80',
    ],
    amenities: ['Exterior', 'Sombrilla retráctil', 'Café de grano', 'WiFi exterior'],
    category: 'evento',
    featured: false,
    branch_ids: ['select'],
    active: true,
    sort: 4,
  },
  {
    id: 'cabina-focus',
    name: 'Cabinas Focus',
    tagline: 'Concentración profunda para 1–4',
    description:
      'Módulos acústicos de trabajo profundo con luz circadiana, monitor externo y aislamiento de ruido. Reservables por bloques de 2 horas.',
    capacity: 4,
    price_per_hour: 120,
    price_per_day: 700,
    image: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1600&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200&q=80',
    ],
    amenities: ['Aislamiento acústico', 'Luz circadiana', 'Monitor externo', 'Ergonomía'],
    category: 'focus',
    featured: false,
    branch_ids: ['cowork'],
    active: true,
    sort: 5,
  },
  {
    id: 'hotdesk',
    name: 'Hot Desk Flexible',
    tagline: 'Escritorio por día en planta abierta',
    description:
      'Acceso a la planta de coworking con escritorios ergonómicos, lockers, café ilimitado y comunidad. El plan más flexible para profesionales independientes.',
    capacity: 30,
    price_per_hour: 80,
    price_per_day: 350,
    image: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1600&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80',
    ],
    amenities: ['WiFi premium', 'Café ilimitado', 'Lockers', 'Comunidad'],
    category: 'escritorio',
    featured: true,
    branch_ids: ['cowork'],
    active: true,
    sort: 6,
  },
];

for (const s of spaces) {
  await db.collection('spaces').doc(s.id).set(s);
  console.log('✓', s.id, '-', s.name);
}
console.log('Listo:', spaces.length, 'espacios.');
