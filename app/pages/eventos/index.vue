<script setup lang="ts">
import {
  Activity as ActivityIcon,
  ChevronLeft,
  ChevronRight,
  DoorClosed,
  DoorOpen,
  Layers,
  Plus,
} from '@lucide/vue';

import type { Activity, Branch, Host } from '#shared/types';

const { session } = useAuth();
const isAdmin = computed(() => session.value?.role === 'ADMIN');
const canViewBranches = computed(() =>
  canAccess(session.value?.role, '/sedes'),
);

const branches = ref<Branch[]>([]);
const hosts = ref<Host[]>([]);
const activities = ref<Activity[]>([]);
const pending = ref(true);
const search = ref('');
const selectedBranch = ref(session.value?.branchId ?? 'todas');
const eventFilter = ref<'todos' | 'AVAILABLE' | 'BUSY' | 'FULL'>('todos');
const page = ref(1);
const pageSize = 8;

onMounted(async () => {
  try {
    const [branchList, activityList, hostList] = await Promise.all([
      $api<Branch[]>('/api/branches'),
      $api<Activity[]>('/api/activities'),
      $api<Host[]>('/api/hosts'),
    ]);
    branches.value = branchList;
    activities.value = activityList;
    hosts.value = hostList;
  } finally {
    pending.value = false;
  }
});

function occupancy(a: Activity): number {
  return a.capacity > 0 ? a.booked / a.capacity : 0;
}

const availableCount = computed(
  () => activities.value.filter((a) => occupancy(a) <= 0.8).length,
);

const busyCount = computed(
  () =>
    activities.value.filter((a) => occupancy(a) > 0.8 && occupancy(a) < 1)
      .length,
);

const fullCount = computed(
  () => activities.value.filter((a) => occupancy(a) >= 1).length,
);

const totalBooked = computed(() =>
  activities.value.reduce((sum, a) => sum + a.booked, 0),
);

const totalCapacity = computed(() =>
  activities.value.reduce((sum, a) => sum + a.capacity, 0),
);

function hostName(hostId: string): string {
  return hosts.value.find((t) => t.id === hostId)?.name ?? '-';
}

function branchName(branchId: string): string {
  return branches.value.find((b) => b.id === branchId)?.name ?? branchId;
}

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function barColor(ratio: number): string {
  if (ratio < 0.5) return 'bg-emerald-400';
  if (ratio <= 0.8) return 'bg-amber-400';
  return 'bg-red-400';
}

function statusMeta(a: Activity) {
  const ratio = occupancy(a);
  if (ratio >= 1) {
    return {
      label: 'LLENO',
      cls: 'border-red-400/30 bg-red-400/10 text-red-400',
    };
  }
  if (ratio > 0.8) {
    return {
      label: 'ÚLTIMOS CUPOS',
      cls: 'border-amber-400/30 bg-amber-400/10 text-amber-400',
    };
  }
  return {
    label: 'DISPONIBLE',
    cls: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400',
  };
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return activities.value.filter((a) => {
    if (
      selectedBranch.value !== 'todas' &&
      !a.branchIds.includes(selectedBranch.value)
    ) {
      return false;
    }
    const ratio = occupancy(a);
    if (eventFilter.value === 'AVAILABLE' && ratio > 0.8) return false;
    if (eventFilter.value === 'BUSY' && (ratio <= 0.8 || ratio >= 1))
      return false;
    if (eventFilter.value === 'FULL' && ratio < 1) return false;
    if (q) {
      const matchName = a.name.toLowerCase().includes(q);
      const matchHost = (a.host || hostName(a.hostId))
        .toLowerCase()
        .includes(q);
      const matchRoom = (a.room || '').toLowerCase().includes(q);
      if (!matchName && !matchHost && !matchRoom) return false;
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

watch([search, selectedBranch, eventFilter], () => {
  page.value = 1;
});

watch(pageCount, (pages) => {
  if (page.value > pages) page.value = pages;
});

function toggleEventFilter(
  key: 'todos' | 'AVAILABLE' | 'BUSY' | 'FULL',
): void {
  eventFilter.value = eventFilter.value === key ? 'todos' : key;
}
</script>

<template>
  <div class="space-y-6">
    <!-- 4 Tarjetas KPI superiores -->
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          eventFilter === 'todos'
            ? 'border-accent bg-accent/10'
            : 'border-stroke bg-surface hover:border-accent/50'
        "
        @click="toggleEventFilter('todos')"
      >
        <div class="flex items-center gap-2">
          <Layers class="h-4 w-4 text-accent" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Todos los eventos
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-text-primary">
          {{ activities.length }}
        </p>
        <p class="text-[10px] font-semibold text-text-dim">
          {{ totalBooked }} / {{ totalCapacity }} inscritos
        </p>
      </button>

      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          eventFilter === 'AVAILABLE'
            ? 'border-emerald-400 bg-emerald-400/10'
            : 'border-stroke bg-surface hover:border-emerald-400/50'
        "
        @click="toggleEventFilter('AVAILABLE')"
      >
        <div class="flex items-center gap-2">
          <DoorOpen class="h-4 w-4 text-emerald-400" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Con cupo
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-emerald-400">
          {{ availableCount }}
        </p>
      </button>

      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          eventFilter === 'BUSY'
            ? 'border-amber-400 bg-amber-400/10'
            : 'border-stroke bg-surface hover:border-amber-400/50'
        "
        @click="toggleEventFilter('BUSY')"
      >
        <div class="flex items-center gap-2">
          <ActivityIcon class="h-4 w-4 text-amber-400" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Últimos cupos
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-amber-400">
          {{ busyCount }}
        </p>
        <p class="text-[10px] font-semibold text-text-dim">
          &gt;80% de ocupación
        </p>
      </button>

      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          eventFilter === 'FULL'
            ? 'border-red-400 bg-red-400/10'
            : 'border-stroke bg-surface hover:border-red-400/50'
        "
        @click="toggleEventFilter('FULL')"
      >
        <div class="flex items-center gap-2">
          <DoorClosed class="h-4 w-4 text-red-400" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Llenos
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-red-400">
          {{ fullCount }}
        </p>
      </button>
    </div>

    <!-- Encabezado descriptivo + Filtro por sede -->
    <section>
      <h2
        class="mb-3 text-sm font-black uppercase tracking-widest text-text-muted"
      >
        Agenda de talleres, conferencias y networking por sede
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

    <!-- Buscador + Contador + Nuevo evento -->
    <div class="flex items-center gap-4">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Buscar por evento, anfitrión o sala…"
        class="w-full max-w-sm"
        size="lg"
      />
      <span
        class="rounded-full border border-stroke bg-surface px-3 py-1 text-[11px] font-bold text-text-muted"
      >
        {{ filtered.length }} eventos
      </span>
      <button
        v-if="isAdmin"
        class="ml-auto flex cursor-pointer items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-[11px] font-black text-base transition hover:opacity-90"
        @click="navigateTo('/eventos/nuevo')"
      >
        <Plus class="h-3.5 w-3.5" />
        Nuevo evento
      </button>
    </div>

    <!-- Tabla paginada -->
    <div class="overflow-hidden rounded-2xl border border-stroke bg-surface">
      <table class="w-full text-left">
        <thead>
          <tr
            class="border-b border-stroke text-[10px] uppercase tracking-widest text-text-dim"
          >
            <th class="px-5 py-3 font-bold">Evento</th>
            <th class="px-5 py-3 font-bold">Sala</th>
            <th class="px-5 py-3 font-bold">Cupo</th>
            <th class="px-5 py-3 font-bold">Sede</th>
            <th class="px-5 py-3 text-right font-bold">Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="a in paged"
            :key="a.id"
            class="border-t border-stroke"
          >
            <td class="px-5 py-3">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-10 w-14 shrink-0 flex-col items-center justify-center rounded-lg border border-stroke bg-base text-center"
                >
                  <p class="font-mono text-[11px] font-black text-accent">
                    {{ hhmm(a.startMinutes) }}
                  </p>
                  <p class="font-mono text-[9px] text-text-dim">
                    {{ hhmm(a.endMinutes) }}
                  </p>
                </div>
                <div class="min-w-0">
                  <button
                    class="cursor-pointer text-xs font-bold text-text-primary transition hover:text-accent hover:underline"
                    @click="navigateTo(`/eventos/${a.id}`)"
                  >
                    {{ a.name }}
                  </button>
                  <p class="truncate text-[10px] text-text-dim">
                    {{ a.host || hostName(a.hostId) }}
                  </p>
                </div>
              </div>
            </td>
            <td class="px-5 py-3">
              <UBadge
                color="neutral"
                variant="subtle"
                size="sm"
                :label="a.room || 'Sala asignada'"
              />
            </td>
            <td class="px-5 py-3">
              <p class="text-[11px] font-bold text-text-primary">
                {{ a.booked }}/{{ a.capacity }}
              </p>
              <div
                class="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-base"
              >
                <div
                  class="h-full rounded-full"
                  :class="barColor(occupancy(a))"
                  :style="{
                    width: `${Math.min(100, Math.round(occupancy(a) * 100))}%`,
                  }"
                />
              </div>
            </td>
            <td class="px-5 py-3">
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="bId in a.branchIds"
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
                class="rounded-full border px-2.5 py-0.5 text-[10px] font-black"
                :class="statusMeta(a).cls"
              >
                {{ statusMeta(a).label }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p
        v-if="!pending && filtered.length === 0"
        class="py-8 text-center text-xs font-semibold text-text-dim"
      >
        Sin eventos que coincidan con el filtro
      </p>
      <div
        v-if="filtered.length > 0"
        class="flex items-center justify-between border-t border-stroke px-5 py-2.5"
      >
        <p class="text-[10px] font-semibold text-text-dim">
          {{ filtered.length }} eventos · página {{ page }} de {{ pageCount }}
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
