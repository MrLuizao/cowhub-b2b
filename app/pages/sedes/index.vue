<script setup lang="ts">
import {
  Activity as ActivityIcon,
  Clock,
  DoorClosed,
  DoorOpen,
  Eye,
  Layers,
  MapPin,
  Plus,
} from '@lucide/vue';

import type { Branch, Activity } from '#shared/types';

const { session, canEditBranch } = useAuth();
const isAdmin = computed(() => session.value?.role === 'ADMIN');

const branches = ref<Branch[]>([]);
const activities = ref<Activity[]>([]);
const pending = ref(true);

const branchFilter = ref<'todas' | 'OPEN' | 'CLOSED' | 'busy'>('todas');
const selectedBranch = ref<string>('todas');
const search = ref('');

const confirmOpen = ref(false);
const confirmTitle = ref('');
const confirmDescription = ref('');
const confirmAction = ref<(() => Promise<void>) | null>(null);
const confirming = ref(false);

onMounted(async () => {
  try {
    const [branchList, activityList] = await Promise.all([
      $api<Branch[]>('/api/branches'),
      $api<Activity[]>('/api/activities'),
    ]);
    branches.value = branchList;
    activities.value = activityList;
  } finally {
    pending.value = false;
  }
});

const openCount = computed(
  () => branches.value.filter((b) => b.status === 'OPEN').length,
);

const totalCurrent = computed(() =>
  branches.value.reduce((sum, b) => sum + b.currentCapacity, 0),
);

const globalOccupancy = computed(() => {
  const max = branches.value.reduce((sum, b) => sum + b.maxCapacity, 0);
  return max > 0 ? Math.round((totalCurrent.value / max) * 100) : 0;
});

const busyCount = computed(
  () => branches.value.filter((b) => occupancy(b) > 0.8).length,
);

const closedCount = computed(
  () => branches.value.filter((b) => b.status === 'CLOSED').length,
);

const filteredBranches = computed(() => {
  const q = search.value.trim().toLowerCase();
  return branches.value.filter((b) => {
    if (selectedBranch.value !== 'todas' && b.id !== selectedBranch.value) {
      return false;
    }
    if (branchFilter.value === 'OPEN' && b.status !== 'OPEN') return false;
    if (branchFilter.value === 'CLOSED' && b.status !== 'CLOSED') return false;
    if (branchFilter.value === 'busy' && occupancy(b) <= 0.8) return false;
    if (q) {
      const matchName = b.name.toLowerCase().includes(q);
      const matchAddress = (b.address || '').toLowerCase().includes(q);
      if (!matchName && !matchAddress) return false;
    }
    return true;
  });
});

function toggleBranchFilter(
  key: 'todas' | 'OPEN' | 'CLOSED' | 'busy',
): void {
  branchFilter.value = branchFilter.value === key ? 'todas' : key;
}

function occupancy(branch: Branch): number {
  return branch.maxCapacity > 0
    ? branch.currentCapacity / branch.maxCapacity
    : 0;
}

function barColor(ratio: number): string {
  if (ratio < 0.5) return 'bg-emerald-400';
  if (ratio <= 0.8) return 'bg-amber-400';
  return 'bg-red-400';
}

function occupancyCls(ratio: number): string {
  if (ratio < 0.5)
    return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400';
  if (ratio <= 0.8)
    return 'border-amber-400/30 bg-amber-400/10 text-amber-400';
  return 'border-red-400/30 bg-red-400/10 text-red-400';
}

function activitiesAt(branchId: string): number {
  return activities.value.filter((c) => c.branchIds.includes(branchId)).length;
}

function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function askConfirm(
  title: string,
  description: string,
  action: () => Promise<void>,
): void {
  confirmTitle.value = title;
  confirmDescription.value = description;
  confirmAction.value = action;
  confirmOpen.value = true;
}

async function runConfirm(): Promise<void> {
  if (!confirmAction.value || confirming.value) return;
  confirming.value = true;
  try {
    await confirmAction.value();
    confirmOpen.value = false;
  } finally {
    confirming.value = false;
  }
}

function toggleBranchStatus(branch: Branch): void {
  const next: Branch['status'] =
    branch.status === 'OPEN' ? 'CLOSED' : 'OPEN';
  askConfirm(
    next === 'CLOSED'
      ? `Cerrar la sede ${branch.name}`
      : `Abrir la sede ${branch.name}`,
    next === 'CLOSED'
      ? 'La sede se cerrará al público - los miembros no podrán hacer acceso hasta reabrirla.'
      : 'La sede se abrirá al público y los miembros podrán hacer acceso.',
    async () => {
      const updated = await $api<Branch>(`/api/branches/${branch.id}`, {
        method: 'PUT',
        body: { status: next },
      });
      const index = branches.value.findIndex((b) => b.id === branch.id);
      if (index !== -1) branches.value[index] = updated;
    },
  );
}
</script>

<template>
  <div class="space-y-6">
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          branchFilter === 'todas'
            ? 'border-accent bg-accent/10'
            : 'border-stroke bg-surface hover:border-accent/50'
        "
        @click="toggleBranchFilter('todas')"
      >
        <div class="flex items-center gap-2">
          <Layers class="h-4 w-4 text-accent" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Todas las sedes
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-text-primary">
          {{ branches.length }}
        </p>
        <p class="text-[10px] font-semibold text-text-dim">
          {{ totalCurrent }} personas · {{ globalOccupancy }}% ocupación
        </p>
      </button>
      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          branchFilter === 'OPEN'
            ? 'border-emerald-400 bg-emerald-400/10'
            : 'border-stroke bg-surface hover:border-emerald-400/50'
        "
        @click="toggleBranchFilter('OPEN')"
      >
        <div class="flex items-center gap-2">
          <DoorOpen class="h-4 w-4 text-emerald-400" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Abiertas
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-emerald-400">
          {{ openCount }}
        </p>
      </button>
      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          branchFilter === 'CLOSED'
            ? 'border-red-400 bg-red-400/10'
            : 'border-stroke bg-surface hover:border-red-400/50'
        "
        @click="toggleBranchFilter('CLOSED')"
      >
        <div class="flex items-center gap-2">
          <DoorClosed class="h-4 w-4 text-red-400" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Cerradas
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-red-400">
          {{ closedCount }}
        </p>
      </button>
      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          branchFilter === 'busy'
            ? 'border-amber-400 bg-amber-400/10'
            : 'border-stroke bg-surface hover:border-amber-400/50'
        "
        @click="toggleBranchFilter('busy')"
      >
        <div class="flex items-center gap-2">
          <ActivityIcon class="h-4 w-4 text-amber-400" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Ocupación alta
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-amber-400">
          {{ busyCount }}
        </p>
        <p class="text-[10px] font-semibold text-text-dim">
          &gt;80% de ocupación
        </p>
      </button>
    </div>

    <!-- Filtro por sede + descripción -->
    <section>
      <h2
        class="mb-3 text-sm font-black uppercase tracking-widest text-text-muted"
      >
        Red de sucursales y vista de aforo en tiempo real
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

    <!-- Buscador + Contador + Nueva sede -->
    <div class="flex items-center gap-4">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Buscar por nombre o dirección…"
        class="w-full max-w-sm"
        size="lg"
      />
      <span
        class="rounded-full border border-stroke bg-surface px-3 py-1 text-[11px] font-bold text-text-muted"
      >
        {{ filteredBranches.length }} sedes
      </span>
      <button
        v-if="isAdmin"
        class="ml-auto flex cursor-pointer items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-[11px] font-black text-base transition hover:opacity-90"
        @click="navigateTo('/sedes/nuevo')"
      >
        <Plus class="h-3.5 w-3.5" />
        Nueva sede
      </button>
    </div>

    <section>
      <div
        v-if="!pending && filteredBranches.length === 0"
        class="rounded-2xl border border-stroke bg-surface p-12 text-center"
      >
        <MapPin class="mx-auto h-12 w-12 text-text-muted/60" />
        <h3 class="mt-4 text-base font-semibold text-white">
          {{
            branchFilter === 'todas'
              ? 'Sin sedes registradas'
              : 'Sin sedes en este filtro'
          }}
        </h3>
        <p class="mt-1 text-xs text-text-muted">
          No hay sucursales que coincidan con el filtro seleccionado.
        </p>
      </div>

      <div v-else class="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="branch in filteredBranches"
          :key="branch.id"
          class="group flex flex-col overflow-hidden rounded-2xl border border-stroke bg-surface transition hover:border-accent/40"
        >
          <!-- Cabecera de foto y badges superiores -->
          <div class="relative h-48 w-full overflow-hidden bg-base">
            <img
              :src="branch.imageUrl || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&q=80'"
              :alt="branch.name"
              class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              loading="lazy"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-base via-transparent to-black/40" />

            <!-- Badge Estado (Abierta / Cerrada) -->
            <div class="absolute top-3 left-3">
              <span
                class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold backdrop-blur-md"
                :class="
                  branch.status === 'OPEN'
                    ? 'border-emerald-400/30 bg-emerald-950/60 text-emerald-400'
                    : 'border-red-500/30 bg-red-950/60 text-red-400'
                "
              >
                <span
                  class="h-2 w-2 rounded-full"
                  :class="branch.status === 'OPEN' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'"
                />
                {{ branch.status === 'OPEN' ? 'Abierta' : 'Cerrada' }}
              </span>
            </div>

          </div>

          <!-- Contenido de la sede -->
          <div class="flex flex-1 flex-col p-5">
            <!-- Pills de atributos debajo de la foto -->
            <div class="mb-3 flex flex-wrap gap-2">
              <span class="inline-flex items-center gap-1.5 rounded-md border border-stroke bg-surface-elevated px-2.5 py-1 text-xs text-text-secondary">
                {{ activitiesAt(branch.id) }} eventos programados
              </span>
              <span class="inline-flex items-center gap-1.5 rounded-md border border-stroke bg-surface-elevated px-2.5 py-1 text-xs text-text-secondary">
                <Clock class="h-3.5 w-3.5 text-accent" />
                {{ toTime(branch.openMinutes) }} - {{ toTime(branch.closeMinutes) }}
              </span>
              <span
                v-if="occupancy(branch) > 0.8"
                class="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400"
              >
                Ocupación alta
              </span>
            </div>

            <div>
              <button
                type="button"
                class="cursor-pointer text-left text-base font-bold text-white transition group-hover:text-accent hover:underline"
                @click="navigateTo(`/sedes/${branch.id}`)"
              >
                {{ branch.name }}
              </button>
              <p class="mt-1 flex items-center gap-1.5 text-xs text-text-dim">
                <MapPin class="h-3.5 w-3.5 text-accent shrink-0" />
                <span class="truncate">{{ branch.address || 'Sin dirección registrada' }}</span>
              </p>
            </div>

            <!-- Barra de progreso de aforo en vivo -->
            <div class="mt-4 space-y-1.5">
              <div class="flex items-center justify-between text-xs text-text-muted">
                <span>Ocupación actual</span>
                <span class="font-semibold text-white">
                  {{ branch.currentCapacity }} / {{ branch.maxCapacity }} presentes
                </span>
              </div>
              <div class="h-2 w-full overflow-hidden rounded-full bg-base border border-stroke/40">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="barColor(occupancy(branch))"
                  :style="{
                    width: `${Math.min(100, Math.round(occupancy(branch) * 100))}%`,
                  }"
                />
              </div>
            </div>

            <!-- Footer con acciones -->
            <div class="mt-auto pt-5 flex items-center justify-end border-t border-stroke/50 gap-2">
              <NuxtLink
                :to="`/sedes/${branch.id}`"
                class="inline-flex items-center gap-1.5 rounded-lg border border-stroke bg-surface-elevated px-3 py-1.5 text-xs font-medium text-white transition hover:border-accent hover:text-accent cursor-pointer"
              >
                <Eye class="h-3.5 w-3.5" />
                Ver detalle
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </section>

    <UModal
      v-model:open="confirmOpen"
      :title="confirmTitle"
      :description="confirmDescription"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="outline"
            @click="confirmOpen = false"
          />
          <UButton
            label="Confirmar"
            :loading="confirming"
            @click="runConfirm"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
