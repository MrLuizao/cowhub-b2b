<script setup lang="ts">
import { ArrowLeft, Plus, Sparkles } from '@lucide/vue';

import type { BookableSpace, Branch } from '#shared/types';

const router = useRouter();
const { session } = useAuth();
/// Solo el admin global puede dar de alta nuevas salas en el catálogo.
const isAdmin = computed(() => session.value?.role === 'ADMIN');

const branches = ref<Branch[]>([]);
const saving = ref(false);
const formError = ref<string | null>(null);
const confirmModalOpen = ref(false);

const form = ref({
  name: '',
  tagline: '',
  description: '',
  category: 'sala-juntas',
  capacity: 10,
  pricePerHour: 300,
  pricePerDay: 2000 as number | null,
  image: '',
  amenitiesStr: 'Pantalla 4K, Videoconferencia, Café de barra, WiFi premium',
  branchIds: session.value?.branchId ? [session.value.branchId] : ([] as string[]),
  featured: false,
  active: true,
});

const categoryOptions = [
  { label: 'Sala de juntas', value: 'sala-juntas' },
  { label: 'Auditorio / Eventos', value: 'evento' },
  { label: 'Cabina focus', value: 'focus' },
  { label: 'Hot desk flexible', value: 'escritorio' },
];

function toggleBranch(branchId: string): void {
  const ids = form.value.branchIds;
  const index = ids.indexOf(branchId);
  if (index === -1) ids.push(branchId);
  else ids.splice(index, 1);
}

const missingFields = computed(() => {
  const f = form.value;
  const missing: string[] = [];
  if (f.name.trim().length < 3) missing.push('nombre (mín. 3 caracteres)');
  if (f.capacity < 1) missing.push('capacidad');
  if (f.pricePerHour < 0) missing.push('precio por hora');
  if (f.branchIds.length === 0) missing.push('al menos una sede');
  return missing;
});

const confirmDescription = computed(() => {
  const f = form.value;
  const branchNames = f.branchIds
    .map((id) => branches.value.find((b) => b.id === id)?.name ?? id)
    .join(', ');
  return `Se creará la sala "${f.name.trim()}" en ${branchNames} con capacidad para ${f.capacity} personas y tarifa de $ ${f.pricePerHour}/hr${f.pricePerDay ? ` ($ ${f.pricePerDay}/día)` : ''}. ${f.active ? 'Quedará activa para reservas.' : 'Quedará inactiva hasta que se habilite.'}`;
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
    const amenities = f.amenitiesStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const space = await $api<BookableSpace>('/api/spaces', {
      method: 'POST',
      body: {
        name: f.name.trim(),
        tagline: f.tagline.trim(),
        description: f.description.trim(),
        category: f.category,
        capacity: Number(f.capacity),
        pricePerHour: Number(f.pricePerHour),
        pricePerDay: f.pricePerDay ? Number(f.pricePerDay) : null,
        image: f.image.trim(),
        amenities,
        branchIds: f.branchIds,
        featured: f.featured,
        active: f.active,
      },
    });
    confirmModalOpen.value = false;
    await navigateTo(`/salas/${space.id}`);
  } catch (cause: any) {
    formError.value =
      cause?.data?.message ||
      (cause instanceof Error ? cause.message : 'No se pudo crear la sala');
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  if (!isAdmin.value) {
    await navigateTo('/salas');
    return;
  }
  try {
    branches.value = await $api<Branch[]>('/api/branches');
    if (form.value.branchIds.length === 0 && branches.value.length) {
      form.value.branchIds = [branches.value[0]!.id];
    }
  } catch {
    branches.value = [];
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
      <h1 class="text-xl font-black text-text-primary">Nueva sala</h1>
      <p class="mt-1 text-[11px] text-text-dim">
        Se agregará al inventario de la sede y quedará disponible para reservas
        web y asignación de eventos.
      </p>
    </div>

    <section class="rounded-2xl border border-stroke bg-surface p-5">
      <h2
        class="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-text-primary"
      >
        <span class="h-4 w-1 rounded-full bg-accent" />
        Información general
      </h2>
      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Nombre de la sala *
          </span>
          <input
            v-model="form.name"
            type="text"
            placeholder="ej. Sala Andamio"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-dim focus:border-accent"
          />
        </label>
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Tagline comercial
          </span>
          <input
            v-model="form.tagline"
            type="text"
            placeholder="ej. Juntas ejecutivas para 12"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-dim focus:border-accent"
          />
        </label>
        <div class="block sm:col-span-2">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Categoría *
          </span>
          <div class="mt-1.5 flex flex-wrap gap-2">
            <button
              v-for="cat in categoryOptions"
              :key="cat.value"
              type="button"
              class="cursor-pointer rounded-full border px-4 py-1.5 text-xs font-bold transition"
              :class="
                form.category === cat.value
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-stroke bg-base text-text-dim hover:text-text-muted'
              "
              @click="form.category = cat.value"
            >
              {{ cat.label }}
            </button>
          </div>
        </div>
        <label class="block sm:col-span-2">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Descripción
          </span>
          <textarea
            v-model="form.description"
            rows="3"
            placeholder="Describe el equipamiento, acústica y ambiente de la sala…"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-dim focus:border-accent"
          />
        </label>
        <label class="block sm:col-span-2">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Amenidades y equipamiento (separadas por comas)
          </span>
          <input
            v-model="form.amenitiesStr"
            type="text"
            placeholder="ej. Pantalla 4K, Videoconferencia, Café de barra"
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
        Fotografía principal de la sala que se muestra en el catálogo y portal
        de reservas.
      </p>
      <div class="mt-4">
        <ImagePicker
          v-model="form.image"
          label="Subir imagen de la sala (opcional)"
          @error="formError = $event"
        />
      </div>
    </section>

    <section class="rounded-2xl border border-stroke bg-surface p-5">
      <h2
        class="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-text-primary"
      >
        <span class="h-4 w-1 rounded-full bg-accent" />
        Capacidad, tarifas y sedes
      </h2>
      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Capacidad (personas) *
          </span>
          <input
            v-model.number="form.capacity"
            type="number"
            min="1"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </label>
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Precio por hora (MXN) *
          </span>
          <input
            v-model.number="form.pricePerHour"
            type="number"
            min="0"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </label>
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Precio por día (MXN)
          </span>
          <input
            v-model.number="form.pricePerDay"
            type="number"
            min="0"
            placeholder="Opcional"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </label>
      </div>

      <div class="mt-4 block">
        <span
          class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
        >
          Sedes donde está disponible *
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

      <div class="mt-5 space-y-4 border-t border-stroke/50 pt-4">
        <div class="flex items-center justify-between">
          <div>
            <span class="block text-xs font-bold text-text-primary">
              Sala activa para reservas
            </span>
            <span class="text-[10px] text-text-dim">
              Habilita la sala en el portal web y en la consola desde su creación.
            </span>
          </div>
          <button
            type="button"
            class="relative h-6 w-11 cursor-pointer rounded-full transition"
            :class="
              form.active ? 'bg-accent' : 'bg-base border border-stroke'
            "
            @click="form.active = !form.active"
          >
            <span
              class="absolute top-0.5 h-5 w-5 rounded-full transition-all"
              :class="
                form.active ? 'left-[22px] bg-base' : 'left-0.5 bg-white'
              "
            />
          </button>
        </div>

        <div class="flex items-center justify-between">
          <div>
            <span class="flex items-center gap-1.5 text-xs font-bold text-text-primary">
              <Sparkles class="h-3.5 w-3.5 text-amber-400" />
              Destacada en el portal público
            </span>
            <span class="text-[10px] text-text-dim">
              Muestra insignia destacada y prioridad en el listado web.
            </span>
          </div>
          <button
            type="button"
            class="relative h-6 w-11 cursor-pointer rounded-full transition"
            :class="
              form.featured ? 'bg-accent' : 'bg-base border border-stroke'
            "
            @click="form.featured = !form.featured"
          >
            <span
              class="absolute top-0.5 h-5 w-5 rounded-full transition-all"
              :class="
                form.featured ? 'left-[22px] bg-base' : 'left-0.5 bg-white'
              "
            />
          </button>
        </div>
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
      {{ saving ? 'Creando…' : 'Crear sala' }}
    </button>

    <UModal
      v-model:open="confirmModalOpen"
      title="Crear nueva sala"
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
            label="Crear sala"
            icon="i-lucide-plus"
            :loading="saving"
            @click="submit"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
