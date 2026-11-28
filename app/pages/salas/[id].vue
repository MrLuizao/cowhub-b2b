<script setup lang="ts">
import {
  ArrowLeft,
  Check,
  MapPin,
  Pencil,
  Power,
  Sparkles,
  Trash2,
  X,
} from '@lucide/vue';
import { collection, getDocs, query, where } from 'firebase/firestore';

import type { BookableSpace, Branch, SpaceBooking } from '#shared/types';

const route = useRoute();
const router = useRouter();
const spaceId = computed(() => String(route.params.id));

const { session, canEditInBranches } = useAuth();
const isAdmin = computed(() => session.value?.role === 'ADMIN');

const pending = ref(true);
const saving = ref(false);
const deleting = ref(false);
const editing = ref(false);
const space = ref<BookableSpace | null>(null);
const branches = ref<Branch[]>([]);
const bookings = ref<SpaceBooking[]>([]);

const canManageSpace = computed(() => {
  if (isAdmin.value) return true;
  if (!space.value) return false;
  return canEditInBranches(space.value.branchIds ?? []);
});

const editForm = ref({
  name: '',
  tagline: '',
  description: '',
  category: 'sala-juntas',
  capacity: 10,
  pricePerHour: 300,
  pricePerDay: 2000 as number | null,
  image: '',
  gallery: [] as string[],
  amenitiesStr: '',
  branchIds: [] as string[],
  featured: false,
  sort: 10,
});

const saveModalOpen = ref(false);
const statusModalOpen = ref(false);
const deleteModalOpen = ref(false);

const CATEGORY_OPTIONS = [
  { value: 'sala-juntas', label: 'Sala de juntas' },
  { value: 'evento', label: 'Auditorio / Eventos' },
  { value: 'focus', label: 'Cabina focus' },
  { value: 'escritorio', label: 'Hot desk flexible' },
];

const CATEGORY_LABELS: Record<string, string> = {
  'sala-juntas': 'Sala de juntas',
  'evento': 'Auditorio / Eventos',
  'focus': 'Cabina focus',
  'escritorio': 'Hot desk flexible',
};

async function loadData() {
  pending.value = true;
  try {
    const [spaceData, branchList] = await Promise.all([
      $api<BookableSpace>(`/api/spaces/${spaceId.value}`),
      $api<Branch[]>('/api/branches'),
    ]);
    space.value = spaceData;
    branches.value = branchList;

    const firebase = useFirebase();
    if (firebase.db) {
      const snap = await getDocs(
        query(
          collection(firebase.db, 'space_bookings'),
          where('space_id', '==', spaceId.value),
        ),
      );
      bookings.value = snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          folio: x.folio ?? d.id,
          spaceId: x.space_id ?? '',
          spaceName: x.space_name ?? '',
          date: x.date ?? '',
          mode: x.mode === 'day' ? 'day' : 'hour',
          startHour: x.start_hour ?? null,
          endHour: x.end_hour ?? null,
          guests: x.guests ?? {},
          people: x.people ?? 1,
          totalMxn: x.total_mxn ?? 0,
          status: x.status ?? 'confirmed',
          source: x.source ?? 'web',
          notes: x.notes ?? null,
          checkedInAt: x.checked_in_at?.toMillis?.() ?? null,
          checkedInBy: x.checked_in_by ?? null,
          createdAt: x.created_at?.toMillis?.() ?? 0,
        } as SpaceBooking;
      });
    }
  } finally {
    pending.value = false;
  }
}

onMounted(loadData);

function getBranchNames(ids?: string[]): string {
  if (!ids || ids.length === 0) return 'Sin sede asignada';
  return ids
    .map((id) => branches.value.find((b) => b.id === id)?.name ?? id)
    .join(' · ');
}

function startEdit(): void {
  if (!space.value) return;
  editForm.value = {
    name: space.value.name,
    tagline: space.value.tagline,
    description: space.value.description,
    category: space.value.category,
    capacity: space.value.capacity,
    pricePerHour: space.value.pricePerHour,
    pricePerDay: space.value.pricePerDay,
    image: space.value.image,
    gallery: [...(space.value.gallery || [])],
    amenitiesStr: (space.value.amenities || []).join(', '),
    branchIds: [...(space.value.branchIds || [])],
    featured: space.value.featured,
    sort: space.value.sort ?? 10,
  };
  editing.value = true;
}

function toggleBranch(branchId: string): void {
  const ids = editForm.value.branchIds;
  const idx = ids.indexOf(branchId);
  if (idx === -1) ids.push(branchId);
  else ids.splice(idx, 1);
}

async function confirmSave(): Promise<void> {
  if (!space.value || saving.value) return;
  saving.value = true;
  try {
    const amenities = editForm.value.amenitiesStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const updated = await $api<BookableSpace>(`/api/spaces/${spaceId.value}`, {
      method: 'PUT',
      body: {
        name: editForm.value.name.trim(),
        tagline: editForm.value.tagline.trim(),
        description: editForm.value.description.trim(),
        category: editForm.value.category,
        capacity: Number(editForm.value.capacity),
        pricePerHour: Number(editForm.value.pricePerHour),
        pricePerDay: editForm.value.pricePerDay ? Number(editForm.value.pricePerDay) : null,
        image: editForm.value.image.trim(),
        gallery: editForm.value.gallery,
        amenities,
        branchIds: editForm.value.branchIds,
        featured: editForm.value.featured,
        sort: Number(editForm.value.sort) || 10,
      },
    });
    space.value = updated;
    editing.value = false;
    saveModalOpen.value = false;
  } finally {
    saving.value = false;
  }
}

async function confirmToggleStatus(): Promise<void> {
  if (!space.value || saving.value) return;
  saving.value = true;
  try {
    const nextActive = space.value.active === false;
    const updated = await $api<BookableSpace>(`/api/spaces/${spaceId.value}`, {
      method: 'PUT',
      body: { active: nextActive },
    });
    space.value = updated;
    statusModalOpen.value = false;
  } finally {
    saving.value = false;
  }
}

async function confirmDelete(): Promise<void> {
  if (!space.value || deleting.value) return;
  deleting.value = true;
  try {
    await $api(`/api/spaces/${spaceId.value}`, { method: 'DELETE' });
    deleteModalOpen.value = false;
    await navigateTo('/salas');
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div
    v-if="pending"
    class="rounded-2xl border border-stroke bg-surface p-10 text-center text-sm font-semibold text-text-dim"
  >
    Cargando sala…
  </div>

  <div v-else-if="space" class="space-y-6">
    <button
      type="button"
      class="inline-flex cursor-pointer items-center gap-2 text-xs font-black uppercase tracking-widest text-text-muted transition hover:text-accent"
      @click="router.back()"
    >
      <ArrowLeft class="h-4 w-4 text-accent" />
      Volver
    </button>

    <!-- Cabecera de sala (idéntica a /sedes/[id]) -->
    <div class="flex items-center gap-4">
      <img
        :src="space.image || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&q=80'"
        :alt="space.name"
        class="h-20 w-28 rounded-2xl border border-stroke object-cover"
      />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h1 class="text-xl font-black text-text-primary">
            {{ space.name }}
          </h1>
          <span
            v-if="space.featured"
            title="Destacada en portal público"
            class="inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-400"
          >
            <Sparkles class="h-2.5 w-2.5" />
          </span>
        </div>
        <p class="mt-1 truncate text-[11px] text-text-dim">
          {{ getBranchNames(space.branchIds) }} · {{ CATEGORY_LABELS[space.category] || space.category }} · {{ space.capacity }} personas
        </p>
        <p class="mt-0.5 flex items-center gap-1.5">
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="space.active !== false ? 'bg-emerald-400' : 'bg-red-400'"
          />
          <span
            class="text-[10px] font-bold uppercase tracking-widest"
            :class="space.active !== false ? 'text-emerald-400' : 'text-red-400'"
          >
            {{ space.active !== false ? 'Activa' : 'Inactiva' }}
          </span>
        </p>
      </div>
      <button
        v-if="canManageSpace"
        class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-4 py-1.5 text-[11px] font-black transition"
        :class="
          space.active !== false
            ? 'border-red-400/40 bg-red-400/10 text-red-400 hover:bg-red-400/20'
            : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20'
        "
        @click="statusModalOpen = true"
      >
        <Power class="h-3.5 w-3.5" />
        {{ space.active !== false ? 'Desactivar sala' : 'Activar sala' }}
      </button>
    </div>

    <!-- Sección de información y edición -->
    <section class="rounded-2xl border border-stroke bg-surface p-5">
      <div class="flex items-center justify-between">
        <h2 class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
          Información de la sala
        </h2>
        <button
          v-if="!editing && canManageSpace"
          class="flex cursor-pointer items-center gap-1.5 rounded-full border border-stroke px-3 py-1 text-[10px] font-black text-text-muted transition hover:border-accent hover:text-accent"
          @click="startEdit"
        >
          <Pencil class="h-3 w-3" />
          Editar
        </button>
      </div>

      <div v-if="!editing" class="mt-4 space-y-4">
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Capacidad
            </p>
            <p class="mt-1 text-sm font-black text-text-primary">
              {{ space.capacity }} personas
            </p>
          </div>
          <div>
            <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Tarifa por hora
            </p>
            <p class="mt-1 text-sm font-black text-accent">
              $ {{ space.pricePerHour }} MXN
            </p>
          </div>
          <div>
            <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Tarifa por día
            </p>
            <p class="mt-1 text-sm font-black text-text-primary">
              {{ space.pricePerDay ? `$ ${space.pricePerDay} MXN` : 'No aplica' }}
            </p>
          </div>
          <div>
            <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Sedes asignadas
            </p>
            <p class="mt-1 flex items-center gap-1 text-sm font-black text-text-primary">
              <MapPin class="h-3.5 w-3.5 text-accent" />
              {{ getBranchNames(space.branchIds) }}
            </p>
          </div>
        </div>

        <div v-if="space.tagline || space.description" class="border-t border-stroke/50 pt-4">
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            Descripción
          </p>
          <p v-if="space.tagline" class="mt-1 text-xs font-bold text-text-primary">
            {{ space.tagline }}
          </p>
          <p v-if="space.description" class="mt-1 text-xs leading-relaxed text-text-muted">
            {{ space.description }}
          </p>
        </div>

        <div v-if="space.amenities?.length" class="border-t border-stroke/50 pt-4">
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            Amenidades y equipamiento
          </p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <span
              v-for="amenity in space.amenities"
              :key="amenity"
              class="rounded-full border border-stroke bg-base px-3 py-1 text-[11px] font-semibold text-text-secondary"
            >
              {{ amenity }}
            </span>
          </div>
        </div>
      </div>

      <div v-else class="mt-4 space-y-3">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Nombre
            </span>
            <input
              v-model="editForm.name"
              type="text"
              class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label class="block">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Tagline comercial
            </span>
            <input
              v-model="editForm.tagline"
              type="text"
              class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label class="block">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Categoría
            </span>
            <USelect
              v-model="editForm.category"
              :items="CATEGORY_OPTIONS"
              size="lg"
              class="mt-1 w-full"
              :ui="{ base: 'h-10 rounded-xl border border-stroke bg-base px-3 text-sm text-text-primary ring-0 shadow-none' }"
            />
          </label>
          <label class="block">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Capacidad (personas)
            </span>
            <input
              v-model.number="editForm.capacity"
              type="number"
              min="1"
              class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label class="block">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Precio por hora (MXN)
            </span>
            <input
              v-model.number="editForm.pricePerHour"
              type="number"
              min="0"
              class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label class="block">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Precio por día (MXN)
            </span>
            <input
              v-model.number="editForm.pricePerDay"
              type="number"
              min="0"
              placeholder="Opcional"
              class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label class="block sm:col-span-2">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Descripción
            </span>
            <textarea
              v-model="editForm.description"
              rows="2"
              class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label class="block sm:col-span-2">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Amenidades (separadas por comas)
            </span>
            <input
              v-model="editForm.amenitiesStr"
              type="text"
              class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <div v-if="isAdmin" class="sm:col-span-2">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Sedes asignadas
            </span>
            <div class="mt-1.5 flex flex-wrap gap-2">
              <button
                v-for="b in branches"
                :key="b.id"
                type="button"
                class="cursor-pointer rounded-full border px-4 py-1.5 text-xs font-bold transition"
                :class="
                  editForm.branchIds.includes(b.id)
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-stroke bg-base text-text-dim hover:text-text-muted'
                "
                @click="toggleBranch(b.id)"
              >
                {{ b.name }}
              </button>
            </div>
          </div>
          <div class="sm:col-span-2">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Imagen principal
            </span>
            <ImagePicker
              v-model="editForm.image"
              label="Subir imagen de la sala"
              compact
              class="mt-1"
            />
          </div>
          <div class="sm:col-span-2">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Galería de fotos
            </span>
            <GalleryEditor v-model="editForm.gallery" class="mt-1" />
          </div>
          <label class="block">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Orden en catálogo
            </span>
            <input
              v-model.number="editForm.sort"
              type="number"
              min="1"
              class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <div class="flex items-center justify-between sm:col-span-2 pt-2">
            <span class="text-xs font-bold text-text-muted">
              Destacar en el portal público
            </span>
            <button
              type="button"
              class="relative h-6 w-11 cursor-pointer rounded-full transition"
              :class="editForm.featured ? 'bg-accent' : 'bg-base border border-stroke'"
              @click="editForm.featured = !editForm.featured"
            >
              <span
                class="absolute top-0.5 h-5 w-5 rounded-full transition-all"
                :class="editForm.featured ? 'left-[22px] bg-base' : 'left-0.5 bg-white'"
              />
            </button>
          </div>
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <button
            class="flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-stroke px-3 text-[11px] font-black text-text-muted transition hover:text-text-primary"
            @click="editing = false"
          >
            <X class="h-3.5 w-3.5" />
            Cancelar
          </button>
          <button
            class="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-accent px-4 text-[11px] font-black text-base transition hover:opacity-90 disabled:opacity-50"
            :disabled="saving"
            @click="saveModalOpen = true"
          >
            <Check class="h-3.5 w-3.5" />
            {{ saving ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </div>
    </section>

    <!-- Historial de reservas de esta sala -->
    <section>
      <h2 class="mb-3 text-sm font-black uppercase tracking-widest text-text-muted">
        Reservas de la sala
      </h2>

      <div v-if="bookings.length" class="space-y-3">
        <div
          v-for="b in bookings"
          :key="b.id"
          class="flex items-center justify-between gap-3 rounded-2xl border border-stroke bg-surface p-4"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs font-black text-accent">{{ b.folio }}</span>
              <span class="truncate text-xs font-bold text-text-primary">
                {{ b.guests?.name || 'Cliente web' }}
              </span>
            </div>
            <p class="mt-0.5 text-[10px] text-text-dim">
              {{ b.date }} · {{ b.mode === 'day' ? 'Día completo' : `${b.startHour}:00 a ${b.endHour}:00` }} · {{ b.people }} personas
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2.5">
            <span class="text-xs font-black text-text-primary">$ {{ b.totalMxn }}</span>
            <span
              class="inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
              :class="{
                'border-accent/40 bg-accent/10 text-accent': b.status === 'confirmed',
                'border-emerald-400/30 bg-emerald-400/10 text-emerald-400': b.status === 'completed',
                'border-red-400/30 bg-red-400/10 text-red-400': b.status === 'cancelled',
                'border-stroke bg-base text-text-dim': b.status === 'no_show',
              }"
            >
              {{ b.status === 'confirmed' ? 'Vigente' : b.status === 'completed' ? 'Completada' : b.status }}
            </span>
          </div>
        </div>
      </div>

      <p
        v-else
        class="py-4 text-center text-xs font-semibold text-text-dim"
      >
        Sin reservas registradas en esta sala
      </p>
    </section>

    <!-- Eliminar sala (solo Admin) -->
    <section
      v-if="isAdmin"
      class="flex items-center justify-between rounded-2xl border border-red-400/30 bg-red-400/5 p-5"
    >
      <div>
        <h3 class="text-xs font-black uppercase tracking-widest text-red-400">
          Eliminar sala
        </h3>
        <p class="mt-0.5 text-[11px] text-text-dim">
          Retira permanentemente esta sala del catálogo y del portal web.
        </p>
      </div>
      <button
        type="button"
        class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-red-400/40 bg-red-400/10 px-4 py-1.5 text-[11px] font-black text-red-400 transition hover:bg-red-400/20"
        @click="deleteModalOpen = true"
      >
        <Trash2 class="h-3.5 w-3.5" />
        Eliminar sala
      </button>
    </section>

    <UModal
      v-model:open="saveModalOpen"
      title="Guardar cambios de la sala"
      :description="`Se actualizarán los datos, tarifas y disponibilidad de '${editForm.name}'.`"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="outline"
            @click="saveModalOpen = false"
          />
          <UButton
            label="Guardar"
            icon="i-lucide-check"
            :loading="saving"
            @click="confirmSave"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="statusModalOpen"
      :title="space.active !== false ? `Desactivar ${space.name}` : `Activar ${space.name}`"
      :description="
        space.active !== false
          ? 'La sala dejará de mostrarse para nuevas reservas en el portal público.'
          : 'La sala volverá a estar disponible para reservas en la sede y en el portal público.'
      "
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
            :label="space.active !== false ? 'Desactivar' : 'Activar'"
            :loading="saving"
            @click="confirmToggleStatus"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="deleteModalOpen"
      :title="`Eliminar ${space.name}`"
      description="Se eliminará la sala del catálogo. Esta acción no se puede deshacer."
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="outline"
            @click="deleteModalOpen = false"
          />
          <UButton
            label="Eliminar sala"
            color="error"
            :loading="deleting"
            @click="confirmDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
