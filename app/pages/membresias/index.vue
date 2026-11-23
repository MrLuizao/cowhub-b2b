<script setup lang="ts">
import {
  Check,
  CreditCard,
  Eye,
  Globe,
  Layers,
  MapPin,
  Plus,
  Sparkles,
  Users,
} from '@lucide/vue';

import type { MemberAdmin, MembershipPlan } from '#shared/types';

const { session } = useAuth();
/// Los planes y sus precios son datos globales - solo el admin los crea/edita.
const isAdmin = computed(() => session.value?.role === 'ADMIN');

const plans = ref<MembershipPlan[]>([]);
const members = ref<MemberAdmin[]>([]);
const pending = ref(true);
const search = ref('');
const planFilter = ref<'todos' | 'MULTI' | 'SINGLE' | 'HIGHLIGHT'>('todos');

onMounted(async () => {
  try {
    const [planList, memberList] = await Promise.all([
      $api<MembershipPlan[]>('/api/plans'),
      $api<MemberAdmin[]>('/api/members'),
    ]);
    plans.value = planList;
    members.value = memberList;
  } finally {
    pending.value = false;
  }
});

function membersOnPlan(plan: MembershipPlan): number {
  return members.value.filter(
    (m) => m.membershipPlanId === plan.id || m.membershipType === plan.name,
  ).length;
}

function planRevenue(plan: MembershipPlan): number {
  return membersOnPlan(plan) * plan.price;
}

function planImage(plan: MembershipPlan): string {
  const n = plan.name.toLowerCase();
  if (n.includes('oficina') || plan.price >= 10000) {
    return 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200&q=80';
  }
  if (n.includes('cowork') || plan.highlight) {
    return 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80';
  }
  return 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200&q=80';
}

const totalMembers = computed(() =>
  plans.value.reduce((sum, p) => sum + membersOnPlan(p), 0),
);

const totalRevenue = computed(() =>
  plans.value.reduce((sum, p) => sum + planRevenue(p), 0),
);

const multiBranchCount = computed(
  () => plans.value.filter((p) => p.allBranches).length,
);

const singleBranchCount = computed(
  () => plans.value.filter((p) => !p.allBranches).length,
);

const highlightCount = computed(
  () => plans.value.filter((p) => p.highlight).length,
);

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return [...plans.value]
    .sort((a, b) => a.price - b.price)
    .filter((p) => {
      if (planFilter.value === 'MULTI' && !p.allBranches) return false;
      if (planFilter.value === 'SINGLE' && p.allBranches) return false;
      if (planFilter.value === 'HIGHLIGHT' && !p.highlight) return false;
      if (q) {
        const matchName = p.name.toLowerCase().includes(q);
        const matchFeat = p.features?.some((f) =>
          f.toLowerCase().includes(q),
        );
        if (!matchName && !matchFeat) return false;
      }
      return true;
    });
});

function togglePlanFilter(
  key: 'todos' | 'MULTI' | 'SINGLE' | 'HIGHLIGHT',
): void {
  planFilter.value = planFilter.value === key ? 'todos' : key;
}
</script>

<template>
  <div class="space-y-6">
    <!-- 4 Tarjetas KPI superiores -->
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          planFilter === 'todos'
            ? 'border-accent bg-accent/10'
            : 'border-stroke bg-surface hover:border-accent/50'
        "
        @click="togglePlanFilter('todos')"
      >
        <div class="flex items-center gap-2">
          <Layers class="h-4 w-4 text-accent" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Todos los planes
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-text-primary">
          {{ plans.length }}
        </p>
        <p class="text-[10px] font-semibold text-text-dim">
          {{ totalMembers }} miembros · $ {{ totalRevenue }}/mes
        </p>
      </button>

      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          planFilter === 'MULTI'
            ? 'border-emerald-400 bg-emerald-400/10'
            : 'border-stroke bg-surface hover:border-emerald-400/50'
        "
        @click="togglePlanFilter('MULTI')"
      >
        <div class="flex items-center gap-2">
          <Globe class="h-4 w-4 text-emerald-400" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Multi-sede
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-emerald-400">
          {{ multiBranchCount }}
        </p>
      </button>

      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          planFilter === 'SINGLE'
            ? 'border-accent bg-accent/10'
            : 'border-stroke bg-surface hover:border-accent/50'
        "
        @click="togglePlanFilter('SINGLE')"
      >
        <div class="flex items-center gap-2">
          <MapPin class="h-4 w-4 text-accent" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Sede única
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-text-primary">
          {{ singleBranchCount }}
        </p>
      </button>

      <button
        class="cursor-pointer rounded-2xl border p-4 text-left transition"
        :class="
          planFilter === 'HIGHLIGHT'
            ? 'border-amber-400 bg-amber-400/10'
            : 'border-stroke bg-surface hover:border-amber-400/50'
        "
        @click="togglePlanFilter('HIGHLIGHT')"
      >
        <div class="flex items-center gap-2">
          <Sparkles class="h-4 w-4 text-amber-400" />
          <p
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Destacados
          </p>
        </div>
        <p class="mt-2 text-xl font-black text-amber-400">
          {{ highlightCount }}
        </p>
      </button>
    </div>

    <!-- Encabezado descriptivo -->
    <section>
      <h2
        class="text-sm font-black uppercase tracking-widest text-text-muted"
      >
        Catálogo global de planes de membresía y tarifas mensuales
      </h2>
    </section>

    <!-- Buscador + Contador + Nueva membresía -->
    <div class="flex items-center gap-4">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Buscar por nombre o beneficio…"
        class="w-full max-w-sm"
        size="lg"
      />
      <span
        class="rounded-full border border-stroke bg-surface px-3 py-1 text-[11px] font-bold text-text-muted"
      >
        {{ filtered.length }} membresías
      </span>
      <button
        v-if="isAdmin"
        class="ml-auto flex cursor-pointer items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-[11px] font-black text-base transition hover:opacity-90"
        @click="navigateTo('/membresias/nuevo')"
      >
        <Plus class="h-3.5 w-3.5" />
        Nueva membresía
      </button>
    </div>

    <!-- Grid de Tarjetas de Membresías (igual que /sedes) -->
    <section>
      <div
        v-if="!pending && filtered.length === 0"
        class="rounded-2xl border border-stroke bg-surface p-12 text-center"
      >
        <CreditCard class="mx-auto h-12 w-12 text-text-muted/60" />
        <h3 class="mt-4 text-base font-semibold text-white">
          Sin planes en este filtro
        </h3>
        <p class="mt-1 text-xs text-text-muted">
          No hay membresías que coincidan con el filtro o la búsqueda.
        </p>
      </div>

      <div v-else class="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="plan in filtered"
          :key="plan.id"
          class="group flex flex-col overflow-hidden rounded-2xl border border-stroke bg-surface transition hover:border-accent/40"
        >
          <!-- Cabecera de foto y badges superiores -->
          <div class="relative h-48 w-full overflow-hidden bg-base">
            <img
              :src="planImage(plan)"
              :alt="plan.name"
              class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              loading="lazy"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-base via-transparent to-black/40" />

            <!-- Badge Alcance (Multi-sede / Sede de registro) -->
            <div class="absolute top-3 left-3">
              <span
                class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold backdrop-blur-md"
                :class="
                  plan.allBranches
                    ? 'border-emerald-400/30 bg-emerald-950/60 text-emerald-400'
                    : 'border-white/10 bg-black/60 text-white'
                "
              >
                <span
                  class="h-2 w-2 rounded-full"
                  :class="plan.allBranches ? 'bg-emerald-400 animate-pulse' : 'bg-accent'"
                />
                {{ plan.allBranches ? 'Todas las sedes' : 'Sede de registro' }}
              </span>
            </div>

            <!-- Badge Precio y Destacado -->
            <div class="absolute top-3 right-3 flex items-center gap-1.5">
              <span
                v-if="plan.highlight"
                title="Plan destacado"
                class="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-950/60 text-amber-400 backdrop-blur-md"
              >
                <Sparkles class="h-3.5 w-3.5" />
              </span>
              <span class="rounded-lg border border-accent/30 bg-black/70 px-2.5 py-1 text-xs font-black text-accent backdrop-blur-md">
                $ {{ plan.price }} / mes
              </span>
            </div>
          </div>

          <!-- Contenido del plan -->
          <div class="flex flex-1 flex-col p-5">
            <!-- Badges de atributos debajo de la foto -->
            <div class="mb-3 flex flex-wrap gap-2">
              <span class="inline-flex items-center gap-1.5 rounded-md border border-stroke bg-surface-elevated px-2.5 py-1 text-xs text-text-secondary">
                <Users class="h-3.5 w-3.5 text-accent" />
                {{ membersOnPlan(plan) }} miembros
              </span>
              <span class="inline-flex items-center gap-1.5 rounded-md border border-stroke bg-surface-elevated px-2.5 py-1 text-xs text-text-secondary">
                $ {{ planRevenue(plan) }} / mes
              </span>
            </div>

            <div>
              <button
                type="button"
                class="cursor-pointer text-left text-base font-bold text-white transition group-hover:text-accent hover:underline"
                @click="navigateTo(`/membresias/${plan.id}`)"
              >
                {{ plan.name }}
              </button>
              <p class="mt-1 flex items-center gap-1.5 text-xs text-text-dim">
                <component :is="plan.allBranches ? Globe : MapPin" class="h-3.5 w-3.5 text-accent shrink-0" />
                <span class="truncate">
                  {{ plan.allBranches ? 'Acceso ilimitado a todas las sucursales' : 'Acceso exclusivo a la sucursal de registro' }}
                </span>
              </p>
            </div>

            <!-- Lista de beneficios -->
            <ul v-if="plan.features?.length" class="mt-4 space-y-1.5">
              <li
                v-for="feature in plan.features.slice(0, 4)"
                :key="feature"
                class="flex items-start gap-2 text-xs text-text-muted"
              >
                <Check class="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span class="line-clamp-1">{{ feature }}</span>
              </li>
            </ul>

            <!-- Footer con botón Ver detalle -->
            <div class="mt-auto pt-5 flex items-center justify-end border-t border-stroke/50 gap-2">
              <NuxtLink
                :to="`/membresias/${plan.id}`"
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
  </div>
</template>
