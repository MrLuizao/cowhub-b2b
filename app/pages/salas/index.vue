<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  DoorClosed,
  DoorOpen,
  Layers,
  Plus,
  Sparkles,
} from '@lucide/vue';

import type { BookableSpace, Branch } from '#shared/types';

const { session } = useAuth();
const isAdmin = computed(() => session.value?.role === 'ADMIN');
const canViewBranches = computed(() =>
  canAccess(session.value?.role, '/sedes'),
);

const branches = ref<Branch[]>([]);
const spaces = ref<BookableSpace[]>([]);
const pending = ref(true);
const search = ref('');
const selectedBranch = ref(session.value?.branchId ?? 'todas');
const spaceFilter = ref<'todas' | 'ACTIVE' | 'INACTIVE' | 'FEATURED'>('todas');
const page = ref(1);
const pageSize = 8;

const CATEGORY_LABELS: Record<string, string> = {
  'sala-juntas': 'Sala de juntas',
  'evento': 'Auditorio / Eventos',
  'focus': 'Cabina focus',
  'escritorio': 'Hot desk flexible',
};

onMounted(async () => {
  try {
    const [branchList, spaceList] = await Promise.all([
      $api<Branch[]>('/api/branches'),
      $api<BookableSpace[]>('/api/spaces'),
    ]);
    branches.value = branchList;
    spaces.value = spaceList;
  } finally {
    pending.value = false;
  }
});

const activeCount = computed(
  () => spaces.value.filter((sp) => sp.active !== false).length,
);

const inactiveCount = computed(
  () => spaces.value.filter((sp) => sp.active === false).length,
);

const featuredCount = computed(
  () => spaces.value.filter((sp) => sp.featured).length,
);

const totalCapacity = computed(() =>
  spaces.value.reduce((sum, sp) => sum + sp.capacity, 0),
);

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return spaces.value.filter((sp) => {
    if (
      selectedBranch.value !== 'todas' &&
      !sp.branchIds?.includes(selectedBranch.value)
    ) {
      return false;
    }
    if (spaceFilter.value === 'ACTIVE' && sp.active === false) return false;
    if (spaceFilter.value === 'INACTIVE' && sp.active !== false) return false;
    if (spaceFilter.value === 'FEATURED' && !sp.featured) return false;
    if (q) {
      const matchName = sp.name.toLowerCase().includes(q);
      const matchTagline = sp.tagline?.toLowerCase().includes(q);
      const matchCategory = (CATEGORY_LABELS[sp.category] || sp.category)
        .toLowerCase()
        .includes(q);
      const matchAmenity = sp.amenities?.some((a) =>
        a.toLowerCase().includes(q),
      );
      if (!matchName && !matchTagline && !matchCategory && !matchAmenity) {
        return false;
      }
    }
    return true;
  });
});

const pageCount = computed(() =>
  Math.max(1, Math.ceil(filtered.value.length / pageSize)),
);

const paged = computed(() =>
  filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize),
);

watch([search, selectedBranch, spaceFilter], () => {
  page.value = 1;
});

watch(pageCount, (pages) => {
  if (page.value > pages) page.value = pages;
});

function toggleSpaceFilter(
  key: 'todas' | 'ACTIVE' | 'INACTIVE' | 'FEATURED',
): void {
  spaceFilter.value = spaceFilter.value === key ? 'todas' : key;
}

function branchName(branchId: string): string {
  return branches.value.find((b) => b.id === branchId)?.name ?? branchId;
}
</script>

<template>
  <div class="space-y-6">
    <!-- Tarjetas KPI de filtro rápido -->
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          spaceFilter === 'todas'
            ? 'border-accent bg-accent/10'
            : 'border-stroke bg-surface hover:border-accent/50'
        "
        @click="toggleSpaceFilter('todas')"
      >
        <div class="flex items-center gap-2">
          <Layers class="h-4 w-4 text-accent" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Todas las salas
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-text-primary">
          {{ spaces.length }}
        </p>
        <p class="text-[10px] font-semibold text-text-dim">
          {{ totalCapacity }} lugares · {{ activeCount }} activas
        </p>
      </button>

      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          spaceFilter === 'ACTIVE'
            ? 'border-emerald-400 bg-emerald-400/10'
            : 'border-stroke bg-surface hover:border-emerald-400/50'
        "
        @click="toggleSpaceFilter('ACTIVE')"
      >
        <div class="flex items-center gap-2">
          <DoorOpen class="h-4 w-4 text-emerald-400" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Activas
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-emerald-400">
          {{ activeCount }}
          <span class="text-[11px] font-bold text-text-dim">
            / {{ spaces.length }}
          </span>
        </p>
      </button>

      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          spaceFilter === 'INACTIVE'
            ? 'border-red-400 bg-red-400/10'
            : 'border-stroke bg-surface hover:border-red-400/50'
        "
        @click="toggleSpaceFilter('INACTIVE')"
      >
        <div class="flex items-center gap-2">
          <DoorClosed class="h-4 w-4 text-red-400" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Inactivas
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-red-400">
          {{ inactiveCount }}
        </p>
      </button>

      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          spaceFilter === 'FEATURED'
            ? 'border-amber-400 bg-amber-400/10'
            : 'border-stroke bg-surface hover:border-amber-400/50'
        "
        @click="toggleSpaceFilter('FEATURED')"
      >
        <div class="flex items-center gap-2">
          <Sparkles class="h-4 w-4 text-amber-400" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Destacadas
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-amber-400">
          {{ featuredCount }}
        </p>
      </button>
    </div>

    <!-- Filtro por sede (igual que /miembros) -->
    <section>
      <h2
        class="mb-3 text-sm font-black uppercase tracking-widest text-text-muted"
      >
        Catálogo de espacios de trabajo por sede
      </h2>
      <div class="flex flex-wrap gap-2">
        <button
          class="cursor-pointer rounded-full border px-4 py-1.5 text-xs font-bold transition"
          :class="
            selectedBranch === 'todas'
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-stroke bg-surface text-text-dim hover:text-text-muted'
          "
          @click="selectedBranch = 'todas'"
        >
          Todas
        </button>
        <button
          v-for="branch in branches"
          :key="branch.id"
          class="cursor-pointer rounded-full border px-4 py-1.5 text-xs font-bold transition"
          :class="
            selectedBranch === branch.id
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-stroke bg-surface text-text-dim hover:text-text-muted'
          "
          @click="selectedBranch = branch.id"
        >
          {{ branch.name }}
        </button>
      </div>
    </section>

    <!-- Buscador + Contador + Nueva sala -->
    <div class="flex items-center gap-4">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Buscar por nombre, categoría o amenidad…"
        class="w-full max-w-sm"
        size="lg"
      />
      <span
        class="rounded-full border border-stroke bg-surface px-3 py-1 text-[11px] font-bold text-text-muted"
      >
        {{ filtered.length }} salas
      </span>
      <button
        v-if="isAdmin"
        class="ml-auto flex shrink-0 cursor-pointer items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-base transition hover:opacity-90"
        @click="navigateTo('/salas/nuevo')"
      >
        <Plus class="h-4 w-4" />
        Nueva sala
      </button>
    </div>

    <!-- Lista en tabla con paginación (igual que /miembros) -->
    <div class="overflow-hidden rounded-2xl border border-stroke bg-surface">
      <table class="w-full text-left">
        <thead>
          <tr
            class="border-b border-stroke text-[10px] uppercase tracking-widest text-text-dim"
          >
            <th class="px-5 py-3 font-bold">Sala</th>
            <th class="px-5 py-3 font-bold">Categoría</th>
            <th class="px-5 py-3 font-bold">Capacidad</th>
            <th class="px-5 py-3 font-bold">Tarifas</th>
            <th class="px-5 py-3 font-bold">Sede</th>
            <th class="px-5 py-3 text-right font-bold">Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="sp in paged"
            :key="sp.id"
            class="border-t border-stroke"
          >
            <td class="px-5 py-3">
              <div class="flex items-center gap-3">
                <img
                  :src="sp.image || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&q=80'"
                  :alt="sp.name"
                  class="h-10 w-14 shrink-0 rounded-lg border border-stroke object-cover"
                />
                <div class="min-w-0">
                  <button
                    class="cursor-pointer text-xs font-bold text-text-primary transition hover:text-accent hover:underline"
                    @click="navigateTo(`/salas/${sp.id}`)"
                  >
                    {{ sp.name }}
                  </button>
                  <p class="truncate text-[10px] text-text-dim">
                    {{ sp.tagline || sp.amenities?.slice(0, 3).join(' · ') }}
                  </p>
                </div>
              </div>
            </td>
            <td class="px-5 py-3">
              <div class="flex items-center gap-1.5">
                <UBadge
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  :label="CATEGORY_LABELS[sp.category] || sp.category"
                />
                <span
                  v-if="sp.featured"
                  title="Destacada en portal público"
                  class="inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-400"
                >
                  <Sparkles class="h-2.5 w-2.5" />
                </span>
              </div>
            </td>
            <td class="px-5 py-3 text-xs font-bold text-text-primary">
              {{ sp.capacity }} personas
            </td>
            <td class="px-5 py-3 font-mono text-xs text-text-primary">
              <span class="font-bold text-accent">$ {{ sp.pricePerHour }}/hr</span>
              <span v-if="sp.pricePerDay" class="text-[10px] text-text-dim">
                · $ {{ sp.pricePerDay }}/día
              </span>
            </td>
            <td class="px-5 py-3">
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="bId in sp.branchIds"
                  :key="bId"
                  :disabled="!canViewBranches"
                  class="rounded-full border border-stroke bg-base px-2.5 py-0.5 text-[10px] font-bold text-text-muted transition"
                  :class="
                    canViewBranches
                      ? 'cursor-pointer hover:border-accent hover:text-accent'
                      : 'cursor-default'
                  "
                  @click="canViewBranches && navigateTo(`/sedes/${bId}`)"
                >
                  {{ branchName(bId) }}
                </button>
              </div>
            </td>
            <td class="px-5 py-3 text-right">
              <span
                class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                :class="
                  sp.active !== false
                    ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-400'
                    : 'border-red-500/35 bg-red-500/15 text-red-400'
                "
              >
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  :class="sp.active !== false ? 'bg-emerald-500' : 'bg-red-500'"
                />
                {{ sp.active !== false ? 'ACTIVA' : 'INACTIVA' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p
        v-if="!pending && filtered.length === 0"
        class="py-8 text-center text-xs font-semibold text-text-dim"
      >
        Sin salas que coincidan con el filtro
      </p>
      <div
        v-if="filtered.length > 0"
        class="flex items-center justify-between border-t border-stroke px-5 py-2.5"
      >
        <p class="text-[10px] font-semibold text-text-dim">
          {{ filtered.length }} salas · página {{ page }} de {{ pageCount }}
        </p>
        <div class="flex gap-1.5">
          <button
            class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-stroke text-text-muted transition hover:border-accent hover:text-accent disabled:opacity-30"
            :disabled="page === 1"
            @click="page--"
          >
            <ChevronLeft class="h-3.5 w-3.5" />
          </button>
          <button
            class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-stroke text-text-muted transition hover:border-accent hover:text-accent disabled:opacity-30"
            :disabled="page === pageCount"
            @click="page++"
          >
            <ChevronRight class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
