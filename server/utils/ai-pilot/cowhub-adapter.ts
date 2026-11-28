import type { AiPilotConfig } from '#shared/types';

import { db, FieldValue } from '../db';
import {
  sendPublicBookingReceivedEmail,
  sendPublicBookingStaffNotice,
  sendPublicTourReceivedEmail,
  sendPublicTourStaffNotice,
} from '../mail';
import {
  CLOSE_HOUR,
  MAX_ADVANCE_DAYS,
  MAX_DURATION_H,
  OPEN_HOUR,
  genFolio,
  isValidDateKey,
  overlaps,
  toBookableSpace,
  todayCDMX,
} from '../public-booking';
import { resolveStaffNotifyEmails, sendStaffTopicPush } from '../public-notify';

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface BusinessSnapshot {
  spaces: Array<{
    id: string;
    name: string;
    category: string;
    capacity: number;
    pricePerHour: number;
    pricePerDay: number | null;
    tagline: string;
  }>;
  plans: Array<{
    id: string;
    name: string;
    price: number;
    features: string[];
  }>;
  branches: Array<{
    id: string;
    name: string;
    address: string;
    status: string;
  }>;
}

/// Caché ligero en memoria (60s) para no consultar el catálogo en cada turno.
let snapshotCache: { data: BusinessSnapshot; at: number } | null = null;
const SNAPSHOT_TTL_MS = 60_000;

export async function getBusinessSnapshot(): Promise<BusinessSnapshot> {
  if (snapshotCache && Date.now() - snapshotCache.at < SNAPSHOT_TTL_MS) {
    return snapshotCache.data;
  }

  const [spacesSnap, plansSnap, branchesSnap] = await Promise.all([
    db().collection('spaces').where('active', '==', true).get(),
    db().collection('plans').get(),
    db().collection('branches').get(),
  ]);

  const spaces = spacesSnap.docs
    .map(toBookableSpace)
    .sort((a, b) => (a.sort ?? 99) - (b.sort ?? 99))
    .map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      capacity: s.capacity,
      pricePerHour: s.pricePerHour,
      pricePerDay: s.pricePerDay,
      tagline: s.tagline,
    }));

  const plans = plansSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: String(data.name ?? d.id),
      price: Number(data.price ?? 0),
      features: Array.isArray(data.features) ? data.features.map(String) : [],
    };
  });

  const branches = branchesSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: String(data.name ?? d.id),
      address: String(data.address ?? ''),
      status: String(data.status ?? 'OPEN'),
    };
  });

  const data: BusinessSnapshot = { spaces, plans, branches };
  snapshotCache = { data, at: Date.now() };
  return data;
}

/// Declaraciones de herramientas (Gemini Function Calling) para COW-HUB.
export function getCowhubToolDeclarations(cfg: AiPilotConfig): GeminiFunctionDeclaration[] {
  const declarations: GeminiFunctionDeclaration[] = [
    {
      name: 'list_spaces_and_plans',
      description:
        'Devuelve el catálogo actualizado de espacios reservables (con su space_id, capacidad, precio por hora y día) y los planes de membresía vigentes.',
      parameters: {
        type: 'OBJECT',
        properties: {},
      },
    },
    {
      name: 'escalate_to_human',
      description:
        'Transfiere la conversación al equipo humano de recepción. Úsala SIEMPRE que el cliente pida hablar con una persona, reporte una queja o problema urgente, quiera cancelar/modificar un pago, o cuando no tengas certeza para responder.',
      parameters: {
        type: 'OBJECT',
        properties: {
          reason: {
            type: 'STRING',
            description: 'Motivo breve de la escalación para recepción (ej. "Cliente solicita hablar con asesor", "Queja sobre reserva").',
          },
        },
        required: ['reason'],
      },
    },
  ];

  if (cfg.tools.checkAvailability) {
    declarations.push({
      name: 'check_space_availability',
      description:
        'Consulta la disponibilidad real en Firestore de un espacio para una fecha específica (YYYY-MM-DD) y devuelve las horas ocupadas y libres entre 7:00 y 20:00.',
      parameters: {
        type: 'OBJECT',
        properties: {
          space_id: {
            type: 'STRING',
            description: 'ID exacto del espacio obtenido del catálogo (ej. sala-consejo).',
          },
          date: {
            type: 'STRING',
            description: 'Fecha en formato YYYY-MM-DD (zona horaria México).',
          },
        },
        required: ['space_id', 'date'],
      },
    });
  }

  if (cfg.tools.createTour) {
    declarations.push({
      name: 'create_tour_request',
      description:
        'Agenda una solicitud de tour presencial en COW-HUB Metepec y genera un folio TOUR-XXXXXX. Solo llámala cuando ya tengas nombre, correo electrónico válido y teléfono del cliente.',
      parameters: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'Nombre completo del interesado.' },
          email: { type: 'STRING', description: 'Correo electrónico válido.' },
          phone: { type: 'STRING', description: 'Teléfono o WhatsApp (mínimo 7 dígitos).' },
          preferred_date: {
            type: 'STRING',
            description: 'Fecha preferida YYYY-MM-DD (opcional).',
          },
          people: {
            type: 'INTEGER',
            description: 'Número de personas que asistirán (1 a 10).',
          },
          interest: {
            type: 'STRING',
            description: 'Tipo de espacio o membresía de interés (opcional).',
          },
        },
        required: ['name', 'email', 'phone'],
      },
    });
  }

  if (cfg.tools.createBooking) {
    declarations.push({
      name: 'create_space_booking',
      description:
        'Crea una reserva real de espacio en COW-HUB Metepec (folio CH-XXXXXX, estado pendiente de confirmación). Verifica antes disponibilidad con check_space_availability y asegúrate de tener space_id, fecha, modalidad (hour/day), horario si es por hora, personas, nombre y correo.',
      parameters: {
        type: 'OBJECT',
        properties: {
          space_id: {
            type: 'STRING',
            description: 'ID exacto del espacio obtenido del catálogo (ej. sala-consejo).',
          },
          date: {
            type: 'STRING',
            description: 'Fecha de la reserva en formato YYYY-MM-DD (hoy o futura).',
          },
          mode: {
            type: 'STRING',
            description: '"hour" para reserva por horas o "day" para día completo (default "hour").',
          },
          start_hour: {
            type: 'INTEGER',
            description: `Hora entera de inicio (${OPEN_HOUR} a ${CLOSE_HOUR - 1}), obligatoria cuando mode es "hour".`,
          },
          duration_hours: {
            type: 'INTEGER',
            description: `Duración en horas enteras (1 a ${MAX_DURATION_H}), obligatoria cuando mode es "hour".`,
          },
          people: {
            type: 'INTEGER',
            description: 'Número de personas que usarán el espacio (mínimo 1).',
          },
          name: { type: 'STRING', description: 'Nombre completo del responsable.' },
          email: { type: 'STRING', description: 'Correo electrónico válido para enviar el folio.' },
          phone: { type: 'STRING', description: 'Teléfono o WhatsApp de contacto (opcional).' },
          company: { type: 'STRING', description: 'Nombre de la empresa (opcional).' },
        },
        required: ['space_id', 'date', 'name', 'email'],
      },
    });
  }

  declarations.push({
    name: 'reschedule_tour_or_booking',
    description:
      'Cambia la fecha y/o horario de un tour (TOUR-XXXXXX) o reserva de espacio (CH-XXXXXX) existente en la agenda real de Firestore. Si el cliente no da el folio, intenta ubicar su registro más reciente por teléfono, correo o nombre.',
    parameters: {
      type: 'OBJECT',
      properties: {
        folio: {
          type: 'STRING',
          description: 'Folio exacto (ej. TOUR-4K9X2P o CH-4K9X2P), opcional si se busca por contacto.',
        },
        kind: {
          type: 'STRING',
          description: '"tour" o "booking" (opcional, se infiere del folio si se proporciona).',
        },
        new_date: {
          type: 'STRING',
          description: 'Nueva fecha en formato YYYY-MM-DD (obligatoria, hoy o futura).',
        },
        new_time: {
          type: 'STRING',
          description: 'Nueva hora HH:MM para tours (ej. "11:00", opcional).',
        },
        new_start_hour: {
          type: 'INTEGER',
          description: 'Nueva hora entera de inicio (7 a 19) para reservas por hora (opcional).',
        },
        new_end_hour: {
          type: 'INTEGER',
          description: 'Nueva hora entera de fin (8 a 20) para reservas por hora (opcional).',
        },
        email: {
          type: 'STRING',
          description: 'Correo del cliente para ubicar su solicitud si no dio folio (opcional).',
        },
        phone: {
          type: 'STRING',
          description: 'Teléfono del cliente para ubicar su solicitud si no dio folio (opcional).',
        },
      },
      required: ['new_date'],
    },
  });

  return declarations;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+()\-.\s\d]{7,20}$/;

export interface ToolExecutionContext {
  dryRun?: boolean;
  defaultVisitorName?: string;
  defaultVisitorPhone?: string | null;
}

function hasSlotConflict(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  mode: 'hour' | 'day',
  startHour: number | null,
  endHour: number | null,
): boolean {
  const intervals = docs.map((d) => {
    const b = d.data();
    return {
      mode: b.mode === 'day' ? 'day' : 'hour',
      startHour: (b.start_hour ?? null) as number | null,
      endHour: (b.end_hour ?? null) as number | null,
    };
  });
  return mode === 'day' ? intervals.length > 0 : overlaps(startHour!, endHour!, intervals);
}

/// Ejecuta la herramienta solicitada por Gemini contra datos reales de Firestore.
export async function executeCowhubTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext = {},
): Promise<{ result: Record<string, unknown>; escalateReason?: string }> {
  if (name === 'list_spaces_and_plans') {
    const snapshot = await getBusinessSnapshot();
    return {
      result: {
        today_cdmx: todayCDMX(),
        spaces: snapshot.spaces,
        plans: snapshot.plans,
      },
    };
  }

  if (name === 'escalate_to_human') {
    const reason = String(args.reason ?? 'Solicitud de atención humana').trim().slice(0, 160);
    return {
      result: { escalated: true, reason },
      escalateReason: reason,
    };
  }

  if (name === 'check_space_availability') {
    const spaceId = String(args.space_id ?? '').trim();
    const date = String(args.date ?? '').trim();
    const today = todayCDMX();

    if (!spaceId || !isValidDateKey(date)) {
      return { result: { error: 'space_id y date (YYYY-MM-DD) son requeridos' } };
    }
    if (date < today) {
      return { result: { error: `La fecha ${date} ya pasó (hoy es ${today})` } };
    }

    const spaceSnap = await db().collection('spaces').doc(spaceId).get();
    if (!spaceSnap.exists || spaceSnap.data()?.active !== true) {
      return { result: { error: `Espacio "${spaceId}" no encontrado o inactivo` } };
    }
    const space = toBookableSpace(spaceSnap);

    const bookingsSnap = await db()
      .collection('space_bookings')
      .where('space_id', '==', spaceId)
      .where('date', '==', date)
      .where('status', 'in', ['pending', 'confirmed'])
      .get();

    const bookedHours = new Set<number>();
    let fullDayBooked = false;
    for (const d of bookingsSnap.docs) {
      const b = d.data();
      if (b.mode === 'day') {
        fullDayBooked = true;
        break;
      }
      const start = Number(b.start_hour ?? 0);
      const end = Number(b.end_hour ?? 0);
      for (let h = start; h < end; h++) bookedHours.add(h);
    }

    const freeHours: string[] = [];
    if (!fullDayBooked) {
      for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
        if (!bookedHours.has(h)) {
          freeHours.push(`${String(h).padStart(2, '0')}:00`);
        }
      }
    }

    return {
      result: {
        space: space.name,
        spaceId: space.id,
        date,
        pricePerHour: space.pricePerHour,
        pricePerDay: space.pricePerDay,
        fullDayBooked,
        freeHours,
        hoursWindow: `${OPEN_HOUR}:00 a ${CLOSE_HOUR}:00`,
      },
    };
  }

  if (name === 'create_tour_request') {
    const visitorName = String(args.name ?? ctx.defaultVisitorName ?? '').trim();
    const email = String(args.email ?? '').trim().toLowerCase();
    const phone = String(args.phone ?? ctx.defaultVisitorPhone ?? '').trim();
    const preferredDate = String(args.preferred_date ?? '').trim() || null;
    const people = Math.min(10, Math.max(1, Number(args.people ?? 1) || 1));
    const interest = String(args.interest ?? '').trim() || null;

    if (visitorName.length < 2) {
      return { result: { error: 'Falta el nombre completo del interesado' } };
    }
    if (!EMAIL_RE.test(email)) {
      return { result: { error: 'Falta un correo electrónico válido para confirmar el tour' } };
    }
    if (!PHONE_RE.test(phone)) {
      return { result: { error: 'Falta un teléfono o WhatsApp válido (mínimo 7 dígitos)' } };
    }
    if (preferredDate && !isValidDateKey(preferredDate)) {
      return { result: { error: 'La fecha debe tener formato YYYY-MM-DD' } };
    }

    if (ctx.dryRun) {
      return {
        result: {
          simulated: true,
          folio: 'TOUR-DEMO01',
          name: visitorName,
          email,
          phone,
          preferredDate,
          people,
        },
      };
    }

    const folio = genFolio('TOUR');
    await db().collection('tour_requests').doc(folio).set({
      folio,
      name: visitorName,
      company: null,
      email,
      phone,
      preferred_date: preferredDate,
      people,
      interest,
      message: 'Agendado vía chat en vivo',
      privacy_accepted: true,
      status: 'new',
      source: 'ai_pilot',
      created_at: FieldValue.serverTimestamp(),
    });

    // Notificaciones best-effort sin bloquear la respuesta del agente
    void (async () => {
      try {
        const staffEmails = await resolveStaffNotifyEmails();
        const agendaUrl = 'https://cowhub-b2b.vercel.app/agenda-web';
        await Promise.allSettled([
          sendPublicTourReceivedEmail({
            to: email,
            name: visitorName,
            folio,
            preferredDate,
            people,
          }),
          ...staffEmails.map((to) =>
            sendPublicTourStaffNotice({
              to,
              folio,
              name: visitorName,
              company: null,
              email,
              phone,
              preferredDate,
              people,
              message: 'Agendado vía Asistente IA',
              agendaUrl,
            }),
          ),
          sendStaffTopicPush({
            title: `Tour agendado por IA (${folio})`,
            body: `${visitorName} · ${preferredDate ?? 'Fecha por definir'}`,
            data: { kind: 'tour', folio, route: '/agenda-web' },
          }),
        ]);
      } catch {
        /* notificaciones best-effort */
      }
    })();

    return {
      result: {
        created: true,
        folio,
        preferredDate,
        people,
        email,
      },
    };
  }

  if (name === 'create_space_booking') {
    const spaceId = String(args.space_id ?? '').trim();
    const date = String(args.date ?? '').trim();
    const mode: 'hour' | 'day' = args.mode === 'day' ? 'day' : 'hour';
    const startHour = Number(args.start_hour);
    const duration = Number(args.duration_hours ?? 1);
    const people = Math.max(1, Number(args.people ?? 1) || 1);
    const visitorName = String(args.name ?? ctx.defaultVisitorName ?? '').trim();
    const email = String(args.email ?? '').trim().toLowerCase();
    const phone = String(args.phone ?? ctx.defaultVisitorPhone ?? '').trim() || null;
    const company = String(args.company ?? '').trim() || null;

    if (!spaceId || !isValidDateKey(date)) {
      return { result: { error: 'space_id y date (YYYY-MM-DD) son requeridos' } };
    }

    const today = todayCDMX();
    const maxDate = new Date(Date.now() + MAX_ADVANCE_DAYS * 86400_000)
      .toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    if (date < today || date > maxDate) {
      return { result: { error: `La fecha debe estar entre ${today} y ${maxDate}` } };
    }
    if (visitorName.length < 3) {
      return { result: { error: 'Falta el nombre completo del responsable (mínimo 3 caracteres)' } };
    }
    if (!EMAIL_RE.test(email)) {
      return { result: { error: 'Falta un correo electrónico válido para enviar el folio de reserva' } };
    }
    if (phone && !PHONE_RE.test(phone)) {
      return { result: { error: 'El teléfono ingresado no es válido' } };
    }

    const spaceSnap = await db().collection('spaces').doc(spaceId).get();
    if (!spaceSnap.exists || spaceSnap.data()?.active !== true) {
      return { result: { error: `El espacio "${spaceId}" no existe o no está disponible` } };
    }
    const space = spaceSnap.data()!;
    const maxCapacity = Number(space.capacity ?? 1);
    if (people < 1 || people > maxCapacity) {
      return {
        result: {
          error: `La capacidad máxima de ${space.name ?? spaceId} es de ${maxCapacity} personas`,
        },
      };
    }

    let startHourN: number | null = null;
    let endHourN: number | null = null;
    if (mode === 'hour') {
      if (!Number.isInteger(startHour) || startHour < OPEN_HOUR || startHour >= CLOSE_HOUR) {
        return {
          result: { error: `Hora de inicio inválida (horario de ${OPEN_HOUR}:00 a ${CLOSE_HOUR}:00)` },
        };
      }
      if (!Number.isInteger(duration) || duration < 1 || duration > MAX_DURATION_H) {
        return {
          result: { error: `La duración debe ser entre 1 y ${MAX_DURATION_H} horas` },
        };
      }
      startHourN = startHour;
      endHourN = startHour + duration;
      if (endHourN > CLOSE_HOUR) {
        return {
          result: { error: `La reserva debe terminar antes de las ${CLOSE_HOUR}:00` },
        };
      }
    }

    const totalMxn =
      mode === 'day'
        ? Number(space.price_per_day ?? Number(space.price_per_hour ?? 0) * (CLOSE_HOUR - OPEN_HOUR))
        : Number(space.price_per_hour ?? 0) * (duration || 1);

    const timeLabel = mode === 'day' ? 'Día completo' : `${startHourN}:00 - ${endHourN}:00`;
    const spaceName = String(space.name ?? spaceId);

    if (ctx.dryRun) {
      const existing = await db()
        .collection('space_bookings')
        .where('space_id', '==', spaceId)
        .where('date', '==', date)
        .where('status', 'in', ['pending', 'confirmed'])
        .get();
      if (hasSlotConflict(existing.docs, mode, startHourN, endHourN)) {
        return {
          result: {
            error: `El espacio ${spaceName} ya está ocupado en ese horario el ${date}. Consulta check_space_availability para ofrecer otro horario.`,
          },
        };
      }
      return {
        result: {
          simulated: true,
          created: true,
          folio: 'CH-DEMO01',
          spaceName,
          date,
          mode,
          timeLabel,
          people,
          totalMxn,
          status: 'pending',
          email,
        },
      };
    }

    const bookingsRef = db().collection('space_bookings');
    const folio = genFolio('CH');
    const clash = await db().runTransaction(async (tx) => {
      const existing = await tx.get(
        bookingsRef
          .where('space_id', '==', spaceId)
          .where('date', '==', date)
          .where('status', 'in', ['pending', 'confirmed']),
      );
      if (hasSlotConflict(existing.docs, mode, startHourN, endHourN)) {
        return true;
      }
      tx.set(bookingsRef.doc(folio), {
        folio,
        space_id: spaceId,
        space_name: spaceName,
        date,
        mode,
        start_hour: startHourN,
        end_hour: endHourN,
        guests: { name: visitorName, email, phone, company },
        people,
        total_mxn: totalMxn,
        status: 'pending',
        source: 'ai_pilot',
        notes: 'Reservado vía chat en vivo',
        created_at: FieldValue.serverTimestamp(),
      });
      return false;
    });

    if (clash) {
      return {
        result: {
          error: `El horario seleccionado en ${spaceName} ya no está disponible. Consulta check_space_availability para ofrecer otra hora.`,
        },
      };
    }

    void (async () => {
      try {
        const staffEmails = await resolveStaffNotifyEmails();
        const agendaUrl = 'https://cowhub-b2b.vercel.app/agenda-web';
        await Promise.allSettled([
          sendPublicBookingReceivedEmail({
            to: email,
            name: visitorName,
            folio,
            spaceName,
            date,
            timeLabel,
            people,
            totalMxn,
          }),
          ...staffEmails.map((to) =>
            sendPublicBookingStaffNotice({
              to,
              folio,
              spaceName,
              date,
              timeLabel,
              people,
              totalMxn,
              guestName: visitorName,
              guestEmail: email,
              guestPhone: phone,
              agendaUrl,
            }),
          ),
          sendStaffTopicPush({
            title: `Reserva creada por IA (${folio})`,
            body: `${visitorName} · ${spaceName} (${date} · ${timeLabel})`,
            data: { kind: 'booking', folio, route: '/agenda-web' },
          }),
        ]);
      } catch {
        /* notificaciones best-effort */
      }
    })();

    return {
      result: {
        created: true,
        folio,
        spaceName,
        date,
        mode,
        timeLabel,
        people,
        totalMxn,
        status: 'pending',
        email,
      },
    };
  }

  if (name === 'reschedule_tour_or_booking') {
    const rawFolio = String(args.folio ?? '').trim().toUpperCase();
    const newDate = String(args.new_date ?? '').trim();
    const newTime = String(args.new_time ?? '').trim() || null;
    const newStartHour = args.new_start_hour != null ? Number(args.new_start_hour) : null;
    const newEndHour = args.new_end_hour != null ? Number(args.new_end_hour) : null;
    const lookupEmail = String(args.email ?? '').trim().toLowerCase();
    const lookupPhone = String(args.phone ?? ctx.defaultVisitorPhone ?? '').replace(/\D/g, '');
    const lookupName = String(ctx.defaultVisitorName ?? '').trim().toLowerCase();
    const today = todayCDMX();

    if (!isValidDateKey(newDate)) {
      return { result: { error: 'La nueva fecha debe tener formato YYYY-MM-DD' } };
    }
    if (newDate < today) {
      return { result: { error: `La fecha ${newDate} ya pasó (hoy es ${today})` } };
    }

    let inferredKind: 'tour' | 'booking' | null =
      args.kind === 'tour' || rawFolio.startsWith('TOUR-')
        ? 'tour'
        : args.kind === 'booking' || rawFolio.startsWith('CH-')
          ? 'booking'
          : null;

    // 1. Intentar localizar Tour
    let targetTour: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot | null = null;
    if (inferredKind !== 'booking') {
      if (rawFolio.startsWith('TOUR-')) {
        const snap = await db().collection('tour_requests').doc(rawFolio).get();
        if (snap.exists) targetTour = snap;
      } else {
        const recentTours = await db()
          .collection('tour_requests')
          .orderBy('created_at', 'desc')
          .limit(40)
          .get();
        targetTour =
          recentTours.docs.find((d) => {
            const t = d.data();
            if (t.status === 'cancelled') return false;
            const tPhone = String(t.phone ?? '').replace(/\D/g, '');
            const tEmail = String(t.email ?? '').toLowerCase();
            const tName = String(t.name ?? '').toLowerCase();
            if (lookupEmail && tEmail === lookupEmail) return true;
            if (lookupPhone.length >= 7 && tPhone.endsWith(lookupPhone.slice(-10))) return true;
            if (lookupName.length >= 3 && tName === lookupName) return true;
            return false;
          }) ?? null;
      }
      if (targetTour) inferredKind = 'tour';
    }

    // 2. Intentar localizar Reserva si no fue tour
    let targetBooking: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot | null = null;
    if (!targetTour && inferredKind !== 'tour') {
      if (rawFolio.startsWith('CH-')) {
        const snap = await db().collection('space_bookings').doc(rawFolio).get();
        if (snap.exists) targetBooking = snap;
      } else {
        const recentBookings = await db()
          .collection('space_bookings')
          .orderBy('created_at', 'desc')
          .limit(40)
          .get();
        targetBooking =
          recentBookings.docs.find((d) => {
            const b = d.data();
            if (b.status === 'cancelled' || b.status === 'completed') return false;
            const g = (b.guests ?? {}) as Record<string, unknown>;
            const bPhone = String(g.phone ?? '').replace(/\D/g, '');
            const bEmail = String(g.email ?? '').toLowerCase();
            const bName = String(g.name ?? '').toLowerCase();
            if (lookupEmail && bEmail === lookupEmail) return true;
            if (lookupPhone.length >= 7 && bPhone.endsWith(lookupPhone.slice(-10))) return true;
            if (lookupName.length >= 3 && bName === lookupName) return true;
            return false;
          }) ?? null;
      }
      if (targetBooking) inferredKind = 'booking';
    }

    if (targetTour) {
      const t = targetTour.data()!;
      if (t.status === 'cancelled') {
        return { result: { error: `El tour ${targetTour.id} está cancelado y no se puede reprogramar.` } };
      }
      if (ctx.dryRun) {
        return {
          result: {
            simulated: true,
            updated: true,
            kind: 'tour',
            folio: t.folio ?? targetTour.id,
            new_date: newDate,
            new_time: newTime,
          },
        };
      }
      const patch: Record<string, unknown> = {
        preferred_date: newDate,
        updated_at: FieldValue.serverTimestamp(),
      };
      if (newTime) patch.confirmed_time = newTime;
      await targetTour.ref.update(patch);
      return {
        result: {
          updated: true,
          kind: 'tour',
          folio: t.folio ?? targetTour.id,
          new_date: newDate,
          new_time: newTime ?? t.confirmed_time ?? null,
        },
      };
    }

    if (targetBooking) {
      const b = targetBooking.data()!;
      if (b.status === 'completed' || b.status === 'cancelled') {
        return { result: { error: `La reserva ${targetBooking.id} ya está ${b.status} y no se puede reprogramar.` } };
      }

      const mode: 'hour' | 'day' = b.mode === 'day' ? 'day' : 'hour';
      const startH = mode === 'hour' ? (newStartHour ?? Number(b.start_hour ?? 9)) : null;
      const endH = mode === 'hour' ? (newEndHour ?? Number(b.end_hour ?? 11)) : null;

      if (mode === 'hour') {
        if (!Number.isInteger(startH) || !Number.isInteger(endH) || startH! < OPEN_HOUR || endH! > CLOSE_HOUR || endH! <= startH!) {
          return { result: { error: `Horario inválido. El horario de operación es ${OPEN_HOUR}:00 a ${CLOSE_HOUR}:00.` } };
        }
      }

      // Validar que no haya empalme con otra reserva del mismo espacio en la nueva fecha
      const conflictsSnap = await db()
        .collection('space_bookings')
        .where('space_id', '==', b.space_id)
        .where('date', '==', newDate)
        .where('status', 'in', ['pending', 'confirmed'])
        .get();

      const hasConflict = conflictsSnap.docs.some((other) => {
        if (other.id === targetBooking!.id) return false;
        const o = other.data();
        return overlaps(
          { mode, startHour: startH, endHour: endH },
          {
            mode: o.mode === 'day' ? 'day' : 'hour',
            startHour: o.start_hour ?? null,
            endHour: o.end_hour ?? null,
          },
        );
      });

      if (hasConflict) {
        return {
          result: {
            error: `El espacio ${b.space_name} ya está ocupado en ese horario el ${newDate}. Consulta check_space_availability para ofrecer otro horario.`,
          },
        };
      }

      if (ctx.dryRun) {
        return {
          result: {
            simulated: true,
            updated: true,
            kind: 'booking',
            folio: b.folio ?? targetBooking.id,
            spaceName: b.space_name,
            new_date: newDate,
            startHour: startH,
            endHour: endH,
          },
        };
      }

      await targetBooking.ref.update({
        date: newDate,
        start_hour: startH,
        end_hour: endH,
        updated_at: FieldValue.serverTimestamp(),
      });

      return {
        result: {
          updated: true,
          kind: 'booking',
          folio: b.folio ?? targetBooking.id,
          spaceName: b.space_name,
          new_date: newDate,
          startHour: startH,
          endHour: endH,
        },
      };
    }

    return {
      result: {
        error:
          'No se encontró un tour o reserva activa con los datos del cliente. Pídele amablemente su folio (TOUR-XXXXXX o CH-XXXXXX) o el correo con el que registró su solicitud.',
      },
    };
  }

  return { result: { error: `Herramienta desconocida: ${name}` } };
}
