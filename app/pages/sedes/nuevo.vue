<script setup lang="ts">
import { ArrowLeft, Plus } from '@lucide/vue';

import type { Branch } from '#shared/types';

const router = useRouter();
const { session } = useAuth();
/// Solo el admin global puede dar de alta nuevas sedes.
const isAdmin = computed(() => session.value?.role === 'ADMIN');

const saving = ref(false);
const formError = ref<string | null>(null);
const confirmModalOpen = ref(false);

const form = ref({
  name: '',
  address: '',
  lat: '',
  lng: '',
  imageUrl: '',
  maxCapacity: 100,
  openTime: '06:00',
  closeTime: '22:00',
  status: 'OPEN' as Branch['status'],
});

function parseCoord(raw: string): number | null {
  const value = Number(raw.trim());
  return raw.trim() !== '' && Number.isFinite(value) ? value : null;
}

const missingFields = computed(() => {
  const f = form.value;
  const missing: string[] = [];
  if (f.name.trim().length < 3) missing.push('nombre (mín. 3 caracteres)');
  if (f.maxCapacity < 1) missing.push('ocupación máxima');
  if (!f.openTime) missing.push('hora de apertura');
  if (!f.closeTime) missing.push('hora de cierre');
  return missing;
});

const confirmDescription = computed(() => {
  const f = form.value;
  return `Se creará la sede "${f.name.trim()}" con ocupación máxima ${f.maxCapacity} y horario ${f.openTime}-${f.closeTime}. ${f.status === 'OPEN' ? 'Quedará abierta al público.' : 'Quedará cerrada hasta que se active.'}`;
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
    const branch = await $api<Branch>('/api/branches', {
      method: 'POST',
      body: {
        ...f,
        name: f.name.trim(),
        address: f.address.trim(),
        lat: parseCoord(f.lat),
        lng: parseCoord(f.lng),
      },
    });
    confirmModalOpen.value = false;
    await navigateTo(`/sedes/${branch.id}`);
  } catch (cause) {
    formError.value =
      cause instanceof Error ? cause.message : 'No se pudo crear la sede';
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  if (!isAdmin.value) {
    await navigateTo('/sedes');
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
      <h1 class="text-xl font-black text-text-primary">Nueva sede</h1>
      <p class="mt-1 text-[11px] text-text-dim">
        Se agregará al catálogo y quedará disponible para asignar salas,
        anfitriones y miembros.
      </p>
    </div>

    <section class="rounded-2xl border border-stroke bg-surface p-5">
      <h2
        class="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-text-primary"
      >
        <span class="h-4 w-1 rounded-full bg-accent" />
        Datos y ubicación
      </h2>
      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Nombre de la sede *
          </span>
          <input
            v-model="form.name"
            type="text"
            placeholder="ej. Metepec Centro"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-dim focus:border-accent"
          />
        </label>
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Dirección
          </span>
          <input
            v-model="form.address"
            type="text"
            placeholder="ej. Av. Estado de México 120, Metepec"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-dim focus:border-accent"
          />
        </label>
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Latitud
          </span>
          <input
            v-model="form.lat"
            type="text"
            inputmode="decimal"
            placeholder="ej. 19.2926"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-dim focus:border-accent"
          />
        </label>
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Longitud
          </span>
          <input
            v-model="form.lng"
            type="text"
            inputmode="decimal"
            placeholder="ej. -99.6572"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-dim focus:border-accent"
          />
        </label>
      </div>
    </section>

    <section class="rounded-2xl border border-stroke bg-surface p-5">
      <h2
        class="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-text-primary"
      >
        <span class="h-4 w-1 rounded-full bg-accent" />
        Imagen de portada
      </h2>
      <p class="mt-1 text-[11px] text-text-dim">
        Fotografía principal de la sucursal que se muestra en las tarjetas del
        panel y la app.
      </p>
      <div class="mt-4">
        <ImagePicker
          v-model="form.imageUrl"
          label="Subir imagen de la sede (opcional)"
          @error="formError = $event"
        />
      </div>
    </section>

    <section class="rounded-2xl border border-stroke bg-surface p-5">
      <h2
        class="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-text-primary"
      >
        <span class="h-4 w-1 rounded-full bg-accent" />
        Capacidad y horario operativo
      </h2>
      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Ocupación máx. *
          </span>
          <input
            v-model.number="form.maxCapacity"
            type="number"
            min="1"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </label>
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Abre *
          </span>
          <input
            v-model="form.openTime"
            type="time"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </label>
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Cierra *
          </span>
          <input
            v-model="form.closeTime"
            type="time"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </label>
      </div>

      <div class="mt-5 flex items-center justify-between border-t border-stroke/50 pt-4">
        <div>
          <span class="block text-xs font-bold text-text-primary">
            Sede abierta al público
          </span>
          <span class="text-[10px] text-text-dim">
            Permite registrar accesos y reservas desde el momento de su creación.
          </span>
        </div>
        <button
          type="button"
          class="relative h-6 w-11 cursor-pointer rounded-full transition"
          :class="
            form.status === 'OPEN'
              ? 'bg-accent'
              : 'bg-base border border-stroke'
          "
          @click="form.status = form.status === 'OPEN' ? 'CLOSED' : 'OPEN'"
        >
          <span
            class="absolute top-0.5 h-5 w-5 rounded-full transition-all"
            :class="
              form.status === 'OPEN'
                ? 'left-[22px] bg-base'
                : 'left-0.5 bg-white'
            "
          />
        </button>
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
      {{ saving ? 'Creando…' : 'Crear sede' }}
    </button>

    <UModal
      v-model:open="confirmModalOpen"
      title="Crear nueva sede"
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
            label="Crear sede"
            icon="i-lucide-plus"
            :loading="saving"
            @click="submit"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
