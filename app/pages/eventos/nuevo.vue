<script setup lang="ts">
import { ArrowLeft, Plus } from '@lucide/vue';

import type { Activity, BookableSpace, Branch, Host } from '#shared/types';

const router = useRouter();
const { session, canEditInBranches } = useAuth();
/// Crear eventos globales en el catálogo: solo admin.
const isAdmin = computed(() => session.value?.role === 'ADMIN');

const branches = ref<Branch[]>([]);
const spaces = ref<BookableSpace[]>([]);
const hosts = ref<Host[]>([]);
const saving = ref(false);
const formError = ref<string | null>(null);
const confirmModalOpen = ref(false);

const form = ref({
  name: '',
  hostId: '',
  branchIds: session.value?.branchId ? [session.value.branchId] : ([] as string[]),
  roomId: '',
  room: '',
  date: new Date().toISOString().slice(0, 10),
  start: '18:00',
  end: '19:30',
  capacity: 25,
});

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function toggleBranch(branchId: string): void {
  const ids = form.value.branchIds;
  const index = ids.indexOf(branchId);
  if (index === -1) ids.push(branchId);
  else ids.splice(index, 1);
}

/// Salas disponibles según las sedes elegidas.
const availableSpaces = computed(() => {
  if (!form.value.branchIds.length) return spaces.value;
  return spaces.value.filter((sp) =>
    sp.branchIds?.some((b) => form.value.branchIds.includes(b)),
  );
});

function selectSpace(sp: BookableSpace): void {
  form.value.roomId = sp.id;
  form.value.room = sp.name;
  form.value.capacity = sp.capacity;
}

const hostItems = computed(() =>
  hosts.value
    .filter(
      (t) => t.branchIds.length === 0 || canEditInBranches(t.branchIds),
    )
    .map((t) => ({ label: `${t.name} · ${t.specialty}`, value: t.id })),
);

function hostName(hostId: string): string {
  return hosts.value.find((t) => t.id === hostId)?.name ?? '-';
}

const missingFields = computed(() => {
  const f = form.value;
  const missing: string[] = [];
  if (f.name.trim().length < 3) missing.push('nombre (mín. 3 caracteres)');
  if (!f.hostId) missing.push('anfitrión');
  if (f.branchIds.length === 0) missing.push('al menos una sede');
  if (!f.room.trim()) missing.push('sala asignada');
  if (f.capacity < 1) missing.push('capacidad');
  if (!f.start) missing.push('hora de inicio');
  if (!f.end) missing.push('hora de fin');
  return missing;
});

const confirmDescription = computed(() => {
  const f = form.value;
  const branchNames = f.branchIds
    .map((id) => branches.value.find((b) => b.id === id)?.name ?? id)
    .join(', ');
  return `Se programará el evento "${f.name.trim()}" (${f.start}-${f.end} · ${hostName(f.hostId)}) en la sala "${f.room}" (${branchNames}) con cupo para ${f.capacity} personas.`;
});

function askSubmit(): void {
  if (missingFields.value.length > 0) {
    formError.value = `Campos obligatorios faltantes: ${missingFields.value.join(', ')}`;
    return;
  }
  formError.value = null;
  confirmModalOpen.value = true;
}

async function submit(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  try {
    const f = form.value;
    const created = await $api<Activity>('/api/activities', {
      method: 'POST',
      body: {
        name: f.name.trim(),
        hostId: f.hostId,
        branchIds: f.branchIds,
        roomId: f.roomId || undefined,
        room: f.room.trim(),
        date: f.date || undefined,
        startMinutes: toMinutes(f.start),
        endMinutes: toMinutes(f.end),
        capacity: Number(f.capacity),
      },
    });
    confirmModalOpen.value = false;
    await navigateTo(`/eventos/${created.id}`);
  } catch (cause: any) {
    formError.value =
      cause?.data?.message ||
      (cause instanceof Error ? cause.message : 'No se pudo crear el evento');
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  if (!isAdmin.value) {
    await navigateTo('/eventos');
    return;
  }
  try {
    const [branchList, hostList, spaceList] = await Promise.all([
      $api<Branch[]>('/api/branches'),
      $api<Host[]>('/api/hosts'),
      $api<BookableSpace[]>('/api/spaces'),
    ]);
    branches.value = branchList;
    hosts.value = hostList;
    spaces.value = spaceList;

    if (form.value.branchIds.length === 0 && branchList.length) {
      form.value.branchIds = [branchList[0]!.id];
    }
    if (!form.value.hostId && hostList.length) {
      form.value.hostId = hostList[0]!.id;
    }
    if (!form.value.room && spaceList.length) {
      form.value.room = spaceList[0]!.name;
      form.value.capacity = spaceList[0]!.capacity;
    }
  } catch {
    branches.value = [];
    hosts.value = [];
    spaces.value = [];
  }
});
</script>

<template>
  <div class="space-y-6">
    <button
      type="button"
      class="inline-flex cursor-pointer items-center gap-2 text-xs font-black uppercase tracking-widest text-text-muted transition hover:text-accent"
      @click="router.back()"
    >
      <ArrowLeft class="h-4 w-4 text-accent" />
      Volver
    </button>

    <div>
      <h1 class="text-xl font-black text-text-primary">Nuevo evento</h1>
      <p class="mt-1 text-[11px] text-text-dim">
        Programa un taller, conferencia o sesión de networking asociada a una
        sala física y sede.
      </p>
    </div>

    <section class="rounded-2xl border border-stroke bg-surface p-5">
      <h2
        class="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-text-primary"
      >
        <span class="h-4 w-1 rounded-full bg-accent" />
        Información del evento
      </h2>
      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Nombre del evento *
          </span>
          <input
            v-model="form.name"
            type="text"
            placeholder="ej. Masterclass de IA para Negocios"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-dim focus:border-accent"
          />
        </label>
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Anfitrión / Ponente *
          </span>
          <USelectMenu
            v-model="form.hostId"
            :items="hostItems"
            value-key="value"
            placeholder="Selecciona un anfitrión…"
            class="mt-1 w-full"
          />
        </label>
      </div>
    </section>

    <section class="rounded-2xl border border-stroke bg-surface p-5">
      <h2
        class="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-text-primary"
      >
        <span class="h-4 w-1 rounded-full bg-accent" />
        Sede y sala asignada
      </h2>
      <div class="mt-4 space-y-4">
        <div class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Sedes donde se imparte *
          </span>
          <div class="mt-1.5 flex flex-wrap gap-2">
            <button
              v-for="branch in branches"
              :key="branch.id"
              type="button"
              class="cursor-pointer rounded-full border px-4 py-1.5 text-xs font-bold transition"
              :class="
                form.branchIds.includes(branch.id)
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-stroke bg-base text-text-dim hover:text-text-muted'
              "
              @click="toggleBranch(branch.id)"
            >
              {{ branch.name }}
            </button>
          </div>
        </div>

        <div class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Sala física de la sede *
          </span>
          <div class="mt-1.5 flex flex-wrap gap-2">
            <button
              v-for="sp in availableSpaces"
              :key="sp.id"
              type="button"
              class="cursor-pointer rounded-full border px-4 py-1.5 text-xs font-bold transition"
              :class="
                form.room === sp.name
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-stroke bg-base text-text-dim hover:text-text-muted'
              "
              @click="selectSpace(sp)"
            >
              {{ sp.name }}
              <span class="ml-1 text-[10px] opacity-75">
                ({{ sp.capacity }} pers.)
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="rounded-2xl border border-stroke bg-surface p-5">
      <h2
        class="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-text-primary"
      >
        <span class="h-4 w-1 rounded-full bg-accent" />
        Horario y cupo
      </h2>
      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Fecha *
          </span>
          <input
            v-model="form.date"
            type="date"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </label>
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Hora de inicio *
          </span>
          <input
            v-model="form.start"
            type="time"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </label>
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Hora de fin *
          </span>
          <input
            v-model="form.end"
            type="time"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </label>
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Cupo máximo (personas) *
          </span>
          <input
            v-model.number="form.capacity"
            type="number"
            min="1"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </label>
      </div>
    </section>

    <p v-if="formError" class="text-[11px] font-bold text-red-400">
      {{ formError }}
    </p>

    <button
      class="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-accent text-xs font-black text-base transition hover:opacity-90 disabled:opacity-50"
      :disabled="saving"
      @click="askSubmit"
    >
      <Plus class="h-4 w-4" />
      {{ saving ? 'Creando…' : 'Crear evento' }}
    </button>

    <UModal
      v-model:open="confirmModalOpen"
      title="Crear nuevo evento"
      :description="confirmDescription"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="outline"
            @click="confirmModalOpen = false"
          />
          <UButton
            label="Crear evento"
            icon="i-lucide-plus"
            :loading="saving"
            @click="submit"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
