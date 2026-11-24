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

import type { Activity, BookableSpace, Branch, Host } from '#shared/types';

const { session } = useAuth();
const isAdmin = computed(() => session.value?.role === 'ADMIN');
const canViewBranches = computed(() =>
  canAccess(session.value?.role, '/sedes'),
);
const canViewHosts = computed(() =>
  canAccess(session.value?.role, '/anfitriones'),
);
const canViewSalas = computed(() =>
  canAccess(session.value?.role, '/salas'),
);

const branches = ref<Branch[]>([]);
const hosts = ref<Host[]>([]);
const spaces = ref<BookableSpace[]>([]);
const activities = ref<Activity[]>([]);
const pending = ref(true);
const search = ref('');
const selectedBranch = ref(session.value?.branchId ?? 'todas');
const eventFilter = ref<'todos' | 'AVAILABLE' | 'BUSY' | 'FULL'>('todos');
const page = ref(1);
const pageSize = 8;

onMounted(async () => {
  try {
    const [branchList, activityList, hostList, spaceList] = await Promise.all([
      $api<Branch[]>('/api/branches'),
      $api<Activity[]>('/api/activities'),
      $api<Host[]>('/api/hosts'),
      $api<BookableSpace[]>('/api/spaces').catch(() => [] as BookableSpace[]),
    ]);
    branches.value = branchList;
    activities.value = activityList;
    hosts.value = hostList;
    spaces.value = spaceList;
  } finally {
    pending.value = false;
  }
});

function eventDateLabel(a: Activity): string {
  if (a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date)) {
    const [y, m, d] = a.date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
  const keys = Object.keys(a.bookedByDate ?? {})
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort();
  const iso = keys[0] ?? new Date().toISOString().slice(0, 10);
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function findRoomId(roomName?: string): string | null {
  const q = (roomName || '').trim().toLowerCase();
  if (!q) return null;
  const exact = spaces.value.find((s) => s.name.trim().toLowerCase() === q);
  if (exact) return exact.id;
  const partial = spaces.value.find(
    (s) =>
      s.name.toLowerCase().includes(q) || q.includes(s.name.toLowerCase()),
  );
  return partial?.id ?? null;
}

function openRoomDetail(a: Activity) {
  const roomId = a.roomId || findRoomId(a.room);
  if (roomId && canViewSalas.value) {
    navigateTo(`/salas/${roomId}`);
    return;
  }
  navigateTo(`/eventos/${a.id}`);
}

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
      cls: 'border-red-500/35 bg-red-500/15 text-red-400',
      dot: 'bg-red-500',
    };
  }
  if (ratio > 0.8) {
    return {
      label: 'ÚLTIMOS CUPOS',
      cls: 'border-amber-500/35 bg-amber-500/15 text-amber-400',
      dot: 'bg-amber-500',
    };
  }
  return {
    label: 'DISPONIBLE',
    cls: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-400',
    dot: 'bg-emerald-500',
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
      <button class="cursor-pointer rounded-2xl border p-4 text-left transition" :class="eventFilter === 'todos'
        ? 'border-accent bg-accent/10'
        : 'border-stroke bg-surface hover:border-accent/50'
        " @click="toggleEventFilter('todos')">
        <div class="flex items-center gap-2">
          <Layers class="h-4 w-4 text-accent" />
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
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

      <button class="cursor-pointer rounded-2xl border p-4 text-left transition" :class="eventFilter === 'AVAILABLE'
        ? 'border-emerald-400 bg-emerald-400/10'
        : 'border-stroke bg-surface hover:border-emerald-400/50'
        " @click="toggleEventFilter('AVAILABLE')">
        <div class="flex items-center gap-2">
          <DoorOpen class="h-4 w-4 text-emerald-400" />
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            Con cupo
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-emerald-400">
          {{ availableCount }}
        </p>
      </button>

      <button class="cursor-pointer rounded-2xl border p-4 text-left transition" :class="eventFilter === 'BUSY'
        ? 'border-amber-400 bg-amber-400/10'
        : 'border-stroke bg-surface hover:border-amber-400/50'
        " @click="toggleEventFilter('BUSY')">
        <div class="flex items-center gap-2">
          <ActivityIcon class="h-4 w-4 text-amber-400" />
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
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

      <button class="cursor-pointer rounded-2xl border p-4 text-left transition" :class="eventFilter === 'FULL'
        ? 'border-red-400 bg-red-400/10'
        : 'border-stroke bg-surface hover:border-red-400/50'
        " @click="toggleEventFilter('FULL')">
        <div class="flex items-center gap-2">
          <DoorClosed class="h-4 w-4 text-red-400" />
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
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
      <h2 class="mb-3 text-sm font-black uppercase tracking-widest text-text-muted">
        Agenda de talleres, conferencias y networking por sede
      </h2>
      <div class="flex flex-wrap gap-2">
        <button class="cursor-pointer rounded-full border px-4 py-1.5 text-xs font-bold transition" :class="selectedBranch === 'todas'
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-stroke bg-surface text-text-dim hover:text-text-muted'
          " @click="selectedBranch = 'todas'">
          Todas
        </button>
        <button v-for="branch in branches" :key="branch.id"
          class="cursor-pointer rounded-full border px-4 py-1.5 text-xs font-bold transition" :class="selectedBranch === branch.id
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-stroke bg-surface text-text-dim hover:text-text-muted'
            " @click="selectedBranch = branch.id">
          {{ branch.name }}
        </button>
      </div>
    </section>

    <!-- Buscador + Contador + Nuevo evento -->
    <div class="flex items-center gap-4">
      <UInput v-model="search" icon="i-lucide-search" placeholder="Buscar por evento, anfitrión o sala…"
        class="w-full max-w-sm" size="lg" />
      <span class="rounded-full border border-stroke bg-surface px-3 py-1 text-[11px] font-bold text-text-muted">
        {{ filtered.length }} eventos
      </span>
      <button v-if="isAdmin"
        class="ml-auto flex shrink-0 cursor-pointer items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-base transition hover:opacity-90"
        @click="navigateTo('/eventos/nuevo')">
        <Plus class="h-4 w-4" />
        Nuevo evento
      </button>
    </div>

    <!-- Tabla paginada -->
    <div class="overflow-hidden rounded-2xl border border-stroke bg-surface">
      <table class="w-full text-left">
        <thead>
          <tr class="border-b border-stroke text-[10px] uppercase tracking-widest text-text-dim">
            <th class="px-5 py-3 font-bold">Evento</th>
            <th class="px-5 py-3 font-bold">Ponente</th>
            <th class="px-5 py-3 font-bold">Fecha</th>
            <th class="px-5 py-3 font-bold">Hora</th>
            <th class="px-5 py-3 font-bold">Sede</th>
            <th class="px-5 py-3 text-right font-bold">Sala</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in paged" :key="a.id" class="border-t border-stroke">
            <td class="px-5 py-3.5">
              <button
                type="button"
                class="cursor-pointer text-left text-xs font-bold text-text-primary transition hover:text-accent hover:underline"
                @click="navigateTo(`/eventos/${a.id}`)"
              >
                {{ a.name }}
              </button>
            </td>
            <td class="px-5 py-3.5">
              <button v-if="a.hostId && canViewHosts" type="button"
                class="cursor-pointer text-xs font-medium text-text-muted transition hover:text-accent hover:underline"
                @click="navigateTo(`/anfitriones/${a.hostId}`)">
                {{ a.host || hostName(a.hostId) }}
              </button>
              <span v-else class="text-xs font-medium text-text-muted">
                {{ a.host || hostName(a.hostId) }}
              </span>
            </td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs text-text-secondary">
              {{ eventDateLabel(a) }}
            </td>
            <td class="px-5 py-3.5 whitespace-nowrap font-mono text-xs font-semibold text-accent">
              {{ hhmm(a.startMinutes) }} - {{ hhmm(a.endMinutes) }}
            </td>
            <td class="px-5 py-3.5">
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="bId in a.branchIds"
                  :key="bId"
                  type="button"
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
            <td class="px-5 py-3.5 text-right">
              <button type="button"
                class="cursor-pointer rounded-full border border-stroke bg-base px-2.5 py-0.5 text-[10px] font-bold text-text-muted transition hover:border-accent hover:text-accent"
                @click="openRoomDetail(a)">
                {{ a.room || 'Sala asignada' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!pending && filtered.length === 0" class="py-8 text-center text-xs font-semibold text-text-dim">
        Sin eventos que coincidan con el filtro
      </p>
      <div v-if="filtered.length > 0" class="flex items-center justify-between border-t border-stroke px-5 py-2.5">
        <p class="text-[10px] font-semibold text-text-dim">
          {{ filtered.length }} eventos · página {{ page }} de {{ pageCount }}
        </p>
        <div class="flex gap-1.5">
          <button
            class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-stroke text-text-muted transition hover:border-accent hover:text-accent disabled:opacity-30"
            :disabled="page === 1" @click="page--">
            <ChevronLeft class="h-3.5 w-3.5" />
          </button>
          <button
            class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-stroke text-text-muted transition hover:border-accent hover:text-accent disabled:opacity-30"
            :disabled="page === pageCount" @click="page++">
            <ChevronRight class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
