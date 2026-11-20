<script setup lang="ts">
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { Keyboard, ScanLine } from '@lucide/vue';

import type { Branch, SpaceBooking } from '#shared/types';

const { session } = useAuth();
const { db } = useFirebase();

/// El acceso se registra en la sede del staff; admin (sin sede fija)
/// opera la primera sede disponible.
const branches = ref<Branch[]>([]);
const activeBranchId = ref<string>(session.value?.branchId ?? '');

const {
  handleScan,
  recent,
  lastResult,
  submitting,
  loadRecent,
} = useCheckIns(() => activeBranchId.value);

watch(activeBranchId, () => {
  void loadRecent();
});

// ─── Confirmar acceso por folio ───
/// Recepción captura el folio CH-XXXXXX que muestra el cliente; se busca
/// entre TODAS las reservas cargadas (no solo las próximas) para poder
/// explicar "esa reserva es de otro día" o "ya está completada".
const bookings = ref<SpaceBooking[]>([]);
let unsubB: Unsubscribe | null = null;

/// Captura indistinta: un solo campo recibe credencial de miembro
/// (QR firmado, número, USB) o folio de reserva CH-. El prefijo CH-
/// decide la ruta; cualquier otro código va al check-in de miembro.
const scanInput = ref('');
const scanInputRef = ref<HTMLInputElement | null>(null);
const folioId = ref<string | null>(null);
const folioError = ref<string | null>(null);

const FOLIO_RE = /CH-[A-Z0-9]{4,10}/i;

const folioBooking = computed(
  () => bookings.value.find((b) => b.id === folioId.value) ?? null,
);

const todayKey = new Date().toLocaleDateString('en-CA', {
  timeZone: 'America/Mexico_City',
});

/// Una reserva solo es confirmable el día de la visita - ni antes
/// (vencida) ni después (programada).
const folioDateState = computed<'past' | 'today' | 'future'>(() => {
  const d = folioBooking.value?.date;
  if (!d || d === todayKey) return 'today';
  return d < todayKey ? 'past' : 'future';
});

/// Estado del horario de una reserva de HOY (modo hora): recepción puede
/// confirmar en cualquier caso (llegada temprana o tardía) - el aviso
/// solo informa la desviación.
const folioSlotState = computed<'upcoming' | 'live' | 'passed' | null>(() => {
  const b = folioBooking.value;
  if (!b || b.date !== todayKey || b.mode !== 'hour') return null;
  const nowHour = Number(
    new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'America/Mexico_City',
    }),
  );
  const start = b.startHour ?? 0;
  const end = b.endHour ?? 24;
  if (nowHour < start) return 'upcoming';
  if (nowHour >= end) return 'passed';
  return 'live';
});

const folioCanConfirm = computed(
  () =>
    !!folioBooking.value &&
    folioDateState.value === 'today' &&
    folioBooking.value.status === 'confirmed',
);

// ─── Modal de confirmación (toda acción que modifica estado) ───
const pendingAction = ref<{
  title: string;
  subtitle: string;
  toLabel: string;
  warn: string | null;
} | null>(null);
const actionBusy = ref(false);

const confirmOpen = computed({
  get: () => pendingAction.value !== null,
  set: (v: boolean) => {
    if (!v) cancelPendingAction();
  },
});

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
const fmtClock = (ms: number) =>
  new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

const BOOKING_STATUS_LABELS: Record<string, string> = {
  confirmed: 'Vigente',
  completed: 'Completada',
  no_show: 'No show',
  cancelled: 'Cancelada',
};

function refocusScan(): void {
  void nextTick(() => scanInputRef.value?.focus());
}

async function onScan(): Promise<void> {
  const raw = scanInput.value.trim();
  if (!raw) return;
  scanInput.value = '';
  folioError.value = null;

  // ¿Trae un folio CH-? (texto plano o embebido en QR/URL/wallet)
  const folioCode = raw.toUpperCase().match(FOLIO_RE)?.[0];
  if (folioCode) {
    const found = bookings.value.find(
      (b) => b.folio?.toUpperCase() === folioCode,
    );
    folioId.value = found?.id ?? null;
    lastResult.value = null;
    if (!found) {
      folioError.value = `${folioCode} no encontrado - pide al cliente que confirme el folio CH- de su reserva.`;
    }
    refocusScan();
    return;
  }

  // Cualquier otro código = credencial de miembro o QR firmado
  folioId.value = null;
  await handleScan(raw);
  refocusScan();
}

function askAccessConfirm(): void {
  const b = folioBooking.value;
  if (!b || !folioCanConfirm.value || actionBusy.value) return;
  pendingAction.value = {
    title: b.folio,
    subtitle: `${b.spaceName} · ${fmtDate(b.date)} · ${fmtTime(b)} · ${b.guests?.name ?? ''}`,
    toLabel: 'Completada',
    warn:
      folioSlotState.value === 'upcoming'
        ? 'La visita aún no inicia en el horario de la reserva.'
        : folioSlotState.value === 'passed'
          ? 'El horario de la reserva ya terminó.'
          : null,
  };
}

async function applyPendingAction(): Promise<void> {
  const b = folioBooking.value;
  if (!b || !pendingAction.value || actionBusy.value) return;
  actionBusy.value = true;
  try {
    await updateDoc(doc(db!, 'space_bookings', b.id), {
      status: 'completed',
      checked_in_at: serverTimestamp(),
      checked_in_by:
        session.value?.name ?? session.value?.email ?? 'staff',
    });
    scanInput.value = '';
    folioId.value = null;
    pendingAction.value = null;
  } finally {
    actionBusy.value = false;
  }
}

function cancelPendingAction(): void {
  pendingAction.value = null;
}

onMounted(async () => {
  scanInputRef.value?.focus();
  branches.value = await $api<Branch[]>('/api/branches');
  if (!activeBranchId.value) {
    activeBranchId.value = branches.value[0]?.id ?? '';
  }
  void loadRecent();

  if (db) {
    unsubB = onSnapshot(
      query(
        collection(db, 'space_bookings'),
        orderBy('created_at', 'desc'),
        limit(300),
      ),
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
      },
    );
  }
});

onBeforeUnmount(() => unsubB?.());
</script>

<template>
  <div class="flex min-h-[calc(100vh-6rem)] flex-col gap-6">
    <!-- <h1 class="text-xl font-black text-text-primary">Recepción</h1> -->

    <!-- Captura única indistinta: miembro o reserva, el sistema detecta -->
    <section class="rounded-2xl border border-stroke bg-surface">
      <div class="grid gap-6 p-6 lg:grid-cols-2">
        <!-- Captura -->
        <div>
          <div class="flex items-center gap-3">
            <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <ScanLine class="h-5 w-5" />
            </div>
            <div>
              <h2 class="text-base font-black text-text-primary">Confirmar acceso</h2>
              <p class="text-[11px] font-semibold text-text-dim">
                Miembro, reserva o QR / pase wallet - el sistema detecta el tipo.
              </p>
            </div>
          </div>
          <form class="mt-5" @submit.prevent="onScan">
            <label
              class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-text-dim"
            >
              <Keyboard class="h-3.5 w-3.5" />
              Entrada del lector
            </label>
            <input
              ref="scanInputRef"
              v-model="scanInput"
              type="text"
              placeholder="Escanea credencial o folio CH-…"
              autocomplete="off"
              class="mt-1.5 w-full rounded-xl border border-stroke bg-base px-4 py-3 font-mono text-base text-text-primary outline-none transition placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-text-dim focus:border-accent"
            />
            <p class="mt-2 text-[10px] leading-relaxed text-text-dim">
              El lector actúa como teclado: este campo queda enfocado. Acepta QR de la app, número de miembro, folio CH-XXXXXX o pase QR/wallet. Enter para procesar y mostrar la acción correcta.
            </p>
          </form>
          <p v-if="folioError" class="mt-3 text-[11px] font-bold text-red-400">
            {{ folioError }}
          </p>
        </div>

        <!-- Resultado: reserva o miembro, según lo detectado -->
        <div class="flex flex-col justify-center">
          <div
            v-if="folioBooking"
            class="rounded-xl border border-stroke bg-base/60 p-5"
          >
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-mono text-sm font-bold tracking-wider text-accent">{{ folioBooking.folio }}</span>
                  <span
                    class="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                    :class="{
                      confirmed: 'bg-sky-500/15 text-sky-400',
                      completed: 'bg-emerald-500/15 text-emerald-400',
                      no_show: 'bg-amber-500/15 text-amber-400',
                      cancelled: 'bg-red-500/15 text-red-400',
                    }[folioBooking.status] ?? 'bg-base text-text-dim'"
                  >
                    {{ BOOKING_STATUS_LABELS[folioBooking.status] ?? folioBooking.status }}
                  </span>
                  <span class="text-sm font-bold text-text-primary">{{ folioBooking.spaceName }}</span>
                  <span class="font-display text-lg font-bold text-text-primary">{{ mxn(folioBooking.totalMxn) }}</span>
                </div>
                <p class="mt-1.5 text-xs text-text-secondary">
                  {{ fmtDate(folioBooking.date) }} · {{ fmtTime(folioBooking) }} ·
                  {{ folioBooking.people }} personas · {{ folioBooking.guests?.name }}
                  <span v-if="folioBooking.guests?.company"> · {{ folioBooking.guests.company }}</span>
                </p>
                <p
                  v-if="folioBooking.guests?.email || folioBooking.guests?.phone"
                  class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-text-dim"
                >
                  <span v-if="folioBooking.guests?.email">{{ folioBooking.guests.email }}</span>
                  <span v-if="folioBooking.guests?.phone">{{ folioBooking.guests.phone }}</span>
                </p>
                <p v-if="folioBooking.notes" class="mt-2 rounded-lg bg-surface px-3 py-1.5 text-[11px] italic text-text-dim">
                  “{{ folioBooking.notes }}”
                </p>
              </div>

              <!-- Acción según estado/fecha de la reserva -->
              <div class="flex shrink-0 items-center">
                <template v-if="folioBooking.status === 'completed'">
                  <span class="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-emerald-400">
                    <ScanLine class="h-4 w-4" />
                    Acceso confirmado{{ folioBooking.checkedInAt ? ` · ${fmtClock(folioBooking.checkedInAt)}` : '' }}
                  </span>
                </template>
                <template v-else-if="folioDateState === 'past'">
                  <span class="rounded-full bg-red-500/15 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-red-400">
                    Reserva vencida - era para el {{ fmtDate(folioBooking.date) }}
                  </span>
                </template>
                <template v-else-if="folioDateState === 'future'">
                  <span class="rounded-full bg-amber-500/15 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-amber-400">
                    Reserva programada - es para el {{ fmtDate(folioBooking.date) }}
                  </span>
                </template>
                <template v-else-if="folioBooking.status === 'cancelled' || folioBooking.status === 'no_show'">
                  <span class="rounded-full bg-red-500/15 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-red-400">
                    {{ folioBooking.status === 'cancelled' ? 'Cancelada' : 'No show' }} - no se puede confirmar
                  </span>
                </template>
                <div v-else class="flex items-center gap-3">
                  <p
                    v-if="folioSlotState === 'upcoming'"
                    class="max-w-48 text-right text-[10px] font-bold leading-tight text-amber-400"
                  >
                    La visita inicia a las {{ folioBooking.startHour }}:00 - confirma solo si el cliente ya llegó.
                  </p>
                  <p
                    v-else-if="folioSlotState === 'passed'"
                    class="max-w-44 text-right text-[10px] font-bold leading-tight text-amber-400"
                  >
                    El horario ya terminó - confirma solo si el cliente sigue en su visita.
                  </p>
                  <button
                    class="flex h-11 cursor-pointer items-center gap-2 rounded-full bg-emerald-500 px-6 text-xs font-black uppercase tracking-widest text-white transition hover:opacity-90 disabled:opacity-50"
                    :disabled="actionBusy"
                    @click="askAccessConfirm"
                  >
                    <ScanLine class="h-4 w-4" />
                    Confirmar acceso
                  </button>
                </div>
              </div>
            </div>
          </div>

          <ScanResultPanel
            v-else-if="lastResult"
            embedded
            :result="lastResult"
            :pending="submitting"
          />

          <div
            v-else
            class="flex flex-1 items-center justify-center rounded-xl border border-dashed border-stroke px-6 py-8 text-center"
          >
            <div>
              <ScanLine class="mx-auto h-6 w-6 text-text-dim" />
              <p class="mt-2 text-xs font-bold text-text-dim">
                Escanea o teclea el código para ver los datos y confirmar el acceso.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Registro de accesos - todo el ancho abajo -->
    <section class="rounded-2xl border border-stroke bg-surface">
      <div class="border-b border-stroke px-5 py-3.5">
        <h2 class="text-xs font-black uppercase tracking-widest text-text-muted">
          Registro de accesos
        </h2>
      </div>
      <div class="p-5">
        <CheckInsList :records="recent" />
      </div>
    </section>

    <!-- Confirmación de acceso -->
    <UModal
      v-model:open="confirmOpen"
      title="Confirmar cambio"
    >
      <template #body>
        <template v-if="pendingAction">
          <p class="font-mono text-sm font-bold tracking-wider text-accent">{{ pendingAction.title }}</p>
          <p class="mt-1 text-xs text-text-secondary">{{ pendingAction.subtitle }}</p>
          <p class="mt-3 text-sm font-bold text-text-primary">
            Vigente
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
            label="Completada"
            :loading="actionBusy"
            color="primary"
            @click="applyPendingAction"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
