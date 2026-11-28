<script setup lang="ts">
import {
  doc,
  onSnapshot,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCopy,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  Save,
  Ticket,
  User,
  XCircle,
} from '@lucide/vue';

import type { SpaceBooking, TourRequest } from '#shared/types';

const route = useRoute();
const router = useRouter();
const { db } = useFirebase();
const { session } = useAuth();
const toast = useToast();

const kind = computed<'reservas' | 'tours'>(() =>
  route.params.kind === 'tours' ? 'tours' : 'reservas',
);
const docId = computed(() => String(route.params.id ?? ''));

const booking = ref<SpaceBooking | null>(null);
const tour = ref<TourRequest | null>(null);
const loading = ref(true);
const notFound = ref(false);
const saving = ref(false);
const notesDraft = ref('');
const notesDirty = ref(false);

/// Datos operativos editables para confirmar antes de cambiar de estatus
const todayKey = new Date().toLocaleDateString('en-CA', {
  timeZone: 'America/Mexico_City',
});

const tourForm = reactive({
  date: '',
  time: '10:00',
  people: 1,
  email: '',
  phone: '',
});
const tourFormDirty = ref(false);

const bookingForm = reactive({
  date: '',
  mode: 'hour' as 'hour' | 'day',
  startHour: 9,
  endHour: 11,
  people: 1,
});
const bookingFormDirty = ref(false);

const TOUR_TIME_SLOTS = [
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '12:30',
  '13:00',
  '13:30',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '18:30',
];
const BOOKING_HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7:00 a 20:00

const pendingStatus = ref<{ value: string; label: string; description: string } | null>(null);
const statusModalOpen = ref(false);
const notesModalOpen = ref(false);

let unsub: Unsubscribe | null = null;

const BOOKING_STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  pending: {
    label: 'Por confirmar',
    cls: 'border-amber-400/35 bg-amber-400/15 text-amber-400',
    dot: 'bg-amber-400',
  },
  confirmed: {
    label: 'Vigente',
    cls: 'border-sky-400/35 bg-sky-400/15 text-sky-400',
    dot: 'bg-sky-400',
  },
  completed: {
    label: 'Completada',
    cls: 'border-emerald-400/35 bg-emerald-400/15 text-emerald-400',
    dot: 'bg-emerald-400',
  },
  no_show: {
    label: 'No show',
    cls: 'border-amber-400/35 bg-amber-400/15 text-amber-400',
    dot: 'bg-amber-400',
  },
  cancelled: {
    label: 'Cancelada',
    cls: 'border-red-400/35 bg-red-400/15 text-red-400',
    dot: 'bg-red-400',
  },
};

const TOUR_STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  new: {
    label: 'Pendiente de contacto',
    cls: 'border-amber-400/35 bg-amber-400/15 text-amber-400',
    dot: 'bg-amber-400',
  },
  contacted: {
    label: 'Contactado',
    cls: 'border-sky-400/35 bg-sky-400/15 text-sky-400',
    dot: 'bg-sky-400',
  },
  done: {
    label: 'Tour agendado',
    cls: 'border-emerald-400/35 bg-emerald-400/15 text-emerald-400',
    dot: 'bg-emerald-400',
  },
  cancelled: {
    label: 'Cancelado',
    cls: 'border-red-400/35 bg-red-400/15 text-red-400',
    dot: 'bg-red-400',
  },
};

function subscribe(): void {
  unsub?.();
  if (!db || !docId.value) {
    loading.value = false;
    notFound.value = true;
    return;
  }
  loading.value = true;
  notFound.value = false;

  const col = kind.value === 'tours' ? 'tour_requests' : 'space_bookings';
  unsub = onSnapshot(
    doc(db, col, docId.value),
    (snap) => {
      if (!snap.exists()) {
        booking.value = null;
        tour.value = null;
        notFound.value = true;
        loading.value = false;
        return;
      }
      const d = snap.data()!;
      if (kind.value === 'tours') {
        tour.value = {
          id: snap.id,
          folio: d.folio ?? snap.id,
          name: d.name ?? '',
          company: d.company ?? null,
          email: d.email ?? '',
          phone: d.phone ?? '',
          preferredDate: d.preferred_date ?? null,
          people: d.people ?? 1,
          interest: d.interest ?? null,
          message: d.message ?? null,
          privacyAccepted: d.privacy_accepted === true,
          status: d.status ?? 'new',
          createdAt: d.created_at?.toMillis?.() ?? 0,
        };
        if (!tourFormDirty.value) {
          tourForm.date = String(d.preferred_date ?? '');
          tourForm.time = String(d.confirmed_time ?? '10:00');
          tourForm.people = Number(d.people ?? 1) || 1;
          tourForm.email = String(d.email ?? '');
          tourForm.phone = String(d.phone ?? '');
        }
        if (!notesDirty.value) notesDraft.value = String(d.notes ?? '');
      } else {
        booking.value = {
          id: snap.id,
          folio: d.folio ?? snap.id,
          spaceId: d.space_id ?? '',
          spaceName: d.space_name ?? '',
          date: d.date ?? '',
          mode: d.mode === 'day' ? 'day' : 'hour',
          startHour: d.start_hour ?? null,
          endHour: d.end_hour ?? null,
          guests: d.guests ?? { name: '', email: '', phone: null, company: null },
          people: d.people ?? 1,
          totalMxn: d.total_mxn ?? 0,
          status: d.status ?? 'confirmed',
          source: d.source ?? 'web',
          notes: d.notes ?? null,
          checkedInAt: d.checked_in_at?.toMillis?.() ?? null,
          checkedInBy: d.checked_in_by ?? null,
          createdAt: d.created_at?.toMillis?.() ?? 0,
        };
        if (!bookingFormDirty.value) {
          bookingForm.date = String(d.date ?? '');
          bookingForm.mode = d.mode === 'day' ? 'day' : 'hour';
          bookingForm.startHour = Number(d.start_hour ?? 9);
          bookingForm.endHour = Number(d.end_hour ?? 11);
          bookingForm.people = Number(d.people ?? 1) || 1;
        }
        if (!notesDirty.value) notesDraft.value = String(d.notes ?? '');
      }
      loading.value = false;
    },
    () => {
      loading.value = false;
      notFound.value = true;
    },
  );
}

onMounted(subscribe);
watch([kind, docId], () => {
  tourFormDirty.value = false;
  bookingFormDirty.value = false;
  notesDirty.value = false;
  subscribe();
});
onBeforeUnmount(() => unsub?.());

const contactName = computed(() =>
  kind.value === 'tours' ? tour.value?.name || '-' : booking.value?.guests?.name || '-',
);
const contactEmail = computed(() =>
  kind.value === 'tours' ? tourForm.email || tour.value?.email || '' : booking.value?.guests?.email || '',
);
const contactPhone = computed(() =>
  kind.value === 'tours' ? tourForm.phone || tour.value?.phone || '' : booking.value?.guests?.phone || '',
);
const contactCompany = computed(() =>
  kind.value === 'tours' ? tour.value?.company || null : booking.value?.guests?.company || null,
);
const folio = computed(() =>
  kind.value === 'tours' ? tour.value?.folio || '' : booking.value?.folio || '',
);

const bookingLocked = computed(
  () =>
    kind.value === 'reservas' &&
    booking.value?.status === 'completed' &&
    session.value?.role === 'RECEPTIONIST',
);

/// Reglas de validación para permitir confirmar tour o reserva
const tourConfirmationError = computed(() => {
  if (kind.value !== 'tours') return '';
  if (!tourForm.date) return 'Selecciona una fecha de visita antes de confirmar el tour.';
  if (tourForm.date < todayKey) return 'La fecha del tour no puede ser anterior a hoy.';
  if (!tourForm.time) return 'Selecciona una hora confirmada para la visita.';
  if (!tourForm.phone.trim() && !tourForm.email.trim()) {
    return 'Se requiere al menos un teléfono o correo para confirmar.';
  }
  return '';
});

const bookingConfirmationError = computed(() => {
  if (kind.value !== 'reservas') return '';
  if (!bookingForm.date) return 'Selecciona la fecha de la reserva.';
  if (bookingForm.date < todayKey) return 'La fecha de la reserva no puede ser anterior a hoy.';
  if (bookingForm.mode === 'hour' && bookingForm.endHour <= bookingForm.startHour) {
    return 'La hora de fin debe ser posterior a la hora de inicio.';
  }
  if (bookingForm.people < 1) return 'Indica al menos 1 asistente.';
  return '';
});

const mxn = (n: number) => '$' + (n || 0).toLocaleString('es-MX');
const fmtDate = (d?: string | null) =>
  d
    ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'Fecha por definir';
const fmtTime = () =>
  bookingForm.mode === 'day'
    ? 'Día completo (7:00 - 20:00)'
    : `${bookingForm.startHour}:00 - ${bookingForm.endHour}:00`;
const fmtTimestamp = (ms?: number | null) =>
  ms
    ? new Date(ms).toLocaleString('es-MX', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

const whatsappUrl = computed(() => {
  const digits = contactPhone.value.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const full = digits.length === 10 ? `52${digits}` : digits;
  const text =
    kind.value === 'tours'
      ? `Hola ${contactName.value}, te saludamos de COW-HUB Metepec respecto a tu solicitud de tour (${folio.value}) para ${fmtDate(tourForm.date)}${tourForm.time ? ` a las ${tourForm.time}` : ''}. ¿Nos confirmas si te queda bien ese horario?`
      : `Hola ${contactName.value}, te confirmamos de COW-HUB Metepec tu reserva ${folio.value} en ${booking.value?.spaceName} el ${fmtDate(bookingForm.date)} (${fmtTime()}). ¡Te esperamos en Paseo San Isidro 111!`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
});

const contactScript = computed(() =>
  kind.value === 'tours'
    ? `Hola ${contactName.value}, te llamamos de recepción de COW-HUB Metepec por tu solicitud de recorrido (${folio.value}). Tenemos contemplado ${fmtDate(tourForm.date)} a las ${tourForm.time} (${tourForm.people} pers.). ¿Te confirmamos ese horario?`
    : `Hola ${contactName.value}, te contactamos de recepción de COW-HUB Metepec para confirmar tu reserva ${folio.value} en ${booking.value?.spaceName} el ${fmtDate(bookingForm.date)} (${fmtTime()}).`,
);

async function copyScript(): Promise<void> {
  try {
    await navigator.clipboard.writeText(contactScript.value);
    toast.add({ title: 'Guion copiado al portapapeles', color: 'success' });
  } catch {
    toast.add({ title: 'No se pudo copiar', color: 'error' });
  }
}

function askStatus(value: string, label: string, description: string): void {
  if (kind.value === 'tours' && value === 'done' && tourConfirmationError.value) {
    toast.add({ title: tourConfirmationError.value, color: 'warning' });
    return;
  }
  if (kind.value === 'reservas' && value === 'confirmed' && bookingConfirmationError.value) {
    toast.add({ title: bookingConfirmationError.value, color: 'warning' });
    return;
  }
  pendingStatus.value = { value, label, description };
  statusModalOpen.value = true;
}

async function confirmStatusChange(): Promise<void> {
  if (!db || !pendingStatus.value || saving.value) return;
  saving.value = true;
  try {
    const col = kind.value === 'tours' ? 'tour_requests' : 'space_bookings';
    const patch: Record<string, unknown> = { status: pendingStatus.value.value };

    if (kind.value === 'tours') {
      patch.preferred_date = tourForm.date || null;
      patch.confirmed_time = tourForm.time || null;
      patch.people = Math.max(1, Number(tourForm.people) || 1);
      if (tourForm.email.trim()) patch.email = tourForm.email.trim().toLowerCase();
      if (tourForm.phone.trim()) patch.phone = tourForm.phone.trim();
    } else {
      patch.date = bookingForm.date;
      patch.mode = bookingForm.mode;
      patch.start_hour = bookingForm.mode === 'hour' ? bookingForm.startHour : null;
      patch.end_hour = bookingForm.mode === 'hour' ? bookingForm.endHour : null;
      patch.people = Math.max(1, Number(bookingForm.people) || 1);
      if (
        booking.value?.status === 'completed' &&
        pendingStatus.value.value !== 'completed'
      ) {
        patch.checked_in_at = null;
        patch.checked_in_by = null;
      }
    }

    await updateDoc(doc(db, col, docId.value), patch);
    tourFormDirty.value = false;
    bookingFormDirty.value = false;

    void $api('/api/agenda-web/notify-status', {
      method: 'POST',
      body: {
        kind: kind.value === 'tours' ? 'tour' : 'booking',
        id: docId.value,
        status: pendingStatus.value.value,
      },
    }).catch(() => undefined);

    toast.add({
      title: `Estado actualizado a "${pendingStatus.value.label}"`,
      color: 'success',
    });
    statusModalOpen.value = false;
    pendingStatus.value = null;
  } catch {
    toast.add({ title: 'No se pudo actualizar el estado', color: 'error' });
  } finally {
    saving.value = false;
  }
}

async function confirmSaveNotes(): Promise<void> {
  if (!db || saving.value) return;
  saving.value = true;
  try {
    const col = kind.value === 'tours' ? 'tour_requests' : 'space_bookings';
    await updateDoc(doc(db, col, docId.value), {
      notes: notesDraft.value.trim() || null,
    });
    notesDirty.value = false;
    notesModalOpen.value = false;
    toast.add({ title: 'Notas de recepción guardadas', color: 'success' });
  } catch {
    toast.add({ title: 'No se pudieron guardar las notas', color: 'error' });
  } finally {
    saving.value = false;
  }
}

const currentStatusMeta = computed(() => {
  if (kind.value === 'tours') {
    const st = tour.value?.status ?? 'new';
    return TOUR_STATUS_META[st] ?? { label: st, cls: 'border-stroke bg-base text-text-muted', dot: 'bg-text-dim' };
  }
  const st = booking.value?.status ?? 'pending';
  return BOOKING_STATUS_META[st] ?? { label: st, cls: 'border-stroke bg-base text-text-muted', dot: 'bg-text-dim' };
});

const tourStepIndex = computed(() => {
  const st = tour.value?.status;
  if (st === 'new') return 0;
  if (st === 'contacted') return 1;
  if (st === 'done') return 2;
  return -1;
});

const bookingStepIndex = computed(() => {
  const st = booking.value?.status;
  if (st === 'pending') return 0;
  if (st === 'confirmed') return 1;
  if (st === 'completed') return 2;
  return -1;
});
</script>

<template>
  <div class="space-y-6">
    <!-- Volver -->
    <button
      type="button"
      class="inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-text-muted transition hover:text-text-primary"
      @click="router.back()"
    >
      <ArrowLeft class="h-3.5 w-3.5" />
      Volver
    </button>

    <div
      v-if="loading"
      class="rounded-2xl border border-stroke bg-surface p-12 text-center text-xs text-text-dim"
    >
      Cargando detalle...
    </div>

    <div
      v-else-if="notFound"
      class="rounded-2xl border border-stroke bg-surface p-12 text-center"
    >
      <p class="text-sm font-bold text-text-primary">Registro no encontrado</p>
      <p class="mt-1 text-xs text-text-dim">
        El folio solicitado no existe o fue eliminado.
      </p>
    </div>

    <template v-else>
      <!-- Cabecera estándar de detalle -->
      <div class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stroke bg-surface p-5">
        <div class="flex items-center gap-4">
          <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-stroke bg-base text-accent">
            <Ticket v-if="kind === 'tours'" class="h-6 w-6" />
            <CalendarClock v-else class="h-6 w-6" />
          </div>
          <div>
            <div class="flex flex-wrap items-center gap-2.5">
              <h1 class="text-xl font-black text-text-primary">
                {{ folio }}
              </h1>
              <span
                class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                :class="currentStatusMeta.cls"
              >
                <span class="h-1.5 w-1.5 rounded-full" :class="currentStatusMeta.dot" />
                {{ currentStatusMeta.label }}
              </span>
            </div>
            <p class="mt-1 text-xs text-text-dim">
              {{ kind === 'tours' ? 'Solicitud de tour' : booking?.spaceName }} · {{ contactName }} · Registrado {{ fmtTimestamp(kind === 'tours' ? tour?.createdAt : booking?.createdAt) }}
            </p>
          </div>
        </div>

        <NuxtLink
          v-if="kind === 'reservas' && booking?.status === 'confirmed'"
          to="/recepcion"
          class="flex shrink-0 cursor-pointer items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-xs font-semibold text-base transition hover:opacity-90"
        >
          <CheckCircle2 class="h-4 w-4" />
          Ir a confirmar acceso en Recepción
        </NuxtLink>
      </div>

      <!-- Progreso guiado de estatus -->
      <section class="rounded-2xl border border-stroke bg-surface p-5">
        <h2 class="mb-4 text-xs font-black uppercase tracking-widest text-text-primary">
          Flujo de atención y confirmación
        </h2>

        <div class="grid gap-3 sm:grid-cols-3">
          <template v-if="kind === 'tours'">
            <div
              v-for="(step, idx) in [
                { title: '1. Pendiente de contacto', desc: 'Revisar datos y llamar o enviar WhatsApp' },
                { title: '2. Contactado', desc: 'Acordar fecha, hora y número de asistentes' },
                { title: '3. Tour agendado', desc: 'Visita confirmada con fecha y hora en agenda' },
              ]"
              :key="step.title"
              class="rounded-xl border p-3.5 transition"
              :class="
                tourStepIndex === idx
                  ? 'border-accent bg-accent/10'
                  : tourStepIndex > idx
                    ? 'border-emerald-400/35 bg-emerald-400/10'
                    : 'border-stroke bg-base'
              "
            >
              <p class="text-xs font-bold text-text-primary">{{ step.title }}</p>
              <p class="mt-1 text-[11px] text-text-dim">{{ step.desc }}</p>
            </div>
          </template>
          <template v-else>
            <div
              v-for="(step, idx) in [
                { title: '1. Por confirmar', desc: 'Validar fecha, horario y disponibilidad con cliente' },
                { title: '2. Vigente', desc: 'Reserva confirmada lista para recibir al cliente' },
                { title: '3. Completada', desc: 'Acceso validado con folio en Recepción' },
              ]"
              :key="step.title"
              class="rounded-xl border p-3.5 transition"
              :class="
                bookingStepIndex === idx
                  ? 'border-accent bg-accent/10'
                  : bookingStepIndex > idx
                    ? 'border-emerald-400/35 bg-emerald-400/10'
                    : 'border-stroke bg-base'
              "
            >
              <p class="text-xs font-bold text-text-primary">{{ step.title }}</p>
              <p class="mt-1 text-[11px] text-text-dim">{{ step.desc }}</p>
            </div>
          </template>
        </div>
      </section>

      <div class="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <!-- Columna izquierda: Contacto + Datos editables de fecha/horario -->
        <div class="space-y-5">
          <!-- Guía de contacto rápido -->
          <section class="space-y-4 rounded-2xl border border-stroke bg-surface p-5">
            <h2 class="text-xs font-black uppercase tracking-widest text-text-primary">
              Guía de contacto directo
            </h2>

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="rounded-xl border border-stroke bg-base p-3.5">
                <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">Solicitante</p>
                <p class="mt-1 flex items-center gap-1.5 text-sm font-bold text-text-primary">
                  <User class="h-3.5 w-3.5 text-accent" />
                  {{ contactName }}
                </p>
                <p v-if="contactCompany" class="mt-0.5 text-xs text-text-dim">
                  {{ contactCompany }}
                </p>
              </div>

              <div class="rounded-xl border border-stroke bg-base p-3.5">
                <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">Canales de contacto</p>
                <p v-if="contactPhone" class="mt-1 flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                  <Phone class="h-3.5 w-3.5 text-accent" />
                  {{ contactPhone }}
                </p>
                <p v-if="contactEmail" class="mt-1 flex items-center gap-1.5 truncate text-xs text-text-secondary">
                  <Mail class="h-3.5 w-3.5 text-accent" />
                  {{ contactEmail }}
                </p>
              </div>
            </div>

            <!-- Botones rápidos de contacto -->
            <div class="flex flex-wrap items-center gap-2.5">
              <a
                v-if="contactPhone"
                :href="`tel:${contactPhone}`"
                class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-stroke bg-base px-4 py-2 text-xs font-bold text-text-primary transition hover:border-accent hover:text-accent"
              >
                <Phone class="h-3.5 w-3.5" />
                Llamar ahora
              </a>
              <a
                v-if="whatsappUrl"
                :href="whatsappUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/15 px-4 py-2 text-xs font-bold text-emerald-400 transition hover:bg-emerald-400/25"
              >
                <MessageSquare class="h-3.5 w-3.5" />
                Enviar WhatsApp
              </a>
              <a
                v-if="contactEmail"
                :href="`mailto:${contactEmail}?subject=${encodeURIComponent(`Confirmación COW-HUB (${folio})`)}`"
                class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-stroke bg-base px-4 py-2 text-xs font-bold text-text-primary transition hover:border-accent hover:text-accent"
              >
                <Mail class="h-3.5 w-3.5" />
                Enviar correo
              </a>
              <button
                type="button"
                class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-stroke bg-base px-4 py-2 text-xs font-bold text-text-muted transition hover:border-accent hover:text-text-primary"
                @click="copyScript"
              >
                <ClipboardCopy class="h-3.5 w-3.5" />
                Copiar guion
              </button>
            </div>

            <div class="rounded-xl border border-stroke bg-base/70 p-3.5">
              <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
                Guion sugerido para recepción
              </p>
              <p class="mt-1.5 text-xs leading-relaxed text-text-secondary">
                "{{ contactScript }}"
              </p>
            </div>
          </section>

          <!-- Datos de fecha y horario a confirmar -->
          <section class="space-y-4 rounded-2xl border border-stroke bg-surface p-5">
            <h2 class="text-xs font-black uppercase tracking-widest text-text-primary">
              {{ kind === 'tours' ? 'Fecha, horario y datos del tour' : 'Fecha, horario y datos de la reserva' }}
            </h2>

            <!-- Editor de Tour -->
            <div v-if="kind === 'tours' && tour" class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="block text-[10px] font-bold uppercase tracking-widest text-text-dim">
                  Fecha de visita *
                </label>
                <DatePickerInput
                  v-model="tourForm.date"
                  :min="todayKey"
                  class="mt-1.5"
                  @update:model-value="tourFormDirty = true"
                />
              </div>

              <div>
                <label class="block text-[10px] font-bold uppercase tracking-widest text-text-dim">
                  Hora confirmada *
                </label>
                <USelect
                  v-model="tourForm.time"
                  :items="TOUR_TIME_SLOTS.map((slot) => ({ label: `${slot} hrs`, value: slot }))"
                  size="md"
                  class="mt-1.5 w-full"
                  :ui="{ base: 'h-10 rounded-xl border border-stroke bg-base px-3.5 text-xs font-semibold text-text-primary ring-0 shadow-none' }"
                  @update:model-value="tourFormDirty = true"
                />
              </div>

              <div>
                <label class="block text-[10px] font-bold uppercase tracking-widest text-text-dim">
                  Asistentes
                </label>
                <input
                  v-model.number="tourForm.people"
                  type="number"
                  min="1"
                  max="10"
                  class="mt-1.5 w-full rounded-xl border border-stroke bg-base px-3.5 py-2.5 text-xs font-semibold text-text-primary outline-none transition focus:border-accent"
                  @input="tourFormDirty = true"
                />
              </div>

              <div>
                <label class="block text-[10px] font-bold uppercase tracking-widest text-text-dim">
                  Teléfono / WhatsApp
                </label>
                <input
                  v-model="tourForm.phone"
                  type="tel"
                  placeholder="722 000 0000"
                  class="mt-1.5 w-full rounded-xl border border-stroke bg-base px-3.5 py-2.5 text-xs font-semibold text-text-primary outline-none transition focus:border-accent"
                  @input="tourFormDirty = true"
                />
              </div>

              <div class="sm:col-span-2">
                <label class="block text-[10px] font-bold uppercase tracking-widest text-text-dim">
                  Correo electrónico (para envío de confirmación)
                </label>
                <input
                  v-model="tourForm.email"
                  type="email"
                  placeholder="cliente@empresa.com"
                  class="mt-1.5 w-full rounded-xl border border-stroke bg-base px-3.5 py-2.5 text-xs font-semibold text-text-primary outline-none transition focus:border-accent"
                  @input="tourFormDirty = true"
                />
              </div>

              <div v-if="tour.message" class="rounded-xl border border-stroke bg-base p-3.5 sm:col-span-2">
                <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">Mensaje del cliente</p>
                <p class="mt-1 text-xs leading-relaxed text-text-secondary">
                  "{{ tour.message }}"
                </p>
              </div>
            </div>

            <!-- Editor de Reserva -->
            <div v-else-if="booking" class="grid gap-4 sm:grid-cols-2">
              <div class="rounded-xl border border-stroke bg-base p-3.5 sm:col-span-2 flex items-center justify-between gap-3">
                <div>
                  <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">Espacio reservado</p>
                  <p class="mt-1 flex items-center gap-1.5 text-xs font-bold text-text-primary">
                    <Building2 class="h-3.5 w-3.5 text-accent" />
                    {{ booking.spaceName }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">Total estimado</p>
                  <p class="mt-0.5 text-base font-black text-text-primary">{{ mxn(booking.totalMxn) }}</p>
                </div>
              </div>

              <div>
                <label class="block text-[10px] font-bold uppercase tracking-widest text-text-dim">
                  Fecha de reserva *
                </label>
                <DatePickerInput
                  v-model="bookingForm.date"
                  :min="todayKey"
                  :disabled="bookingLocked"
                  class="mt-1.5"
                  @update:model-value="bookingFormDirty = true"
                />
              </div>

              <div>
                <label class="block text-[10px] font-bold uppercase tracking-widest text-text-dim">
                  Modalidad
                </label>
                <USelect
                  v-model="bookingForm.mode"
                  :disabled="bookingLocked"
                  :items="[
                    { label: 'Por hora', value: 'hour' },
                    { label: 'Día completo', value: 'day' },
                  ]"
                  size="md"
                  class="mt-1.5 w-full"
                  :ui="{ base: 'h-10 rounded-xl border border-stroke bg-base px-3.5 text-xs font-semibold text-text-primary ring-0 shadow-none' }"
                  @update:model-value="bookingFormDirty = true"
                />
              </div>

              <template v-if="bookingForm.mode === 'hour'">
                <div>
                  <label class="block text-[10px] font-bold uppercase tracking-widest text-text-dim">
                    Hora de inicio *
                  </label>
                  <USelect
                    v-model="bookingForm.startHour"
                    :disabled="bookingLocked"
                    :items="BOOKING_HOURS.slice(0, -1).map((h) => ({ label: `${String(h).padStart(2, '0')}:00`, value: h }))"
                    size="md"
                    class="mt-1.5 w-full"
                    :ui="{ base: 'h-10 rounded-xl border border-stroke bg-base px-3.5 text-xs font-semibold text-text-primary ring-0 shadow-none' }"
                    @update:model-value="bookingFormDirty = true"
                  />
                </div>

                <div>
                  <label class="block text-[10px] font-bold uppercase tracking-widest text-text-dim">
                    Hora de fin *
                  </label>
                  <USelect
                    v-model="bookingForm.endHour"
                    :disabled="bookingLocked"
                    :items="BOOKING_HOURS.slice(1).map((h) => ({ label: `${String(h).padStart(2, '0')}:00`, value: h }))"
                    size="md"
                    class="mt-1.5 w-full"
                    :ui="{ base: 'h-10 rounded-xl border border-stroke bg-base px-3.5 text-xs font-semibold text-text-primary ring-0 shadow-none' }"
                    @update:model-value="bookingFormDirty = true"
                  />
                </div>
              </template>

              <div>
                <label class="block text-[10px] font-bold uppercase tracking-widest text-text-dim">
                  Asistentes
                </label>
                <input
                  v-model.number="bookingForm.people"
                  type="number"
                  min="1"
                  max="60"
                  :disabled="bookingLocked"
                  class="mt-1.5 w-full rounded-xl border border-stroke bg-base px-3.5 py-2.5 text-xs font-semibold text-text-primary outline-none transition focus:border-accent disabled:opacity-60"
                  @input="bookingFormDirty = true"
                />
              </div>

              <div v-if="booking.checkedInAt" class="rounded-xl border border-emerald-400/35 bg-emerald-400/10 p-3.5">
                <p class="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Acceso confirmado</p>
                <p class="mt-1 text-xs font-semibold text-text-primary">
                  {{ fmtTimestamp(booking.checkedInAt) }}
                </p>
              </div>
            </div>
          </section>
        </div>

        <!-- Columna derecha: Acciones de estado + Notas internas -->
        <div class="space-y-5">
          <!-- Acciones guiadas de confirmación -->
          <section class="space-y-4 rounded-2xl border border-stroke bg-surface p-5">
            <h2 class="text-xs font-black uppercase tracking-widest text-text-primary">
              Acciones de confirmación
            </h2>

            <div
              v-if="bookingLocked"
              class="flex items-center gap-2 rounded-xl border border-stroke bg-base p-4 text-xs font-bold text-text-dim"
            >
              <Lock class="h-4 w-4 shrink-0" />
              Esta reserva ya tiene acceso confirmado. Solo un gerente o admin puede cambiar su estado.
            </div>

            <!-- Acciones para Tours -->
            <div v-else-if="kind === 'tours' && tour" class="space-y-2.5">
              <p
                v-if="tourConfirmationError"
                class="rounded-xl border border-amber-400/35 bg-amber-400/10 px-3.5 py-2.5 text-[11px] font-semibold text-amber-400"
              >
                {{ tourConfirmationError }}
              </p>

              <button
                v-if="tour.status === 'new'"
                type="button"
                class="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-accent text-xs font-black text-base transition hover:opacity-90"
                @click="askStatus('contacted', 'Contactado', 'Se guardarán los datos actualizados y se registrará que recepción ya contactó al solicitante.')"
              >
                <Phone class="h-4 w-4" />
                Marcar como contactado
              </button>

              <button
                v-if="tour.status === 'new' || tour.status === 'contacted'"
                type="button"
                :disabled="Boolean(tourConfirmationError)"
                class="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/15 text-xs font-black text-emerald-400 transition hover:bg-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-45"
                @click="askStatus('done', 'Tour agendado', `Se confirmará el tour para el ${fmtDate(tourForm.date)} a las ${tourForm.time} (${tourForm.people} pers.) y se enviará aviso al cliente.`)"
              >
                <CheckCircle2 class="h-4 w-4" />
                Confirmar tour agendado
              </button>

              <button
                v-if="tour.status !== 'new'"
                type="button"
                class="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-stroke bg-base text-xs font-bold text-text-secondary transition hover:border-accent hover:text-text-primary"
                @click="askStatus('new', 'Pendiente de contacto', 'La solicitud volverá a la cola de tours pendientes por contactar.')"
              >
                Volver a pendiente de contacto
              </button>

              <button
                v-if="tour.status !== 'cancelled'"
                type="button"
                class="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-red-400/40 bg-red-400/10 text-xs font-bold text-red-400 transition hover:bg-red-400/20"
                @click="askStatus('cancelled', 'Cancelado', 'Se marcará esta solicitud de tour como cancelada.')"
              >
                <XCircle class="h-4 w-4" />
                Cancelar solicitud
              </button>
            </div>

            <!-- Acciones para Reservas -->
            <div v-else-if="booking" class="space-y-2.5">
              <p
                v-if="bookingConfirmationError"
                class="rounded-xl border border-amber-400/35 bg-amber-400/10 px-3.5 py-2.5 text-[11px] font-semibold text-amber-400"
              >
                {{ bookingConfirmationError }}
              </p>

              <button
                v-if="booking.status !== 'confirmed' || bookingFormDirty"
                type="button"
                :disabled="Boolean(bookingConfirmationError)"
                class="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-accent text-xs font-black text-base transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                @click="askStatus('confirmed', 'Vigente', `Se confirmará la reserva para el ${fmtDate(bookingForm.date)} (${fmtTime()}, ${bookingForm.people} pers.).`)"
              >
                <CheckCircle2 class="h-4 w-4" />
                {{ booking.status === 'confirmed' ? 'Guardar fecha/horario confirmado' : 'Confirmar reserva (Vigente)' }}
              </button>

              <button
                v-if="booking.status === 'confirmed'"
                type="button"
                class="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 text-xs font-bold text-amber-400 transition hover:bg-amber-400/20"
                @click="askStatus('no_show', 'No show', 'Se marcará que el cliente no se presentó a la reserva.')"
              >
                Marcar como No show
              </button>

              <button
                v-if="booking.status !== 'cancelled'"
                type="button"
                class="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-red-400/40 bg-red-400/10 text-xs font-bold text-red-400 transition hover:bg-red-400/20"
                @click="askStatus('cancelled', 'Cancelada', 'Se cancelará esta reserva y el horario quedará liberado en el sitio web.')"
              >
                <XCircle class="h-4 w-4" />
                Cancelar reserva
              </button>
            </div>
          </section>

          <!-- Notas internas de seguimiento -->
          <section class="space-y-3 rounded-2xl border border-stroke bg-surface p-5">
            <h2 class="text-xs font-black uppercase tracking-widest text-text-primary">
              Notas internas de recepción
            </h2>

            <textarea
              v-model="notesDraft"
              rows="4"
              placeholder="Ej. Confirmado por WhatsApp a las 11:00 am, llega con 2 socios..."
              class="w-full rounded-xl border border-stroke bg-base px-3.5 py-2.5 text-xs leading-relaxed text-text-primary outline-none transition focus:border-accent"
              @input="notesDirty = true"
            />

            <button
              type="button"
              :disabled="!notesDirty || saving"
              class="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-stroke bg-base text-xs font-bold text-text-primary transition hover:border-accent hover:text-accent disabled:opacity-40"
              @click="notesModalOpen = true"
            >
              <Save class="h-3.5 w-3.5" />
              Guardar notas
            </button>
          </section>
        </div>
      </div>
    </template>

    <!-- Confirmación cambio de estado -->
    <UModal
      v-model:open="statusModalOpen"
      :title="`Cambiar estado a ${pendingStatus?.label ?? ''}`"
      :description="pendingStatus?.description ?? ''"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="outline"
            @click="statusModalOpen = false"
          />
          <UButton
            label="Confirmar cambio"
            color="primary"
            :loading="saving"
            @click="confirmStatusChange"
          />
        </div>
      </template>
    </UModal>

    <!-- Confirmación notas -->
    <UModal
      v-model:open="notesModalOpen"
      title="Guardar notas de recepción"
      description="Las notas quedarán visibles para todo el equipo de recepción y gerencia."
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="outline"
            @click="notesModalOpen = false"
          />
          <UButton
            label="Guardar notas"
            color="primary"
            :loading="saving"
            @click="confirmSaveNotes"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
