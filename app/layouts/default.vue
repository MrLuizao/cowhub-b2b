<script setup lang="ts">
import {
  BarChart3,
  Bell,
  Brain,
  Building2,
  CalendarClock,
  CalendarDays,
  CreditCard,
  Gift,
  Handshake,
  LayoutDashboard,
  LogOut,
  MapPin,
  Medal,
  Megaphone,
  MessageCircle,
  Moon,
  ScanLine,
  Sun,
  Users,
  X,
} from '@lucide/vue';
import type { Component } from 'vue';
import type { Branch } from '#shared/types';
import type { StaffRole } from '~/composables/useAuth';

const route = useRoute();
const { session, logout, setActiveBranch } = useAuth();
const { isDark, setTheme } = useTheme();
const { unreadCount, lastAlert, start, dismissAlert } = useSupportUnread();
const {
  pendingCount: agendaPendingCount,
  lastAlert: agendaAlert,
  start: startAgendaAlerts,
  dismissAlert: dismissAgendaAlert,
} = useWebAgendaAlerts();

const logoutConfirmOpen = ref(false);
/// Wipe de salida - espejo del login: el panel oscuro entra desde la
/// derecha, cubre la app y debajo se navega a /login.
const signingOut = ref(false);

async function confirmLogout(): Promise<void> {
  logoutConfirmOpen.value = false;
  signingOut.value = true;
  await new Promise((r) => setTimeout(r, 700));
  await logout();
}

/// Selector de sede activa en el header para admin global.
const adminBranches = ref<Branch[]>([]);
const isAdmin = computed(() => session.value?.role === 'ADMIN');

async function loadAdminBranches(): Promise<void> {
  if (!isAdmin.value || adminBranches.value.length > 0) return;
  try {
    adminBranches.value = await $api<Branch[]>('/api/branches');
  } catch {
    adminBranches.value = [];
  }
}

function onAdminBranchChange(event: Event): void {
  const id = (event.target as HTMLSelectElement).value;
  if (!id) {
    setActiveBranch(null, null);
    return;
  }
  const found = adminBranches.value.find((b) => b.id === id);
  setActiveBranch(id, found?.name ?? id);
}

type NavItem = {
  to: string;
  label: string;
  icon: Component;
  roles: StaffRole[];
};

const navGroups: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      {
        to: '/',
        label: 'Dashboard',
        icon: LayoutDashboard,
        roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'],
      },
      {
        to: '/recepcion',
        label: 'Recepción',
        icon: ScanLine,
        roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'],
      },
      {
        to: '/agenda-web',
        label: 'Agenda web',
        icon: CalendarClock,
        roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'],
      },
      {
        to: '/soporte',
        label: 'Chat en vivo',
        icon: MessageCircle,
        roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'],
      },
    ],
  },
  {
    label: 'Operación',
    items: [
      {
        to: '/sedes',
        label: 'Sedes',
        icon: MapPin,
        roles: ['ADMIN', 'MANAGER'],
      },
      {
        to: '/salas',
        label: 'Salas',
        icon: Building2,
        roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'],
      },
      {
        to: '/eventos',
        label: 'Eventos',
        icon: CalendarDays,
        roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'],
      },
      {
        to: '/anfitriones',
        label: 'Anfitriones',
        icon: Medal,
        roles: ['ADMIN', 'MANAGER'],
      },
    ],
  },
  {
    label: 'Miembros',
    items: [
      {
        to: '/miembros',
        label: 'Miembros',
        icon: Users,
        roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'],
      },
      {
        to: '/membresias',
        label: 'Membresías',
        icon: CreditCard,
        // Recepción ve el catálogo (read-only) para cotizar altas.
        roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'],
      },
      {
        to: '/recompensas',
        label: 'Recompensas',
        icon: Gift,
        roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'],
      },
      {
        to: '/retencion',
        label: 'Retención IA',
        icon: Brain,
        roles: ['ADMIN', 'MANAGER'],
      },
    ],
  },
  {
    label: 'Comercial',
    items: [
      {
        to: '/publicidad',
        label: 'Publicidad',
        icon: Handshake,
        roles: ['ADMIN', 'MANAGER'],
      },
      {
        to: '/cms',
        label: 'CMS & Push',
        icon: Megaphone,
        roles: ['ADMIN', 'MANAGER'],
      },
      {
        to: '/reportes',
        label: 'Reportes',
        icon: BarChart3,
        roles: ['ADMIN', 'MANAGER'],
      },
    ],
  },
];

const runtimeConfig = useRuntimeConfig();

const visibleGroups = computed(() =>
  navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        // Módulo de Retención: solo visible si el programador lo activó para este cliente
        if (item.to === '/retencion' && !runtimeConfig.public.features?.churnRetention) {
          return false;
        }
        return item.roles.includes(session.value?.role ?? 'RECEPTIONIST');
      }),
    }))
    .filter((group) => group.items.length > 0),
);

const navItems = navGroups.flatMap((group) => group.items);

const pageTitle = computed(() => {
  const item = navItems.find(
    (item) =>
      route.path === item.to ||
      (item.to !== '/' && route.path.startsWith(`${item.to}/`)),
  );
  return item?.label ?? 'COW-HUB';
});

onMounted(() => {
  // Listener global de mensajes de soporte - vive mientras la sesión
  // esté activa, alimenta el badge del menú y el toast de alerta.
  start();
  startAgendaAlerts();
  loadAdminBranches();
});

watch(isAdmin, (admin) => {
  if (admin) loadAdminBranches();
});
</script>

<template>
  <div class="min-h-screen bg-base">
    <aside
      class="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-stroke bg-sidebar md:flex"
    >
      <div class="px-6 pb-4 pt-6">
        <NuxtLink to="/" class="group block">
          <CowhubLogo size="md" :show-tagline="false" />
        </NuxtLink>
      </div>

      <nav class="flex-1 space-y-6 overflow-y-auto px-4 py-4">
        <div v-for="group in visibleGroups" :key="group.label ?? 'main'">
          <p
            v-if="group.label"
            class="mb-2 px-3 text-[11px] font-medium text-text-dim"
          >
            {{ group.label }}
          </p>
          <div class="space-y-1">
            <NuxtLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-3 rounded-full px-3.5 py-2.5 text-sm font-medium transition-colors"
              :class="
                route.path === item.to ||
                (item.to !== '/' && route.path.startsWith(`${item.to}/`))
                  ? 'bg-surface-elevated text-text-primary'
                  : 'text-text-muted hover:bg-surface-elevated/70 hover:text-text-primary'
              "
            >
              <component
                :is="item.icon"
                class="h-[18px] w-[18px] shrink-0"
                :class="
                  route.path === item.to ||
                  (item.to !== '/' && route.path.startsWith(`${item.to}/`))
                    ? 'text-text-primary'
                    : 'text-text-muted'
                "
              />
              <span class="truncate">{{ item.label }}</span>
              <span
                v-if="item.to === '/soporte' && unreadCount > 0"
                class="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-pastel-pink px-1.5 text-[10px] font-bold text-[#141318]"
              >
                {{ unreadCount }}
              </span>
              <span
                v-if="item.to === '/agenda-web' && agendaPendingCount > 0"
                class="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-base"
              >
                {{ agendaPendingCount }}
              </span>
            </NuxtLink>
          </div>
        </div>
      </nav>

      <div class="border-t border-stroke px-4 py-4">
        <div class="flex items-center gap-3">
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stroke bg-surface-elevated text-[11px] font-semibold text-accent"
          >
            {{ (session?.name ?? 'ST').slice(0, 2).toUpperCase() }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-medium text-text-primary">
              {{ session?.name }}
            </p>
            <p class="truncate text-[11px] text-text-dim">
              {{ session?.email }}
            </p>
          </div>
          <button
            class="rounded-full p-1.5 text-text-dim transition hover:bg-surface-elevated hover:text-text-primary"
            title="Cerrar sesión"
            @click="logoutConfirmOpen = true"
          >
            <LogOut class="h-4 w-4" />
          </button>
        </div>
        <NuxtLink
          to="/legal/aviso-privacidad"
          class="mt-3 block text-center text-[11px] text-text-dim transition hover:text-text-primary"
        >
          Aviso de privacidad
        </NuxtLink>
        <a
          href="https://foundry-landing-pi.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          class="group mt-3 flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-stroke bg-surface/60 px-3 py-2.5 transition duration-300 hover:border-[#ff6b00]/70 hover:bg-surface-elevated"
        >
          <span class="text-[9px] font-bold uppercase tracking-[0.22em] text-text-muted transition group-hover:text-white">
            Desarrollado por
          </span>
          <img
            src="/brand/fundere-original-dark.png"
            alt="FUNDERE Software Studio"
            class="h-6 w-auto object-contain mix-blend-screen transition duration-300 group-hover:scale-105"
          />
        </a>
      </div>
    </aside>

    <div class="flowdesk-canvas flex min-h-screen flex-col md:pl-60">
      <header
        class="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-stroke/80 bg-base/85 px-6 backdrop-blur-md lg:px-8"
      >
        <h1 class="text-lg font-medium tracking-tight text-white">{{ pageTitle }}</h1>
        <div class="ml-auto flex items-center gap-3">
          <div
            v-if="isAdmin"
            class="flex items-center gap-2 rounded-full border border-stroke bg-surface px-3 py-1.5 transition hover:border-white/15"
          >
            <MapPin class="h-3.5 w-3.5 shrink-0 text-accent" />
            <select
              aria-label="Seleccionar sede activa"
              :value="session?.branchId ?? ''"
              class="cursor-pointer bg-transparent pr-1 text-xs font-medium text-text-primary outline-none"
              @change="onAdminBranchChange"
            >
              <option value="" class="bg-surface text-text-primary">Todas las sedes</option>
              <option
                v-for="b in adminBranches"
                :key="b.id"
                :value="b.id"
                class="bg-surface text-text-primary"
              >
                {{ b.name }}
              </option>
            </select>
          </div>
          <div
            class="flex items-center rounded-full border border-stroke bg-surface p-0.5"
            role="group"
            aria-label="Selector de tema"
          >
            <button
              type="button"
              class="flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
              :class="
                !isDark
                  ? 'bg-surface-elevated text-text-primary'
                  : 'text-text-dim hover:text-text-primary'
              "
              title="Tema claro"
              @click="setTheme('light')"
            >
              <Sun class="h-3.5 w-3.5" />
              <span class="hidden sm:inline">Claro</span>
            </button>
            <button
              type="button"
              class="flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
              :class="
                isDark
                  ? 'bg-surface-elevated text-text-primary'
                  : 'text-text-dim hover:text-text-primary'
              "
              title="Tema oscuro"
              @click="setTheme('dark')"
            >
              <Moon class="h-3.5 w-3.5" />
              <span class="hidden sm:inline">Oscuro</span>
            </button>
          </div>
        </div>
      </header>

      <main class="flex-1 px-6 py-6 lg:px-8">
        <slot />
      </main>
    </div>

    <UModal
      v-model:open="logoutConfirmOpen"
      title="Cerrar sesión"
      description="Saldrás del panel y tendrás que ingresar tus credenciales de nuevo."
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="outline"
            @click="logoutConfirmOpen = false"
          />
          <UButton
            label="Cerrar sesión"
            icon="i-lucide-log-out"
            color="primary"
            @click="confirmLogout()"
          />
        </div>
      </template>
    </UModal>

    <!-- Toast de nuevo mensaje de soporte - click lleva a /soporte -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="translate-y-4 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-4 opacity-0"
    >
      <NuxtLink
        v-if="lastAlert"
        to="/soporte"
        class="fixed bottom-5 right-5 z-50 flex w-80 cursor-pointer items-start gap-3 rounded-xl border border-accent/40 bg-surface p-4 shadow-2xl"
        @click="dismissAlert()"
      >
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/20"
        >
          <MessageCircle class="h-4 w-4 text-accent" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-xs font-bold text-text-primary">
            Nuevo mensaje de {{ lastAlert.memberName }}
          </p>
          <p class="mt-0.5 truncate text-[11px] text-text-muted">
            {{ lastAlert.preview }}
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 cursor-pointer rounded p-0.5 text-text-dim transition hover:text-text-primary"
          @click.prevent.stop="dismissAlert()"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </NuxtLink>
    </Transition>

    <!-- Toast flotante de nueva reserva o tour desde cowhub-book -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="translate-y-4 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-4 opacity-0"
    >
      <NuxtLink
        v-if="agendaAlert"
        to="/agenda-web"
        class="fixed right-5 z-50 flex w-80 cursor-pointer items-start gap-3 rounded-xl border border-accent/40 bg-surface p-4"
        :class="lastAlert ? 'bottom-24' : 'bottom-5'"
        @click="dismissAgendaAlert()"
      >
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/20"
        >
          <CalendarClock class="h-4 w-4 text-accent" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-xs font-bold text-text-primary">
            {{ agendaAlert.title }}
          </p>
          <p class="mt-0.5 truncate text-[11px] text-text-muted">
            {{ agendaAlert.subtitle }}
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 cursor-pointer rounded p-0.5 text-text-dim transition hover:text-text-primary"
          @click.prevent.stop="dismissAgendaAlert()"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </NuxtLink>
    </Transition>

    <!-- Wipe de cierre de sesión - espejo del login: entra desde la
         derecha y cubre la app mientras se navega a /login -->
    <div
      class="pointer-events-none fixed inset-0 z-[60] translate-x-full bg-base transition-transform duration-700 ease-[cubic-bezier(0.7,0,0.25,1)]"
      :class="signingOut && 'translate-x-0'"
    >
      <div
        class="absolute inset-x-0 bottom-0 h-2/3 bg-[radial-gradient(ellipse_at_50%_100%,rgba(152,157,231,0.22),rgba(255,152,203,0.12),transparent_60%)]"
      />
    </div>
  </div>
</template>
