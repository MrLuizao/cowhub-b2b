<script setup lang="ts">
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  CalendarClock,
  CircleDollarSign,
  Lock,
  Mail,
  Phone,
  RefreshCw,
  Ticket,
  User,
} from '@lucide/vue';

import type { SpaceBooking, TourRequest } from '#shared/types';

const { db } = useFirebase();
const { session } = useAuth();

const bookings = ref<SpaceBooking[]>([]);
const tours = ref<TourRequest[]>([]);
const pending = ref(true);
const tab = ref<'reservas' | 'tours'>('reservas');
const statusFilter = ref('todas');
const savingId = ref<string | null>(null);

const BOOKING_STATUSES = [
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

onMounted(() => {
  if (!db) {
    pending.value = false;
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
      pending.value = false;
    },
    () => (pending.value = false),
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
});

onBeforeUnmount(() => {
  unsubB?.();
  unsubT?.();
});

// ─── Filtros y stats ───
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

const bookingsFiltered = computed(() => {
  const list = statusFilter.value === 'todas'
    ? bookings.value
    : bookings.value.filter((b) => b.status === statusFilter.value);
  return [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
});
const toursFiltered = computed(() =>
  statusFilter.value === 'todas'
    ? tours.value
    : tours.value.filter((t) => t.status === statusFilter.value),
);

const stats = computed(() => {
  const confirmed = bookings.value.filter((b) => b.status === 'confirmed');
  const monthKey = todayKey.slice(0, 7);
  return {
    today: bookings.value.filter((b) => b.date === todayKey).length,
    monthRevenue: confirmed
      .filter((b) => b.date.startsWith(monthKey))
      .reduce((s, b) => s + b.totalMxn, 0),
    newTours: tours.value.filter((t) => t.status === 'new').length,
    total: bookings.value.length,
  };
});

// ─── Acciones ───
/// 'completed' NO está en el select - solo se alcanza por el panel de
/// folio del dashboard (checked_in_at/by). Revertir limpia el sello.
/// NINGÚN select muta directo: abre modal de confirmación primero;
/// `selectReset` remonta los selects si se cancela.
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

function bookingStatusOptions(b: SpaceBooking) {
  return BOOKING_STATUSES.filter(
    (s) => s.value !== 'completed' || b.status === 'completed',
  );
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

const statusBadge: Record<string, string> = {
  /// Vigente (azul) = reserva activa; Completada (verde) = acceso ya
  /// confirmado en recepción por folio.
  confirmed: 'bg-sky-500/15 text-sky-400',
  completed: 'bg-emerald-500/15 text-emerald-400',
  no_show: 'bg-amber-500/15 text-amber-400',
  cancelled: 'bg-red-500/15 text-red-400',
  new: 'bg-accent/15 text-accent',
  contacted: 'bg-sky-500/15 text-sky-400',
  done: 'bg-emerald-500/15 text-emerald-400',
};
</script>

<template>
  <div class="mx-auto max-w-7xl px-5 py-8 lg:px-8">
    <!-- Header -->
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
          <CalendarClock class="h-4 w-4" /> Agenda web
        </p>
        <h1 class="mt-1 text-2xl font-black tracking-tight text-text-primary">
          Reservas y tours del sitio público
        </h1>
      </div>
      <button
        class="flex items-center gap-2 rounded-full border border-stroke px-4 py-2 text-xs font-bold text-text-secondary transition hover:bg-base"
        @click="pending = true; bookings.value = []; tours.value = []">
        <RefreshCw class="h-3.5 w-3.5" :class="pending && 'animate-spin'" /> Recargar
      </button>
    </div>

    <!-- KPIs -->
    <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-2xl border border-stroke bg-surface p-5">
        <p class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-text-dim">
          <Ticket class="h-3.5 w-3.5" /> Reservas hoy
        </p>
        <p class="mt-2 text-3xl font-black text-text-primary">{{ stats.today }}</p>
      </div>
      <div class="rounded-2xl border border-stroke bg-surface p-5">
        <p class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-text-dim">
          <CircleDollarSign class="h-3.5 w-3.5" /> Ingresos del mes
        </p>
        <p class="mt-2 text-3xl font-black text-text-primary">{{ mxn(stats.monthRevenue) }}</p>
      </div>
      <div class="rounded-2xl border border-stroke bg-surface p-5">
        <p class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-text-dim">
          <User class="h-3.5 w-3.5" /> Tours nuevos
        </p>
        <p class="mt-2 text-3xl font-black text-text-primary">{{ stats.newTours }}</p>
      </div>
      <div class="rounded-2xl border border-stroke bg-surface p-5">
        <p class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-text-dim">
          <CalendarClock class="h-3.5 w-3.5" /> Reservas totales
        </p>
        <p class="mt-2 text-3xl font-black text-text-primary">{{ stats.total }}</p>
      </div>
    </div>

    <!-- Tabs + filtro -->
    <div class="mt-8 flex flex-wrap items-center justify-between gap-3">
      <div class="flex rounded-full border border-stroke p-1">
        <button
          class="rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wider transition"
          :class="tab === 'reservas' ? 'bg-accent text-white' : 'text-text-dim hover:text-text-primary'"
          @click="tab = 'reservas'">
          Reservas <span class="opacity-70">({{ bookings.length }})</span>
        </button>
        <button
          class="rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wider transition"
          :class="tab === 'tours' ? 'bg-accent text-white' : 'text-text-dim hover:text-text-primary'"
          @click="tab = 'tours'">
          Tours <span class="opacity-70">({{ tours.length }})</span>
        </button>
      </div>
      <select
        v-model="statusFilter"
        class="rounded-full border border-stroke bg-surface px-4 py-2 text-xs font-bold text-text-primary">
        <option value="todas">Todos los estados</option>
        <option v-for="s in tab === 'reservas' ? BOOKING_STATUSES : TOUR_STATUSES" :key="s.value" :value="s.value">
          {{ s.label }}
        </option>
      </select>
    </div>

    <!-- Reservas -->
    <div v-if="tab === 'reservas'" class="mt-4 space-y-3">
      <div v-if="pending" class="py-16 text-center text-sm text-text-dim">Cargando reservas…</div>
      <div v-else-if="!bookingsFiltered.length"
        class="rounded-2xl border border-dashed border-stroke py-16 text-center text-sm text-text-dim">
        Sin reservas con este filtro.
      </div>
      <article v-for="b in bookingsFiltered" :key="b.id"
        class="rounded-2xl border border-stroke bg-surface p-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-sm font-bold tracking-wider text-accent">{{ b.folio }}</span>
              <span class="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                :class="statusBadge[b.status]">
                {{ BOOKING_STATUSES.find((s) => s.value === b.status)?.label ?? b.status }}
              </span>
              <span class="rounded-full bg-base px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-dim">
                {{ b.source === 'web' ? 'Sitio web' : 'B2B' }}
              </span>
            </div>
            <h3 class="mt-1.5 text-base font-bold text-text-primary">{{ b.spaceName }}</h3>
            <p class="mt-0.5 text-sm text-text-secondary">
              {{ fmtDate(b.date) }} · {{ fmtTime(b) }} · {{ b.people }} pers.
            </p>
            <div class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-dim">
              <span class="flex items-center gap-1"><User class="h-3 w-3" /> {{ b.guests?.name }}</span>
              <span class="flex items-center gap-1"><Mail class="h-3 w-3" /> {{ b.guests?.email }}</span>
              <span v-if="b.guests?.phone" class="flex items-center gap-1"><Phone class="h-3 w-3" /> {{ b.guests.phone }}</span>
              <span v-if="b.guests?.company">· {{ b.guests.company }}</span>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <div class="text-right">
              <p class="font-display text-xl font-bold text-text-primary">{{ mxn(b.totalMxn) }}</p>
              <p class="text-[10px] uppercase tracking-wider text-text-dim">{{ fmtCreated(b.createdAt) }}</p>
            </div>
            <span
              v-if="bookingStatusLocked(b)"
              class="flex items-center gap-1.5 rounded-lg border border-stroke bg-base px-3 py-2 text-[11px] font-bold text-text-dim"
              title="Acceso ya confirmado - solo gerente puede cambiar el estado"
            >
              <Lock class="h-3.5 w-3.5" /> Requiere gerente
            </span>
            <select
              v-else
              :key="`${b.id}-${selectReset}`"
              :value="b.status"
              :disabled="savingId === b.id"
              class="rounded-lg border border-stroke bg-base px-3 py-2 text-xs font-bold text-text-primary disabled:opacity-50"
              @change="askBookingStatus(b, $event)">
              <option v-for="s in bookingStatusOptions(b)" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
          </div>
        </div>
      </article>
    </div>

    <!-- Tours -->
    <div v-else class="mt-4 space-y-3">
      <div v-if="!toursFiltered.length"
        class="rounded-2xl border border-dashed border-stroke py-16 text-center text-sm text-text-dim">
        Sin solicitudes de tour con este filtro.
      </div>
      <article v-for="t in toursFiltered" :key="t.id"
        class="rounded-2xl border border-stroke bg-surface p-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-sm font-bold tracking-wider text-accent">{{ t.folio }}</span>
              <span class="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                :class="statusBadge[t.status]">
                {{ TOUR_STATUSES.find((s) => s.value === t.status)?.label ?? t.status }}
              </span>
            </div>
            <h3 class="mt-1.5 text-base font-bold text-text-primary">{{ t.name }}
              <span v-if="t.company" class="font-normal text-text-dim">· {{ t.company }}</span>
            </h3>
            <div class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-dim">
              <span class="flex items-center gap-1"><Mail class="h-3 w-3" /> {{ t.email }}</span>
              <span class="flex items-center gap-1"><Phone class="h-3 w-3" /> {{ t.phone }}</span>
              <span v-if="t.preferredDate">Prefiere: {{ fmtDate(t.preferredDate) }}</span>
              <span>{{ t.people }} pers.</span>
              <span v-if="t.interest">Interés: {{ t.interest }}</span>
            </div>
            <p v-if="t.message" class="mt-2 rounded-lg bg-base px-3 py-2 text-xs italic text-text-secondary">
              “{{ t.message }}”
            </p>
          </div>
          <div class="flex items-center gap-4">
            <p class="text-[10px] uppercase tracking-wider text-text-dim">{{ fmtCreated(t.createdAt) }}</p>
            <select
              :key="`${t.id}-${selectReset}`"
              :value="t.status"
              :disabled="savingId === t.id"
              class="rounded-lg border border-stroke bg-base px-3 py-2 text-xs font-bold text-text-primary disabled:opacity-50"
              @change="askTourStatus(t, $event)">
              <option v-for="s in TOUR_STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
          </div>
        </div>
      </article>
    </div>

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
