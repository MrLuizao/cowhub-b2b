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
  ChevronLeft,
  ChevronRight,
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
const search = ref('');
const page = ref(1);
const pageSize = 8;
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

function subscribe() {
  unsubB?.();
  unsubT?.();
  if (!db) {
    pending.value = false;
    return;
  }
  pending.value = true;
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
}

onMounted(subscribe);

onBeforeUnmount(() => {
  unsubB?.();
  unsubT?.();
});

// ─── Filtros, búsqueda y paginación ───
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
  b.mode === 'day' ? 'Día completo' : `${b.startHour}:00 - ${b.endHour}:00`;
const fmtCreated = (ms: number) =>
  ms ? new Date(ms).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '-';

const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

const bookingsFiltered = computed(() => {
  const q = search.value.trim().toLowerCase();
  const list = bookings.value.filter((b) => {
    if (statusFilter.value !== 'todas' && b.status !== statusFilter.value) return false;
    if (!q) return true;
    return (
      b.folio.toLowerCase().includes(q) ||
      b.spaceName.toLowerCase().includes(q) ||
      (b.guests?.name || '').toLowerCase().includes(q) ||
      (b.guests?.email || '').toLowerCase().includes(q) ||
      (b.guests?.company || '').toLowerCase().includes(q)
    );
  });
  return [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
});

const toursFiltered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return tours.value.filter((t) => {
    if (statusFilter.value !== 'todas' && t.status !== statusFilter.value) return false;
    if (!q) return true;
    return (
      t.folio.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      (t.company || '').toLowerCase().includes(q) ||
      t.email.toLowerCase().includes(q)
    );
  });
});

const activeCount = computed(() =>
  tab.value === 'reservas' ? bookingsFiltered.value.length : toursFiltered.value.length,
);

const pageCount = computed(() => Math.max(1, Math.ceil(activeCount.value / pageSize)));

const pagedBookings = computed(() =>
  bookingsFiltered.value.slice((page.value - 1) * pageSize, page.value * pageSize),
);

const pagedTours = computed(() =>
  toursFiltered.value.slice((page.value - 1) * pageSize, page.value * pageSize),
);

watch([tab, statusFilter, search], () => {
  page.value = 1;
});

watch(tab, () => {
  statusFilter.value = 'todas';
});

watch(pageCount, (pages) => {
  if (page.value > pages) page.value = pages;
});

// ─── Acciones ───
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
const actionReason = ref('');
const actionBusy = ref(false);
const selectReset = ref(0);

const reasonRequired = computed(() => {
  const v = pendingAction.value?.toValue;
  return v === 'cancelled' || v === 'no_show';
});

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

const canEditCompleted = computed(() => {
  const r = session.value?.role;
  return r === 'ADMIN' || r === 'MANAGER';
});

function bookingStatusLocked(b: SpaceBooking): boolean {
  return b.status === 'completed' && !canEditCompleted.value;
}

function askBookingStatus(b: SpaceBooking, status: string): void {
  if (bookingStatusLocked(b)) return;
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
  ).map((s) => ({ label: s.label, value: s.value }));
}

function askTourStatus(t: TourRequest, status: string): void {
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
  const reason = actionReason.value.trim();
  if (reasonRequired.value && !reason) return;
  actionBusy.value = true;
  savingId.value = a.id;
  try {
    const auditFields = {
      ...(reason ? { notes: reason } : {}),
      status_updated_by: session.value?.name || session.value?.email || 'Staff',
      status_updated_at: Date.now(),
    };
    if (a.kind === 'booking') {
      const patch: Record<string, unknown> = { status: a.toValue, ...auditFields };
      if (a.toValue !== 'completed') {
        const current = bookings.value.find((b) => b.id === a.id);
        if (current?.checkedInAt || current?.checkedInBy) {
          patch.checked_in_at = null;
          patch.checked_in_by = null;
        }
      }
      await updateDoc(doc(db!, 'space_bookings', a.id), patch);
    } else {
      await updateDoc(doc(db!, 'tour_requests', a.id), {
        status: a.toValue,
        ...auditFields,
      });
    }
    $api('/api/agenda-web/notify-status', {
      method: 'POST',
      body: { kind: a.kind, id: a.id, status: a.toValue, reason: reason || undefined },
    }).catch(() => {});
    pendingAction.value = null;
    actionReason.value = '';
  } finally {
    actionBusy.value = false;
    savingId.value = null;
  }
}

function cancelPendingAction(): void {
  pendingAction.value = null;
  actionReason.value = '';
  selectReset.value += 1;
}

const statusMeta: Record<string, { cls: string; dot: string }> = {
  pending: {
    cls: 'border-amber-500/35 bg-amber-500/15 text-amber-400',
    dot: 'bg-amber-500',
  },
  confirmed: {
    cls: 'border-accent/35 bg-accent/15 text-accent',
    dot: 'bg-accent',
  },
  completed: {
    cls: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-400',
    dot: 'bg-emerald-500',
  },
  no_show: {
    cls: 'border-amber-500/35 bg-amber-500/15 text-amber-400',
    dot: 'bg-amber-500',
  },
  cancelled: {
    cls: 'border-red-500/35 bg-red-500/15 text-red-400',
    dot: 'bg-red-500',
  },
  new: {
    cls: 'border-amber-500/35 bg-amber-500/15 text-amber-400',
    dot: 'bg-amber-500',
  },
  contacted: {
    cls: 'border-accent/35 bg-accent/15 text-accent',
    dot: 'bg-accent',
  },
  done: {
    cls: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-400',
    dot: 'bg-emerald-500',
  },
};
</script>

<template>
  <div class="space-y-6">
    <!-- Tabs globales prominentes: RESERVAS y TOURS -->
    <div class="grid grid-cols-2 gap-3 rounded-2xl border border-stroke bg-surface p-1.5">
      <button
        type="button"
        class="flex cursor-pointer items-center justify-center gap-2.5 rounded-xl px-5 py-3 text-sm font-black uppercase tracking-widest transition"
        :class="
          tab === 'reservas'
            ? 'bg-accent text-base'
            : 'text-text-muted hover:bg-surface-elevated hover:text-text-primary'
        "
        @click="tab = 'reservas'"
      >
        <Ticket class="h-4 w-4" />
        <span>Reservas</span>
        <span
          class="rounded-md px-2 py-0.5 text-[11px] font-bold"
          :class="tab === 'reservas' ? 'bg-base/20 text-base' : 'bg-base text-text-dim'"
        >
          {{ bookings.length }}
        </span>
      </button>
      <button
        type="button"
        class="flex cursor-pointer items-center justify-center gap-2.5 rounded-xl px-5 py-3 text-sm font-black uppercase tracking-widest transition"
        :class="
          tab === 'tours'
            ? 'bg-accent text-base'
            : 'text-text-muted hover:bg-surface-elevated hover:text-text-primary'
        "
        @click="tab = 'tours'"
      >
        <User class="h-4 w-4" />
        <span>Tours</span>
        <span
          class="rounded-md px-2 py-0.5 text-[11px] font-bold"
          :class="tab === 'tours' ? 'bg-base/20 text-base' : 'bg-base text-text-dim'"
        >
          {{ tours.length }}
        </span>
      </button>
    </div>

    <!-- Encabezado descriptivo + Pills de estado -->
    <section>
      <h2 class="mb-3 text-sm font-black uppercase tracking-widest text-text-muted">
        {{ tab === 'reservas' ? 'Reservas del sitio público' : 'Solicitudes de tour del sitio público' }}
      </h2>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="cursor-pointer rounded-full border px-4 py-1.5 text-xs font-bold transition"
          :class="
            statusFilter === 'todas'
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-stroke bg-surface text-text-muted hover:text-text-primary'
          "
          @click="statusFilter = 'todas'"
        >
          Todos
        </button>
        <button
          v-for="s in tab === 'reservas' ? BOOKING_STATUSES : TOUR_STATUSES"
          :key="s.value"
          type="button"
          class="cursor-pointer rounded-full border px-4 py-1.5 text-xs font-bold transition"
          :class="
            statusFilter === s.value
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-stroke bg-surface text-text-muted hover:text-text-primary'
          "
          @click="statusFilter = s.value"
        >
          {{ s.label }}
        </button>
      </div>
    </section>

    <!-- Barra de herramientas: Buscador + Contador + Recargar -->
    <div class="flex flex-wrap items-center gap-4">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Buscar por folio, cliente o espacio…"
        class="w-full max-w-sm"
        size="lg"
      />
      <span class="rounded-full border border-stroke bg-surface px-3 py-1 text-[11px] font-bold text-text-muted">
        {{ activeCount }} {{ tab === 'reservas' ? 'reservas' : 'tours' }}
      </span>
      <button
        type="button"
        class="ml-auto flex shrink-0 cursor-pointer items-center gap-2 rounded-full border border-stroke bg-surface px-5 py-2.5 text-xs font-bold text-text-primary transition hover:border-accent hover:text-accent"
        @click="subscribe"
      >
        <RefreshCw class="h-3.5 w-3.5" :class="pending && 'animate-spin'" />
        Recargar
      </button>
    </div>

    <!-- Tabla paginada: Reservas -->
    <div v-if="tab === 'reservas'" class="overflow-hidden rounded-2xl border border-stroke bg-surface">
      <table class="w-full text-left">
        <thead>
          <tr class="border-b border-stroke text-[10px] uppercase tracking-widest text-text-dim">
            <th class="px-5 py-3 font-bold">Folio</th>
            <th class="px-5 py-3 font-bold">Espacio</th>
            <th class="px-5 py-3 font-bold">Fecha y hora</th>
            <th class="px-5 py-3 font-bold">Cliente</th>
            <th class="px-5 py-3 font-bold">Total</th>
            <th class="px-5 py-3 font-bold">Estado</th>
            <th class="px-5 py-3 text-right font-bold">Acción</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in pagedBookings" :key="b.id" class="border-t border-stroke">
            <td class="px-5 py-3.5">
              <p class="font-mono text-xs font-bold tracking-wider text-accent">{{ b.folio }}</p>
              <span
                class="mt-1 inline-flex items-center rounded-md border border-stroke bg-base px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-dim"
              >
                {{ b.source === 'web' ? 'Sitio web' : 'B2B' }}
              </span>
            </td>
            <td class="px-5 py-3.5">
              <p class="text-xs font-bold text-text-primary">{{ b.spaceName }}</p>
              <p class="text-[10px] text-text-dim">{{ b.people }} pers.</p>
            </td>
            <td class="px-5 py-3.5 whitespace-nowrap">
              <p class="text-xs font-medium text-text-secondary">{{ fmtDate(b.date) }}</p>
              <p class="font-mono text-[11px] font-semibold text-accent">{{ fmtTime(b) }}</p>
            </td>
            <td class="px-5 py-3.5">
              <p class="text-xs font-semibold text-text-primary">
                {{ b.guests?.name || '-' }}
                <span v-if="b.guests?.company" class="font-normal text-text-dim">· {{ b.guests.company }}</span>
              </p>
              <p class="mt-0.5 flex flex-wrap items-center gap-x-3 text-[10px] text-text-dim">
                <span v-if="b.guests?.email" class="inline-flex items-center gap-1">
                  <Mail class="h-3 w-3" /> {{ b.guests.email }}
                </span>
                <span v-if="b.guests?.phone" class="inline-flex items-center gap-1">
                  <Phone class="h-3 w-3" /> {{ b.guests.phone }}
                </span>
              </p>
            </td>
            <td class="px-5 py-3.5 whitespace-nowrap">
              <p class="text-xs font-bold text-text-primary">{{ mxn(b.totalMxn) }}</p>
              <p class="text-[10px] text-text-dim">{{ fmtCreated(b.createdAt) }}</p>
            </td>
            <td class="px-5 py-3.5">
              <span
                class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                :class="statusMeta[b.status]?.cls ?? 'border-stroke bg-base text-text-muted'"
              >
                <span class="h-1.5 w-1.5 rounded-full" :class="statusMeta[b.status]?.dot ?? 'bg-text-dim'" />
                {{ BOOKING_STATUSES.find((s) => s.value === b.status)?.label ?? b.status }}
              </span>
            </td>
            <td class="px-5 py-3.5 text-right">
              <span
                v-if="bookingStatusLocked(b)"
                class="inline-flex items-center gap-1.5 rounded-xl border border-stroke bg-base px-3 py-1.5 text-[11px] font-bold text-text-dim"
                title="Acceso ya confirmado - solo gerente puede cambiar el estado"
              >
                <Lock class="h-3.5 w-3.5" /> Requiere gerente
              </span>
              <USelect
                v-else
                :key="`${b.id}-${selectReset}`"
                :model-value="b.status"
                :items="bookingStatusOptions(b)"
                value-key="value"
                label-key="label"
                size="sm"
                :disabled="savingId === b.id"
                class="w-36 text-left"
                @update:model-value="(val) => askBookingStatus(b, String(val))"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="pending" class="py-10 text-center text-xs font-semibold text-text-dim">Cargando reservas…</p>
      <p v-else-if="pagedBookings.length === 0" class="py-10 text-center text-xs font-semibold text-text-dim">
        Sin reservas que coincidan con el filtro
      </p>
      <div v-if="bookingsFiltered.length > 0" class="flex items-center justify-between border-t border-stroke px-5 py-2.5">
        <p class="text-[10px] font-semibold text-text-dim">
          {{ bookingsFiltered.length }} reservas · página {{ page }} de {{ pageCount }}
        </p>
        <div class="flex gap-1.5">
          <button
            type="button"
            class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-stroke text-text-muted transition hover:border-accent hover:text-accent disabled:opacity-30"
            :disabled="page === 1"
            @click="page--"
          >
            <ChevronLeft class="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-stroke text-text-muted transition hover:border-accent hover:text-accent disabled:opacity-30"
            :disabled="page === pageCount"
            @click="page++"
          >
            <ChevronRight class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Tabla paginada: Tours -->
    <div v-else class="overflow-hidden rounded-2xl border border-stroke bg-surface">
      <table class="w-full text-left">
        <thead>
          <tr class="border-b border-stroke text-[10px] uppercase tracking-widest text-text-dim">
            <th class="px-5 py-3 font-bold">Folio</th>
            <th class="px-5 py-3 font-bold">Solicitante</th>
            <th class="px-5 py-3 font-bold">Contacto</th>
            <th class="px-5 py-3 font-bold">Preferencia</th>
            <th class="px-5 py-3 font-bold">Estado</th>
            <th class="px-5 py-3 text-right font-bold">Acción</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in pagedTours" :key="t.id" class="border-t border-stroke">
            <td class="px-5 py-3.5 whitespace-nowrap">
              <p class="font-mono text-xs font-bold tracking-wider text-accent">{{ t.folio }}</p>
              <p class="text-[10px] text-text-dim">{{ fmtCreated(t.createdAt) }}</p>
            </td>
            <td class="px-5 py-3.5">
              <p class="text-xs font-bold text-text-primary">
                {{ t.name }}
                <span v-if="t.company" class="font-normal text-text-dim">· {{ t.company }}</span>
              </p>
              <p v-if="t.message" class="mt-0.5 max-w-xs truncate text-[10px] italic text-text-dim">
                "{{ t.message }}"
              </p>
            </td>
            <td class="px-5 py-3.5">
              <p class="flex items-center gap-1 text-xs text-text-secondary">
                <Mail class="h-3 w-3 text-text-dim" /> {{ t.email }}
              </p>
              <p class="mt-0.5 flex items-center gap-1 text-[10px] text-text-dim">
                <Phone class="h-3 w-3" /> {{ t.phone }}
              </p>
            </td>
            <td class="px-5 py-3.5 whitespace-nowrap">
              <p class="text-xs font-medium text-text-secondary">
                {{ t.preferredDate ? fmtDate(t.preferredDate) : 'Sin fecha' }}
              </p>
              <p class="text-[10px] text-text-dim">
                {{ t.people }} pers. <span v-if="t.interest">· {{ t.interest }}</span>
              </p>
            </td>
            <td class="px-5 py-3.5">
              <span
                class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                :class="statusMeta[t.status]?.cls ?? 'border-stroke bg-base text-text-muted'"
              >
                <span class="h-1.5 w-1.5 rounded-full" :class="statusMeta[t.status]?.dot ?? 'bg-text-dim'" />
                {{ TOUR_STATUSES.find((s) => s.value === t.status)?.label ?? t.status }}
              </span>
            </td>
            <td class="px-5 py-3.5 text-right">
              <USelect
                :key="`${t.id}-${selectReset}`"
                :model-value="t.status"
                :items="[...TOUR_STATUSES]"
                value-key="value"
                label-key="label"
                size="sm"
                :disabled="savingId === t.id"
                class="w-36 text-left"
                @update:model-value="(val) => askTourStatus(t, String(val))"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="pending" class="py-10 text-center text-xs font-semibold text-text-dim">Cargando tours…</p>
      <p v-else-if="pagedTours.length === 0" class="py-10 text-center text-xs font-semibold text-text-dim">
        Sin solicitudes de tour con este filtro
      </p>
      <div v-if="toursFiltered.length > 0" class="flex items-center justify-between border-t border-stroke px-5 py-2.5">
        <p class="text-[10px] font-semibold text-text-dim">
          {{ toursFiltered.length }} tours · página {{ page }} de {{ pageCount }}
        </p>
        <div class="flex gap-1.5">
          <button
            type="button"
            class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-stroke text-text-muted transition hover:border-accent hover:text-accent disabled:opacity-30"
            :disabled="page === 1"
            @click="page--"
          >
            <ChevronLeft class="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-stroke text-text-muted transition hover:border-accent hover:text-accent disabled:opacity-30"
            :disabled="page === pageCount"
            @click="page++"
          >
            <ChevronRight class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Confirmación de cambios de estado -->
    <UModal v-model:open="confirmOpen" title="Confirmar cambio">
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
          <label class="mt-4 block">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Justificación o nota {{ reasonRequired ? '*' : '(opcional)' }}
            </span>
            <textarea
              v-model="actionReason"
              rows="2"
              placeholder="Ej. Confirmado por teléfono / Solicitó reagendar…"
              class="mt-1.5 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-xs text-text-primary outline-none transition focus:border-accent"
            />
          </label>
        </template>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Cancelar" color="neutral" variant="outline" @click="cancelPendingAction" />
          <UButton
            :label="pendingAction?.toLabel ?? 'Confirmar'"
            :loading="actionBusy"
            :disabled="reasonRequired && !actionReason.trim()"
            color="primary"
            @click="applyPendingAction"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
