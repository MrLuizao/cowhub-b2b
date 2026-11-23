<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Layers,
  Plus,
  UserCheck,
  UserX,
} from '@lucide/vue';

import { hostAvatarSrc } from '#shared/host-avatars';
import type { Branch, Host } from '#shared/types';

const { session } = useAuth();
const canViewBranches = computed(() =>
  canAccess(session.value?.role, '/sedes'),
);
/// Alta de integrante del equipo: admin y gerente (la recepción no gestiona personal).
const canCreateHost = computed(
  () => session.value?.role === 'ADMIN' || session.value?.role === 'MANAGER',
);

const branches = ref<Branch[]>([]);
const hosts = ref<Host[]>([]);
const pending = ref(true);
const search = ref('');
const selectedBranch = ref(session.value?.branchId ?? 'todas');
const hostFilter = ref<'todos' | 'ONDUTY' | 'OFFDUTY' | 'MULTI'>('todos');
const page = ref(1);
const pageSize = 8;

onMounted(async () => {
  try {
    const [branchList, hostList] = await Promise.all([
      $api<Branch[]>('/api/branches'),
      $api<Host[]>('/api/hosts'),
    ]);
    branches.value = branchList;
    hosts.value = hostList;
  } finally {
    pending.value = false;
  }
});

const onDutyCount = computed(
  () => hosts.value.filter((h) => h.isOnDuty).length,
);

const offDutyCount = computed(
  () => hosts.value.filter((h) => !h.isOnDuty).length,
);

const multiBranchCount = computed(
  () => hosts.value.filter((h) => h.branchIds.length > 1).length,
);

function branchName(branchId: string): string {
  return branches.value.find((b) => b.id === branchId)?.name ?? branchId;
}

function shiftCls(shift: string): string {
  switch (shift) {
    case 'MAÑANA':
      return 'border-amber-400/30 bg-amber-400/10 text-amber-400';
    case 'NOCHE':
      return 'border-violet-400/30 bg-violet-400/10 text-violet-400';
    default:
      return 'border-accent/30 bg-accent/10 text-accent';
  }
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return hosts.value.filter((h) => {
    if (
      selectedBranch.value !== 'todas' &&
      !h.branchIds.includes(selectedBranch.value)
    ) {
      return false;
    }
    if (hostFilter.value === 'ONDUTY' && !h.isOnDuty) return false;
    if (hostFilter.value === 'OFFDUTY' && h.isOnDuty) return false;
    if (hostFilter.value === 'MULTI' && h.branchIds.length <= 1) return false;
    if (q) {
      const matchName = h.name.toLowerCase().includes(q);
      const matchSpec = (h.specialty || '').toLowerCase().includes(q);
      if (!matchName && !matchSpec) return false;
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

watch([search, selectedBranch, hostFilter], () => {
  page.value = 1;
});

watch(pageCount, (pages) => {
  if (page.value > pages) page.value = pages;
});

function toggleHostFilter(
  key: 'todos' | 'ONDUTY' | 'OFFDUTY' | 'MULTI',
): void {
  hostFilter.value = hostFilter.value === key ? 'todos' : key;
}
</script>

<template>
  <div class="space-y-6">
    <!-- 4 Tarjetas KPI superiores -->
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          hostFilter === 'todos'
            ? 'border-accent bg-accent/10'
            : 'border-stroke bg-surface hover:border-accent/50'
        "
        @click="toggleHostFilter('todos')"
      >
        <div class="flex items-center gap-2">
          <Layers class="h-4 w-4 text-accent" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Todos los anfitriones
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-text-primary">
          {{ hosts.length }}
        </p>
        <p class="text-[10px] font-semibold text-text-dim">
          {{ onDutyCount }} en turno ahora
        </p>
      </button>

      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          hostFilter === 'ONDUTY'
            ? 'border-emerald-400 bg-emerald-400/10'
            : 'border-stroke bg-surface hover:border-emerald-400/50'
        "
        @click="toggleHostFilter('ONDUTY')"
      >
        <div class="flex items-center gap-2">
          <UserCheck class="h-4 w-4 text-emerald-400" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            En turno
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-emerald-400">
          {{ onDutyCount }}
          <span class="text-[11px] font-bold text-text-dim">
            / {{ hosts.length }}
          </span>
        </p>
      </button>

      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          hostFilter === 'OFFDUTY'
            ? 'border-red-400 bg-red-400/10'
            : 'border-stroke bg-surface hover:border-red-400/50'
        "
        @click="toggleHostFilter('OFFDUTY')"
      >
        <div class="flex items-center gap-2">
          <UserX class="h-4 w-4 text-red-400" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Fuera de turno
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-red-400">
          {{ offDutyCount }}
        </p>
      </button>

      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          hostFilter === 'MULTI'
            ? 'border-accent bg-accent/10'
            : 'border-stroke bg-surface hover:border-accent/50'
        "
        @click="toggleHostFilter('MULTI')"
      >
        <div class="flex items-center gap-2">
          <Globe class="h-4 w-4 text-accent" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Multi-sede
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-text-primary">
          {{ multiBranchCount }}
        </p>
      </button>
    </div>

    <!-- Encabezado descriptivo + Filtro por sede -->
    <section>
      <h2
        class="mb-3 text-sm font-black uppercase tracking-widest text-text-muted"
      >
        Equipo de anfitriones, ponentes y coordinación por sede
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

    <!-- Buscador + Contador + Nuevo integrante -->
    <div class="flex items-center gap-4">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Buscar por nombre o especialidad…"
        class="w-full max-w-sm"
        size="lg"
      />
      <span
        class="rounded-full border border-stroke bg-surface px-3 py-1 text-[11px] font-bold text-text-muted"
      >
        {{ filtered.length }} anfitriones
      </span>
      <button
        v-if="canCreateHost"
        class="ml-auto flex cursor-pointer items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-[11px] font-black text-base transition hover:opacity-90"
        @click="navigateTo('/anfitriones/nuevo')"
      >
        <Plus class="h-3.5 w-3.5" />
        Nuevo integrante
      </button>
    </div>

    <!-- Tabla paginada -->
    <div class="overflow-hidden rounded-2xl border border-stroke bg-surface">
      <table class="w-full text-left">
        <thead>
          <tr
            class="border-b border-stroke text-[10px] uppercase tracking-widest text-text-dim"
          >
            <th class="px-5 py-3 font-bold">Anfitrión</th>
            <th class="px-5 py-3 font-bold">Turno</th>
            <th class="px-5 py-3 font-bold">Sede</th>
            <th class="px-5 py-3 text-right font-bold">Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="host in paged"
            :key="host.id"
            class="border-t border-stroke"
          >
            <td class="px-5 py-3">
              <div class="flex items-center gap-3">
                <img
                  v-if="hostAvatarSrc(host.avatar)"
                  :src="hostAvatarSrc(host.avatar)!"
                  :alt="host.name"
                  class="h-10 w-10 shrink-0 rounded-xl border border-stroke object-cover"
                />
                <div
                  v-else
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stroke bg-base text-xs font-black text-accent"
                >
                  {{
                    host.name
                      .split(' ')
                      .slice(0, 2)
                      .map((p) => p[0])
                      .join('')
                  }}
                </div>
                <div class="min-w-0">
                  <button
                    class="cursor-pointer text-xs font-bold text-text-primary transition hover:text-accent hover:underline"
                    @click="navigateTo(`/anfitriones/${host.id}`)"
                  >
                    {{ host.name }}
                  </button>
                  <p class="truncate text-[10px] text-text-dim">
                    {{ host.specialty }}
                  </p>
                </div>
              </div>
            </td>
            <td class="px-5 py-3">
              <span
                class="rounded-full border px-2.5 py-0.5 text-[10px] font-black"
                :class="shiftCls(host.shift)"
              >
                {{ shiftLabel(host.shift) }}
              </span>
            </td>
            <td class="px-5 py-3">
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="bid in host.branchIds"
                  :key="bid"
                  type="button"
                  :disabled="!canViewBranches"
                  class="rounded-full border border-stroke bg-base px-2.5 py-0.5 text-[10px] font-bold text-text-muted transition"
                  :class="
                    canViewBranches
                      ? 'cursor-pointer hover:border-accent hover:text-accent'
                      : 'cursor-default'
                  "
                  @click="canViewBranches && navigateTo(`/sedes/${bid}`)"
                >
                  {{ branchName(bid) }}
                </button>
              </div>
            </td>
            <td class="px-5 py-3 text-right">
              <span
                class="rounded-full border px-2.5 py-0.5 text-[10px] font-black"
                :class="
                  host.isOnDuty
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400'
                    : 'border-red-400/30 bg-red-400/10 text-red-400'
                "
              >
                {{ host.isOnDuty ? 'EN TURNO' : 'FUERA DE TURNO' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p
        v-if="!pending && filtered.length === 0"
        class="py-8 text-center text-xs font-semibold text-text-dim"
      >
        Sin anfitriones que coincidan con el filtro
      </p>
      <div
        v-if="filtered.length > 0"
        class="flex items-center justify-between border-t border-stroke px-5 py-2.5"
      >
        <p class="text-[10px] font-semibold text-text-dim">
          {{ filtered.length }} anfitriones · página {{ page }} de {{ pageCount }}
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
