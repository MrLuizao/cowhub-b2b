<script setup lang="ts">
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  ArrowRight,
  CalendarClock,
  Lock,
  Mail,
  MapPin,
  Phone,
  Ticket,
  User,
  Users,
} from '@lucide/vue';

import type { SpaceBooking, TourRequest } from '#shared/types';

const { recentCheckIns, start, stop } = useDashboardRealtime();
const { session } = useAuth();
const { db } = useFirebase();

// ─── Agenda web (reservas públicas + tours) ───
const bookings = ref<SpaceBooking[]>([]);
const tours = ref<TourRequest[]>([]);
const agendaPending = ref(true);
const savingId = ref<string | null>(null);

const BOOKING_STATUSES = [
  { value: 'pending', label: 'Por confirmar' },
  { value: 'confirmed', label: 'Vigente' },
  { value: 'completed', label: 'Completada' },
  { value: 'no_show', label: 'No show' },
  { value: 'cancelled', label: 'Cancelada' },
] as const;

const TOUR_STATUSES = [
  { value: 'new', label: 'Nuevo' },
  { value: 'contacted', label: 'Contactado' },
  { value: 'done', label: 'Agendado' },
  { value: 'cancelled', label: 'Cancelado' },
] as const;

let unsubB: Unsubscribe | null = null;
let unsubT: Unsubscribe | null = null;

// ─── Salas en vivo (ocupación por sede, en tiempo real) ───
interface RoomSpace {
  id: string;
  name: string;
  capacity: number;
  pricePerHour: number;
  branchIds: string[];
}

const spaces = ref<RoomSpace[]>([]);
const spacesPending = ref(true);
const branchNames = ref<Record<string, string>>({});
const nowTick = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  start();
  if (!db) {
    agendaPending.value = false;
    spacesPending.value = false;
    return;
  }
  unsubB = onSnapshot(
    query(collection(db, 'space_bookings'), orderBy('created_at', 'desc'), limit(300)),
    (snap) => {
      bookings.value = snap.docs.map((d) => {
        const b = d.data();
        return {
          id: d.id,
          folio: b.folio ?? d.id,
          spaceId: b.space_id ?? '',
          spaceName: b.space_name ?? '',
          date: b.date ?? '',
          mode: b.mode === 'day' ? 'day' : 'hour',
          startHour: b.start_hour ?? null,
          endHour: b.end_hour ?? null,
          guests: b.guests ?? {},
          people: b.people ?? 1,
          totalMxn: b.total_mxn ?? 0,
          status: b.status ?? 'confirmed',
          source: b.source ?? 'web',
          notes: b.notes ?? null,
          checkedInAt: b.checked_in_at?.toMillis?.() ?? null,
          checkedInBy: b.checked_in_by ?? null,
          createdAt: b.created_at?.toMillis?.() ?? 0,
        } as SpaceBooking;
      });
      agendaPending.value = false;
    },
    () => (agendaPending.value = false),
  );
  unsubT = onSnapshot(
    query(collection(db, 'tour_requests'), orderBy('created_at', 'desc'), limit(300)),
    (snap) => {
      tours.value = snap.docs.map((d) => {
        const t = d.data();
        return {
          id: d.id,
          folio: t.folio ?? d.id,
          name: t.name ?? '',
          company: t.company ?? null,
          email: t.email ?? '',
          phone: t.phone ?? '',
          preferredDate: t.preferred_date ?? null,
          people: t.people ?? 1,
          interest: t.interest ?? null,
          message: t.message ?? null,
          privacyAccepted: t.privacy_accepted === true,
          status: t.status ?? 'new',
          createdAt: t.created_at?.toMillis?.() ?? 0,
        } as TourRequest;
      });
    },
  );

  /// Catálogo de salas + nombres de sede (solo lectura desde Firestore).
  getDocs(collection(db, 'spaces'))
    .then((snap) => {
      spaces.value = snap.docs
        .map((d) => {
          const x = d.data();
          return {
            id: d.id,
            name: (x.name as string) ?? d.id,
            capacity: (x.capacity as number) ?? 0,
            pricePerHour: (x.price_per_hour as number) ?? 0,
            branchIds: (x.branch_ids as string[]) ?? [],
          };
        })
        .filter((sp) => sp.branchIds.length > 0);
      spacesPending.value = false;
    })
    .catch(() => {
      spacesPending.value = false;
    });

  getDocs(collection(db, 'branches')).then((snap) => {
    branchNames.value = Object.fromEntries(
      snap.docs.map((d) => [d.id, (d.data().name as string) ?? d.id]),
    );
  });

  /// Tick de 1 min para refrescar el estado ocupado/libre de las salas.
  tickTimer = setInterval(() => {
    nowTick.value = Date.now();
  }, 60_000);
});

onBeforeUnmount(() => {
  stop();
  unsubB?.();
  unsubT?.();
  if (tickTimer) clearInterval(tickTimer);
});

// ─── Formato y filtros ───
const mxn = (n: number) => '$' + n.toLocaleString('es-MX');
const fmtDate = (d: string) =>
  d
    ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : '-';
const fmtTime = (b: SpaceBooking) =>
  b.mode === 'day' ? 'Día completo' : `${b.startHour}:00 – ${b.endHour}:00`;
const fmtCreated = (ms: number) =>
  ms ? new Date(ms).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '-';

const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

const todayAgenda = computed(() =>
  bookings.value.filter((b) => b.date === todayKey && b.status !== 'cancelled'),
);

const agendaStats = computed(() => ({
  today: todayAgenda.value.length,
  upcoming: bookings.value.filter(
    (b) => b.date >= todayKey && b.status === 'confirmed',
  ).length,
  newTours: tours.value.filter((t) => t.status === 'new').length,
}));

const agendaKpis = computed(() => [
  {
    label: 'Reservas hoy',
    value: String(agendaStats.value.today),
    icon: Ticket,
    chip: 'bg-pastel-lavender/15 text-pastel-lavender ring-1 ring-inset ring-pastel-lavender/25',
    tag: 'Hoy',
  },
  {
    label: 'Reservas próximas',
    value: String(agendaStats.value.upcoming),
    icon: CalendarClock,
    chip: 'bg-pastel-yellow/15 text-pastel-yellow ring-1 ring-inset ring-pastel-yellow/25',
    tag: 'Activas',
  },
  {
    label: 'Tours nuevos',
    value: String(agendaStats.value.newTours),
    icon: User,
    chip: 'bg-pastel-pink/15 text-pastel-pink ring-1 ring-inset ring-pastel-pink/25',
    tag: 'Pendientes',
  },
]);

/// Agenda del día: reservas de hoy y futuras, sin canceladas.
const upcomingBookings = computed(() =>
  bookings.value
    .filter((b) => b.date >= todayKey && b.status !== 'cancelled' && b.status !== 'no_show')
    .sort((a, b) =>
      a.date !== b.date
        ? a.date < b.date ? -1 : 1
        : (a.startHour ?? 0) - (b.startHour ?? 0),
    )
    .slice(0, 12),
);

/// Tours que requieren contacto: nuevos primero, luego contactados recientes.
const pendingTours = computed(() =>
  tours.value
    .filter((t) => t.status === 'new' || t.status === 'contacted')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 6),
);

const statusBadge: Record<string, string> = {
  /// Vigente = reserva activa; Completada = acceso ya confirmado en recepción por folio.
  pending: 'bg-pastel-yellow/15 text-pastel-yellow ring-1 ring-inset ring-pastel-yellow/25',
  confirmed: 'bg-pastel-lavender/15 text-pastel-lavender ring-1 ring-inset ring-pastel-lavender/25',
  completed: 'bg-emerald-300/15 text-emerald-300',
  no_show: 'bg-pastel-yellow/15 text-pastel-yellow ring-1 ring-inset ring-pastel-yellow/25',
  cancelled: 'bg-rose-400/15 text-rose-300',
  new: 'bg-pastel-pink/15 text-pastel-pink ring-1 ring-inset ring-pastel-pink/25',
  contacted: 'bg-pastel-lavender/15 text-pastel-lavender ring-1 ring-inset ring-pastel-lavender/25',
  done: 'bg-emerald-300/15 text-emerald-300',
};

// ─── Confirmación de acciones que modifican estado ───
/// NINGÚN select/botón de estado muta directo: primero abre el modal y
/// solo al confirmar se escribe en Firestore. `selectReset` remonta los
/// selects si el usuario cancela, para que muestren el estado real del
/// doc y no la opción que tocó por error.
type PendingAction = {
  kind: 'booking' | 'tour';
  id: string;
  title: string;
  subtitle: string;
  fromLabel: string;
  toLabel: string;
  toValue: string;
  warn: string | null;
};

const pendingAction = ref<PendingAction | null>(null);
const actionBusy = ref(false);
const selectReset = ref(0);

const confirmOpen = computed({
  get: () => pendingAction.value !== null,
  set: (v: boolean) => {
    if (!v) cancelPendingAction();
  },
});

function statusLabel(
  list: readonly { value: string; label: string }[],
  value: string,
): string {
  return list.find((x) => x.value === value)?.label ?? value;
}

const CHECK_IN_WARN =
  'La reserva ya tiene acceso confirmado; el sello de llegada (hora y staff) se borrará.';

/// Una reserva con acceso confirmado (completed) solo la puede mover
/// admin/gerente - recepción la deja bloqueada (espejo de firestore.rules).
const canEditCompleted = computed(() => {
  const r = session.value?.role;
  return r === 'ADMIN' || r === 'MANAGER';
});

function bookingStatusLocked(b: SpaceBooking): boolean {
  return b.status === 'completed' && !canEditCompleted.value;
}

function askBookingStatus(b: SpaceBooking, event: Event): void {
  if (bookingStatusLocked(b)) return;
  const status = (event.target as HTMLSelectElement).value;
  if (status === b.status) return;
  pendingAction.value = {
    kind: 'booking',
    id: b.id,
    title: b.folio,
    subtitle: `${b.spaceName} · ${fmtDate(b.date)} · ${fmtTime(b)}`,
    fromLabel: statusLabel(BOOKING_STATUSES, b.status),
    toLabel: statusLabel(BOOKING_STATUSES, status),
    toValue: status,
    warn:
      status !== 'completed' && (b.checkedInAt || b.checkedInBy)
        ? CHECK_IN_WARN
        : null,
  };
}

function askTourStatus(t: TourRequest, event: Event): void {
  const status = (event.target as HTMLSelectElement).value;
  if (status === t.status) return;
  pendingAction.value = {
    kind: 'tour',
    id: t.id,
    title: t.folio,
    subtitle: `${t.name}${t.company ? ` · ${t.company}` : ''}`,
    fromLabel: statusLabel(TOUR_STATUSES, t.status),
    toLabel: statusLabel(TOUR_STATUSES, status),
    toValue: status,
    warn: null,
  };
}

async function applyPendingAction(): Promise<void> {
  const a = pendingAction.value;
  if (!a || actionBusy.value) return;
  actionBusy.value = true;
  savingId.value = a.id;
  try {
    if (a.kind === 'booking') {
      /// 'completed' NO se alcanza por select: si se revierte una
      /// completada, el sello de acceso se limpia para no dejar
      /// datos huérfanos.
      const patch: Record<string, unknown> = { status: a.toValue };
      if (a.toValue !== 'completed') {
        const current = bookings.value.find((b) => b.id === a.id);
        if (current?.checkedInAt || current?.checkedInBy) {
          patch.checked_in_at = null;
          patch.checked_in_by = null;
        }
      }
      await updateDoc(doc(db!, 'space_bookings', a.id), patch);
    } else {
      await updateDoc(doc(db!, 'tour_requests', a.id), { status: a.toValue });
    }
    $api('/api/agenda-web/notify-status', {
      method: 'POST',
      body: { kind: a.kind, id: a.id, status: a.toValue },
    }).catch(() => {});
    pendingAction.value = null;
  } finally {
    actionBusy.value = false;
    savingId.value = null;
  }
}

function cancelPendingAction(): void {
  pendingAction.value = null;
  selectReset.value += 1;
}

/// Opciones del select por reserva: 'completed' solo aparece cuando ya
/// es el estado actual (para que el select lo muestre), nunca como destino.
function bookingStatusOptions(b: SpaceBooking) {
  return BOOKING_STATUSES.filter(
    (s) => s.value !== 'completed' || b.status === 'completed',
  );
}

const fmtClock = (ms: number) =>
  new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

/// La vista completa con historial (/agenda-web) es de mando - recepción
/// trabaja la agenda del día desde el dashboard.
const canSeeFullAgenda = computed(() =>
  canAccess(session.value?.role, '/agenda-web'),
);

// ─── Salas en vivo (ocupación por sede, en tiempo real) ───
const staffBranchId = computed(() => session.value?.branchId ?? null);
const visibleSpaces = computed(() =>
  staffBranchId.value
    ? spaces.value.filter((sp) => sp.branchIds.includes(staffBranchId.value!))
    : spaces.value,
);

function cdmxHour(): number {
  return Number(
    new Date(nowTick.value).toLocaleTimeString('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'America/Mexico_City',
    }),
  );
}

type RoomState = {
  kind: 'occupied' | 'next' | 'free';
  booking: SpaceBooking | null;
};

function roomState(sp: RoomSpace): RoomState {
  const nowH = cdmxHour();
  const today = bookings.value.filter(
    (b) =>
      b.spaceId === sp.id &&
      b.date === todayKey &&
      b.status !== 'cancelled' &&
      b.status !== 'no_show',
  );
  const active =
    today.find(
      (b) =>
        b.mode === 'day' ||
        ((b.startHour ?? 99) <= nowH && nowH < (b.endHour ?? 24)),
    ) ?? null;
  if (active) return { kind: 'occupied', booking: active };
  const next =
    today
      .filter((b) => b.mode === 'hour' && (b.startHour ?? 0) > nowH)
      .sort((a, b) => (a.startHour ?? 0) - (b.startHour ?? 0))[0] ?? null;
  return next ? { kind: 'next', booking: next } : { kind: 'free', booking: null };
}

const roomCards = computed(() =>
  visibleSpaces.value.map((sp) => ({ space: sp, ...roomState(sp) })),
);

const roomBadge: Record<RoomState['kind'], string> = {
  occupied: 'bg-pastel-pink/15 text-pastel-pink ring-1 ring-inset ring-pastel-pink/25',
  next: 'bg-pastel-yellow/15 text-pastel-yellow ring-1 ring-inset ring-pastel-yellow/25',
  free: 'bg-pastel-lavender/15 text-pastel-lavender ring-1 ring-inset ring-pastel-lavender/25',
};
const roomLabel: Record<RoomState['kind'], string> = {
  occupied: 'Ocupada',
  next: 'Próxima',
  free: 'Libre',
};

function roomDetail(r: { kind: RoomState['kind']; booking: SpaceBooking | null }): string {
  const b = r.booking;
  if (!b) return 'Sin reservas hoy';
  const who = b.guests?.name ?? 'Reserva';
  if (r.kind === 'occupied') {
    return b.mode === 'day'
      ? `${who} · día completo`
      : `${who} · hasta ${b.endHour}:00`;
  }
  return `próxima ${b.startHour}:00 · ${who} · ${b.people} pers.`;
}

function roomBranches(sp: RoomSpace): string {
  return sp.branchIds.map((id) => branchNames.value[id] ?? id).join(' · ');
}

/// El conteo "hoy" de check-ins también se filtra por la sede del staff.
const membersToday = computed(() =>
  recentCheckIns.value.filter(
    (c) =>
      c.granted &&
      (!staffBranchId.value || c.branchId === staffBranchId.value),
  ).length,
);

/// Si hay más de 4 salas, se distribuyen en filas de 3 columnas;
/// si son 4 o menos, se muestran hasta en 4 columnas.
const roomsGridClass = computed(() =>
  roomCards.value.length > 4
    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
    : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
);
</script>

<template>
  <div class="space-y-6">
    <!-- KPIs de agenda -->
    <section class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div
        v-for="kpi in agendaKpis"
        :key="kpi.label"
        class="rounded-2xl border border-stroke bg-surface p-5 transition-colors hover:border-white/15"
      >
        <p class="text-sm font-medium text-text-muted">
          {{ kpi.label }}
        </p>
        <div class="mt-4 flex items-end justify-between gap-3">
          <p class="text-4xl font-semibold tracking-tight text-white leading-none">
            {{ kpi.value }}
          </p>
          <span
            class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            :class="kpi.chip"
          >
            <component :is="kpi.icon" class="h-3.5 w-3.5" />
            {{ kpi.tag }}
          </span>
        </div>
      </div>
    </section>

    <!-- Agenda + Tours -->
    <section class="grid gap-4 lg:grid-cols-5">
      <!-- Próximas reservas -->
      <div class="rounded-2xl border border-stroke bg-surface lg:col-span-3">
        <div class="flex items-center justify-between border-b border-stroke px-5 py-4">
          <h2 class="text-base font-medium text-white">
            Agenda - hoy y próximas
          </h2>
          <NuxtLink
            v-if="canSeeFullAgenda"
            to="/agenda-web"
            class="flex cursor-pointer items-center gap-1 rounded-full bg-surface-elevated px-3 py-1 text-xs font-medium text-text-secondary transition hover:bg-white/10 hover:text-white"
          >
            Ver agenda completa <ArrowRight class="h-3.5 w-3.5" />
          </NuxtLink>
        </div>
        <div class="divide-y divide-stroke">
          <div v-if="agendaPending" class="px-5 py-10 text-center text-xs text-text-dim">
            Cargando agenda…
          </div>
          <div
            v-else-if="!upcomingBookings.length"
            class="px-5 py-10 text-center text-xs text-text-dim"
          >
            Sin reservas próximas - la agenda está libre.
          </div>
          <div
            v-for="b in upcomingBookings"
            :key="b.id"
            class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-white/[0.02]"
          >
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-xs font-semibold tracking-wider text-accent">{{ b.folio }}</span>
                <span
                  class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  :class="statusBadge[b.status]"
                >
                  {{ BOOKING_STATUSES.find((s) => s.value === b.status)?.label ?? b.status }}
                </span>
                <span class="text-sm font-medium text-white">{{ b.spaceName }}</span>
                <span
                  v-if="b.status === 'completed' && b.checkedInAt"
                  class="text-xs font-medium text-emerald-300"
                >
                  ✓ {{ fmtClock(b.checkedInAt) }}
                </span>
              </div>
              <p class="mt-1 text-xs text-text-muted">
                {{ fmtDate(b.date) }} · {{ fmtTime(b) }} · {{ b.people }} pers. · {{ b.guests?.name }}
              </p>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-sm font-semibold text-white">{{ mxn(b.totalMxn) }}</span>
              <span
                v-if="bookingStatusLocked(b)"
                class="flex items-center gap-1 rounded-xl border border-stroke bg-base px-2.5 py-1.5 text-[11px] font-medium text-text-dim"
                title="Acceso ya confirmado - solo gerente puede cambiar el estado"
              >
                <Lock class="h-3 w-3" /> Requiere gerente
              </span>
              <select
                v-else
                :key="`${b.id}-${selectReset}`"
                :value="b.status"
                :disabled="savingId === b.id"
                class="rounded-xl border border-stroke bg-base px-3 py-1.5 text-xs font-medium text-white outline-none transition focus:border-accent disabled:opacity-50"
                @change="askBookingStatus(b, $event)"
              >
                <option v-for="s in bookingStatusOptions(b)" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Tours por contactar -->
      <div class="rounded-2xl border border-stroke bg-surface lg:col-span-2">
        <div class="flex items-center justify-between border-b border-stroke px-5 py-4">
          <h2 class="text-base font-medium text-white">
            Tours por contactar
          </h2>
          <span class="rounded-full bg-pastel-pink/15 px-2.5 py-0.5 text-xs font-semibold text-pastel-pink ring-1 ring-inset ring-pastel-pink/25">
            {{ agendaStats.newTours }} nuevos
          </span>
        </div>
        <div class="divide-y divide-stroke">
          <div
            v-if="!pendingTours.length"
            class="px-5 py-10 text-center text-xs text-text-dim"
          >
            Sin tours pendientes de contacto.
          </div>
          <div
            v-for="t in pendingTours"
            :key="t.id"
            class="px-5 py-3.5 transition-colors hover:bg-white/[0.02]"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-mono text-xs font-semibold tracking-wider text-accent">{{ t.folio }}</span>
                  <span
                    class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    :class="statusBadge[t.status]"
                  >
                    {{ TOUR_STATUSES.find((s) => s.value === t.status)?.label ?? t.status }}
                  </span>
                </div>
                <p class="mt-1.5 truncate text-sm font-medium text-white">
                  {{ t.name }}<span v-if="t.company" class="font-normal text-text-muted"> · {{ t.company }}</span>
                </p>
                <p class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-dim">
                  <span class="flex items-center gap-1"><Mail class="h-3 w-3" /> {{ t.email }}</span>
                  <span v-if="t.phone" class="flex items-center gap-1"><Phone class="h-3 w-3" /> {{ t.phone }}</span>
                  <span>{{ fmtCreated(t.createdAt) }}</span>
                </p>
              </div>
              <select
                :key="`${t.id}-${selectReset}`"
                :value="t.status"
                :disabled="savingId === t.id"
                class="shrink-0 rounded-xl border border-stroke bg-base px-3 py-1.5 text-xs font-medium text-white outline-none transition focus:border-accent disabled:opacity-50"
                @change="askTourStatus(t, $event)"
              >
                <option v-for="s in TOUR_STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Salas en vivo - ocupación de la sede en tiempo real -->
    <section>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-lg font-medium text-white">
          Salas en vivo
        </h2>
        <div class="flex items-center gap-2.5">
          <span
            v-if="session?.branchName"
            class="flex items-center gap-1.5 rounded-full border border-stroke bg-surface px-3 py-1 text-xs font-medium text-accent"
          >
            <MapPin class="h-3.5 w-3.5" /> {{ session.branchName }}
          </span>
          <span class="flex items-center gap-1.5 rounded-full border border-stroke bg-surface px-3 py-1 text-xs font-medium text-text-muted">
            <Users class="h-3.5 w-3.5" /> {{ membersToday }} hoy
          </span>
          <span class="flex items-center gap-1.5 rounded-full bg-surface-elevated px-3 py-1 text-xs font-medium text-text-secondary">
            <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-pastel-lavender" />
            Tiempo real
          </span>
        </div>
      </div>

      <div class="grid gap-4" :class="roomsGridClass">
        <template v-if="spacesPending && !roomCards.length">
          <div
            v-for="i in 4"
            :key="i"
            class="animate-pulse rounded-2xl border border-stroke bg-surface p-5"
          >
            <div class="flex items-start justify-between">
              <div class="space-y-2">
                <div class="h-4 w-24 rounded bg-white/5" />
                <div class="h-3 w-32 rounded bg-white/5" />
              </div>
              <div class="h-5 w-14 rounded-full bg-white/5" />
            </div>
            <div class="mt-4 h-4 w-40 rounded bg-white/5" />
          </div>
        </template>
        <div
          v-for="r in roomCards"
          v-else
          :key="r.space.id"
          class="rounded-2xl border border-stroke bg-surface p-5 transition-colors hover:border-white/15"
        >
          <div class="flex items-start justify-between gap-3">
            <span
              class="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              :class="roomBadge[r.kind]"
            >
              {{ roomLabel[r.kind] }}
            </span>
            <p class="text-xs font-medium text-text-muted">
              {{ mxn(r.space.pricePerHour) }}/h
            </p>
          </div>
          <div class="mt-3.5 min-w-0">
            <p class="truncate text-base font-medium text-white">{{ r.space.name }}</p>
            <p class="mt-1 text-xs text-text-muted">
              {{ r.space.capacity }} personas
              <span v-if="!staffBranchId"> · {{ roomBranches(r.space) }}</span>
            </p>
          </div>
          <p class="mt-3.5 truncate border-t border-stroke/70 pt-3 text-xs" :class="r.kind === 'free' ? 'text-text-dim' : 'font-medium text-text-secondary'">
            {{ roomDetail(r) }}
          </p>
        </div>
      </div>
    </section>

    <!-- Confirmación de cambios de estado -->
    <UModal
      v-model:open="confirmOpen"
      title="Confirmar cambio"
    >
      <template #body>
        <template v-if="pendingAction">
          <p class="font-mono text-sm font-bold tracking-wider text-accent">{{ pendingAction.title }}</p>
          <p class="mt-1 text-xs text-text-secondary">{{ pendingAction.subtitle }}</p>
          <p class="mt-3 text-sm font-bold text-text-primary">
            {{ pendingAction.fromLabel }}
            <span class="mx-1 text-text-dim">→</span>
            {{ pendingAction.toLabel }}
          </p>
          <p
            v-if="pendingAction.warn"
            class="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-400"
          >
            {{ pendingAction.warn }}
          </p>
        </template>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="outline"
            @click="cancelPendingAction"
          />
          <UButton
            :label="pendingAction?.toLabel ?? 'Confirmar'"
            :loading="actionBusy"
            color="primary"
            @click="applyPendingAction"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
