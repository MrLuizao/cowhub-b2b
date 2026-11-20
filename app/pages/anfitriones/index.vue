<script setup lang="ts">
import { Plus } from '@lucide/vue';

import { hostAvatarSrc } from '#shared/host-avatars';
import type { Branch, Host } from '#shared/types';

const { session, isAtMyBranch } = useAuth();
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

function branchName(branchId: string): string {
  return branches.value.find((b) => b.id === branchId)?.name ?? '-';
}

function shiftMeta(shift: string): string {
  switch (shift) {
    case 'MAÑANA':
      return 'border-amber-400/30 bg-amber-400/10 text-amber-400';
    case 'NOCHE':
      return 'border-violet-400/30 bg-violet-400/10 text-violet-400';
    default:
      return 'border-accent/30 bg-accent/10 text-accent';
  }
}

const dutyModalOpen = ref(false);
const hostToToggle = ref<Host | null>(null);
const togglingDuty = ref(false);

const dutyDescription = computed(() => {
  const t = hostToToggle.value;
  if (!t) return '';
  return t.isOnDuty
    ? `${t.name} se marcará como fuera de turno y dejará de aparecer como disponible en la app.`
    : `${t.name} se marcará en turno y aparecerá como disponible en la app.`;
});

function confirmToggleDuty(host: Host): void {
  hostToToggle.value = host;
  dutyModalOpen.value = true;
}

async function runToggleDuty(): Promise<void> {
  const t = hostToToggle.value;
  if (!t || togglingDuty.value) return;
  togglingDuty.value = true;
  try {
    const updated = await $api<Host>(`/api/hosts/${t.id}/duty`, {
      method: 'POST',
    });
    const index = hosts.value.findIndex((x) => x.id === t.id);
    if (index !== -1) hosts.value[index] = updated;
    dutyModalOpen.value = false;
    hostToToggle.value = null;
  } finally {
    togglingDuty.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <p class="text-xs font-semibold text-text-dim">
        Activa o desactiva el turno de cada anfitrión - se refleja al instante
        en la app móvil.
      </p>
      <button
        v-if="canCreateHost"
        class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-[11px] font-black text-base transition hover:opacity-90"
        @click="navigateTo('/anfitriones/nuevo')"
      >
        <Plus class="h-3.5 w-3.5" />
        Nuevo integrante
      </button>
    </div>

    <div
      v-if="pending"
      class="rounded-2xl border border-stroke bg-surface p-8 text-center text-xs font-semibold text-text-dim"
    >
      Cargando equipo…
    </div>

    <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="host in hosts"
        :key="host.id"
        class="rounded-2xl border border-stroke bg-surface p-5"
      >
        <div class="flex items-center gap-4">
          <img
            v-if="hostAvatarSrc(host.avatar)"
            :src="hostAvatarSrc(host.avatar)!"
            :alt="host.name"
            class="h-14 w-14 rounded-2xl border border-stroke object-cover"
          />
          <div
            v-else
            class="flex h-14 w-14 items-center justify-center rounded-2xl border border-stroke bg-base text-sm font-black text-accent"
          >
            {{
              host.name
                .split(' ')
                .slice(0, 2)
                .map((p) => p[0])
                .join('')
            }}
          </div>
          <div class="min-w-0 flex-1">
            <button
              class="cursor-pointer truncate text-left text-sm font-black text-text-primary transition hover:text-accent hover:underline"
              @click="navigateTo(`/anfitriones/${host.id}`)"
            >
              {{ host.name }}
            </button>
            <p class="truncate text-[11px] text-text-dim">
              {{ host.specialty }}
            </p>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between">
          <span
            class="rounded-full border px-2.5 py-0.5 text-[10px] font-black"
            :class="
              host.shift === 'MAÑANA'
                ? 'border-amber-400/30 bg-amber-400/10 text-amber-400'
                : host.shift === 'NOCHE'
                  ? 'border-violet-400/30 bg-violet-400/10 text-violet-400'
                  : 'border-accent/30 bg-accent/10 text-accent'
            "
          >
            {{ shiftLabel(host.shift) }}
          </span>
          <div class="flex max-w-[55%] flex-wrap justify-end gap-1">
            <button
              v-for="bid in host.branchIds"
              :key="bid"
              type="button"
              :disabled="!canViewBranches"
              class="rounded-full border border-stroke bg-base px-2 py-0.5 text-[9px] font-bold text-text-dim transition"
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
        </div>

        <div
          class="mt-4 flex items-center justify-between border-t border-stroke pt-3"
        >
          <span class="text-[11px] font-bold text-text-muted">En turno</span>
          <button
            :disabled="!isAtMyBranch(host.branchIds)"
            class="relative h-6 w-11 rounded-full transition disabled:cursor-not-allowed disabled:opacity-60"
            :class="
              host.isOnDuty ? 'bg-accent' : 'bg-base border border-stroke'
            "
            :title="
              host.isOnDuty
                ? 'Marcar como fuera de turno'
                : 'Marcar en turno'
            "
            @click="
              isAtMyBranch(host.branchIds) &&
              confirmToggleDuty(host)
            "
          >
            <span
              class="absolute top-0.5 h-5 w-5 rounded-full transition-all"
              :class="
                host.isOnDuty
                  ? 'left-[22px] bg-base'
                  : 'left-0.5 bg-white'
              "
            />
          </button>
        </div>
      </div>
    </div>

    <UModal
      v-model:open="dutyModalOpen"
      title="Cambiar estado de turno"
      :description="dutyDescription"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="outline"
            @click="dutyModalOpen = false"
          />
          <UButton
            :label="
              hostToToggle?.isOnDuty
                ? 'Marcar fuera de turno'
                : 'Marcar en turno'
            "
            :color="hostToToggle?.isOnDuty ? 'warning' : 'primary'"
            :loading="togglingDuty"
            @click="runToggleDuty"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
