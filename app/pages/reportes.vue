<script setup lang="ts">
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Bot,
  Brain,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  DollarSign,
  Download,
  FileBarChart,
  Flame,
  Play,
  Sparkles,
  Ticket,
  User,
  Users,
  Wrench,
} from '@lucide/vue';

import type {
  AdsReportResponse,
  AiPilotConfig,
  Branch,
  CheckInsReport,
  PaymentsReport,
} from '#shared/types';

const { db } = useFirebase();
const { session } = useAuth();
const isAdmin = computed(() => session.value?.role === 'ADMIN');

// ─── KPIs de Agenda web (reservas y tours del sitio público) ───
const webBookings = ref<{ date: string; status: string; totalMxn: number }[]>([]);
const webTours = ref<{ status: string }[]>([]);
let unsubWebB: Unsubscribe | null = null;
let unsubWebT: Unsubscribe | null = null;

const webAgendaStats = computed(() => {
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const monthKey = todayKey.slice(0, 7);
  return {
    today: webBookings.value.filter((b) => b.date === todayKey).length,
    monthRevenue: webBookings.value
      .filter((b) => b.status === 'confirmed' && b.date.startsWith(monthKey))
      .reduce((s, b) => s + b.totalMxn, 0),
    newTours: webTours.value.filter((t) => t.status === 'new').length,
    total: webBookings.value.length,
  };
});

/// Analítica del día (KPIs en vivo + diagnóstico IA) - reubicada desde el dashboard.
const runtimeConfig = useRuntimeConfig();
const {
  branches: liveBranches,
  recentCheckIns,
  traffic,
  kpis: staticKpis,
  pending: livePending,
  start: startLive,
  stop: stopLive,
} = useDashboardRealtime();

const isAiEnabled = computed(
  () => Boolean(runtimeConfig.public.features?.churnRetention),
);
const isAutopilotEnabled = computed(
  () => Boolean(runtimeConfig.public.features?.aiAutopilot),
);
const canViewAi = computed(
  () => session.value?.role === 'ADMIN' || session.value?.role === 'MANAGER',
);

const pilotStats = ref<{
  provisioned: boolean;
  hasGeminiKey: boolean;
  config: AiPilotConfig | null;
}>({
  provisioned: false,
  hasGeminiKey: false,
  config: null,
});

const pilotToolsCount = computed(() => {
  const t = pilotStats.value.config?.tools;
  if (!t) return 0;
  return (t.checkAvailability ? 1 : 0) + (t.createTour ? 1 : 0);
});

const pilotIsLive = computed(
  () => pilotStats.value.provisioned && pilotStats.value.config?.enabled === true,
);

const PILOT_TONE_LABELS: Record<string, string> = {
  ejecutivo: 'Ejecutivo',
  cercano: 'Cercano',
  directo: 'Directo',
};

async function loadPilotStats(): Promise<void> {
  if (!isAutopilotEnabled.value || !canViewAi.value) return;
  try {
    const res = await $api<{
      provisioned: boolean;
      hasGeminiKey: boolean;
      config: AiPilotConfig;
    }>('/api/ai-pilot/config');
    pilotStats.value = res;
  } catch {
    /* opcional */
  }
}

const aiKpis = ref({
  highRisk: 0,
  mediumRisk: 0,
  lowRisk: 0,
  totalActive: 0,
  savedRevenue30d: 0,
  recoveredMembers30d: 0,
});
const aiTopMembers = ref<any[]>([]);
const aiLoading = ref(true);

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

async function loadAiData(): Promise<void> {
  if (!isAiEnabled.value || !canViewAi.value) return;
  aiLoading.value = true;
  try {
    const res = await $api<any>('/api/analytics/churn-members', {
      query: { risk_level: 'all', limit: 6 },
    });
    if (res.kpis) aiKpis.value = res.kpis;
    if (res.members) {
      aiTopMembers.value = res.members
        .filter((m: any) => m.churn_risk_level === 'high' || m.combined_risk >= 0.5)
        .slice(0, 3);
    }
  } catch (err) {
    console.error('Error cargando métricas IA en Reportes:', err);
  } finally {
    aiLoading.value = false;
  }
}

const trafficValues = computed(() => traffic.value.map((p) => p.value));

function sliceSpark(values: number[], offset: number): number[] {
  if (values.length < 6) return values;
  return values.slice(offset, offset + 9);
}

const membersToday = computed(() =>
  recentCheckIns.value.filter((c) => c.granted).length,
);

const avgOccupancy = computed(() => {
  if (liveBranches.value.length === 0) return 0;
  const sum = liveBranches.value.reduce(
    (acc, b) => acc + b.currentCapacity / Math.max(1, b.maxCapacity),
    0,
  );
  return Math.round((sum / liveBranches.value.length) * 100);
});

const busiestBranch = computed(() => {
  if (liveBranches.value.length === 0) return '-';
  const sorted = [...liveBranches.value].sort(
    (a, b) =>
      b.currentCapacity / Math.max(1, b.maxCapacity) -
      a.currentCapacity / Math.max(1, a.maxCapacity),
  );
  return sorted[0]?.name ?? '-';
});

const dayKpis = computed(() => {
  const values = trafficValues.value;
  return [
    {
      label: 'Miembros hoy',
      value: String(membersToday.value),
      trend: staticKpis.value?.trends.membersToday ?? 0,
      spark: sliceSpark(values, 0),
      icon: Users,
    },
    {
      label: 'Ocupación promedio',
      value: `${avgOccupancy.value}%`,
      trend: staticKpis.value?.trends.avgOccupancy ?? 0,
      spark: sliceSpark(values, 1),
      icon: Activity,
    },
    {
      label: 'Sede más concurrida',
      value: busiestBranch.value,
      trend: staticKpis.value?.trends.busiestBranch ?? 0,
      spark: sliceSpark(values, 2),
      icon: Flame,
    },
    {
      label: 'Hora pico estimada',
      value: staticKpis.value?.peakHour ?? '-',
      trend: staticKpis.value?.trends.peakHour ?? 0,
      spark: sliceSpark(values, 3),
      icon: Clock3,
    },
  ];
});

const branches = ref<Branch[]>([]);
const pending = ref(true);
const generating = ref(false);

type ReportType = 'payments' | 'checkins' | 'ads';

/// Gerente y admin ven los mismos reportes - el gerente siempre está
/// limitado a su sede (reportBranches + selectedBranch fijo).
const reportTypes = computed(() => [
  { label: 'Pagos por rango de fechas', value: 'payments' as const },
  { label: 'Accesos por rango de fechas', value: 'checkins' as const },
  { label: 'Publicidad de aliados', value: 'ads' as const },
]);

/// El gerente solo genera reportes de su propia sede.
const reportBranches = computed(() =>
  isAdmin.value || !session.value?.branchId
    ? branches.value
    : branches.value.filter((b) => b.id === session.value?.branchId),
);

const reportType = ref<ReportType>('payments');
const fromDate = ref('');
const toDate = ref('');
const selectedBranch = ref(session.value?.branchId ?? 'todas');
const generated = ref(false);

const paymentsReport = ref<PaymentsReport | null>(null);
const checkInsReport = ref<CheckInsReport | null>(null);
const adsReport = ref<AdsReportResponse | null>(null);

/// Las cards "Recaudado por plan" filtran la tabla de detalle de pagos -
/// el filtro guarda el planId y la card muestra el nombre resuelto.
const paymentPlanFilter = ref('todos');

const filteredPayments = computed(() => {
  const report = paymentsReport.value;
  if (!report) return [];
  if (paymentPlanFilter.value === 'todos') return report.payments;
  return report.payments.filter((p) => p.planId === paymentPlanFilter.value);
});

const paymentPlanFilterName = computed(
  () =>
    paymentsReport.value?.stats.byPlan.find(
      (r) => r.planId === paymentPlanFilter.value,
    )?.plan ?? '',
);

function togglePaymentPlan(planId: string): void {
  paymentPlanFilter.value =
    paymentPlanFilter.value === planId ? 'todos' : planId;
}

onMounted(async () => {
  startLive();
  loadAiData();
  loadPilotStats();
  if (db) {
    unsubWebB = onSnapshot(
      query(collection(db, 'space_bookings'), orderBy('created_at', 'desc'), limit(300)),
      (snap) => {
        webBookings.value = snap.docs.map((d) => {
          const b = d.data();
          return {
            date: b.date ?? '',
            status: b.status ?? 'confirmed',
            totalMxn: b.total_mxn ?? 0,
          };
        });
      },
    );
    unsubWebT = onSnapshot(
      query(collection(db, 'tour_requests'), orderBy('created_at', 'desc'), limit(300)),
      (snap) => {
        webTours.value = snap.docs.map((d) => ({ status: d.data().status ?? 'new' }));
      },
    );
  }
  try {
    branches.value = await $api<Branch[]>('/api/branches');
    const today = new Date();
    toDate.value = toInputDate(today);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    fromDate.value = toInputDate(weekAgo);
  } finally {
    pending.value = false;
  }
});

onBeforeUnmount(() => {
  stopLive();
  unsubWebB?.();
  unsubWebT?.();
});

function toInputDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function applyPreset(days: number): void {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  fromDate.value = toInputDate(start);
  toDate.value = toInputDate(end);
}

/// El chip queda marcado solo si el rango actual coincide exactamente con el preset.
const activePreset = computed<number | null>(() => {
  if (toDate.value !== toInputDate(new Date())) return null;
  for (const days of [0, 7, 30]) {
    const start = new Date();
    start.setDate(start.getDate() - days);
    if (fromDate.value === toInputDate(start)) return days;
  }
  return null;
});

function rangeMs(): { from: number; to: number } {
  const from = fromDate.value ? new Date(`${fromDate.value}T00:00:00`).getTime() : 0;
  const to = toDate.value ? new Date(`${toDate.value}T23:59:59`).getTime() : Date.now();
  return { from, to };
}

async function generate(): Promise<void> {
  if (generating.value) return;
  generating.value = true;
  paymentPlanFilter.value = 'todos';
  const { from, to } = rangeMs();
  const qs = `from=${from}&to=${to}&branchId=${selectedBranch.value}`;
  try {
    if (reportType.value === 'payments') {
      paymentsReport.value = await $api<PaymentsReport>(
        `/api/reports/payments?${qs}`,
      );
      checkInsReport.value = null;
      adsReport.value = null;
    } else if (reportType.value === 'checkins') {
      checkInsReport.value = await $api<CheckInsReport>(
        `/api/reports/checkins?${qs}`,
      );
      paymentsReport.value = null;
      adsReport.value = null;
    } else {
      adsReport.value = await $api<AdsReportResponse>(
        `/api/reports/ads?${qs}`,
      );
      paymentsReport.value = null;
      checkInsReport.value = null;
    }
    generated.value = true;
  } finally {
    generating.value = false;
  }
}

watch(reportType, () => {
  generated.value = false;
});

function branchName(branchId: string): string {
  return branches.value.find((b) => b.id === branchId)?.name ?? '-';
}

function planColor(plan: string): 'primary' | 'info' | 'neutral' {
  const normalized = plan.toLowerCase();
  if (normalized.includes('black')) return 'primary';
  if (normalized.includes('plus')) return 'info';
  return 'neutral';
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function exportCsv(): void {
  let rows: string[][];
  let filename: string;
  if (reportType.value === 'payments' && paymentsReport.value) {
    filename = 'reporte-pagos.csv';
    rows = [
      ['Miembro', 'Nº miembro', 'Plan', 'Sede', 'Método', 'Monto (MXN)', 'Estado', 'Fecha'],
      ...filteredPayments.value.map((p) => [
        p.memberName,
        p.memberNumber ?? '',
        p.plan,
        branchName(p.branchId),
        p.method,
        String(p.amount),
        p.status,
        new Date(p.createdAt).toISOString(),
      ]),
    ];
  } else if (reportType.value === 'checkins' && checkInsReport.value) {
    filename = 'reporte-checkins.csv';
    rows = [
      ['Miembro', 'Sede', 'Método', 'Resultado', 'Fecha'],
      ...checkInsReport.value.checkIns.map((c) => [
        c.memberName,
        branchName(c.branchId),
        c.method,
        c.granted ? 'OK' : 'DENEGADO',
        new Date(c.checkInAt).toISOString(),
      ]),
    ];
  } else if (reportType.value === 'ads' && adsReport.value) {
    filename = 'reporte-ads.csv';
    rows = [
      [
        'Anunciante',
        'Anuncio',
        'Sede',
        'Estado',
        'Vigencia',
        'Impresiones',
        'Taps',
        'CTR %',
      ],
      ...adsReport.value.ads.map((ad) => [
        ad.advertiser,
        ad.title,
        ad.branchId ? branchName(ad.branchId) : 'Todas las sedes',
        ad.status,
        new Date(ad.endsAt).toISOString().slice(0, 10),
        String(ad.impressions),
        String(ad.taps),
        ad.impressions > 0
          ? ((ad.taps / ad.impressions) * 100).toFixed(1)
          : '0',
      ]),
    ];
  } else {
    return;
  }
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="space-y-6">
    <!-- Analítica del día: KPIs históricos + diagnóstico IA (antes en el dashboard) -->
    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-black uppercase tracking-widest text-text-muted">
          Analítica del día
        </h2>
        <span class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-text-dim">
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Tiempo real
        </span>
      </div>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <template v-if="livePending && liveBranches.length === 0">
          <div
            v-for="i in 4"
            :key="i"
            class="animate-pulse rounded-2xl border border-stroke bg-surface p-5"
          >
            <div class="flex items-start justify-between">
              <div class="h-3 w-20 rounded bg-white/5" />
              <div class="h-8 w-8 rounded-xl bg-white/5" />
            </div>
            <div class="mt-4 h-8 w-16 rounded bg-white/5" />
            <div class="mt-3 h-6 w-full rounded bg-white/5" />
          </div>
        </template>
        <StatCard
          v-for="kpi in dayKpis"
          v-else
          :key="kpi.label"
          :label="kpi.label"
          :value="kpi.value"
          :trend="kpi.trend"
          :spark="kpi.spark"
          :icon="kpi.icon"
        />
      </div>
    </section>

    <!-- Agenda web: KPIs de reservas y tours del sitio público -->
    <section class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-sm font-black uppercase tracking-widest text-text-muted">
          Agenda web
        </h2>
        <NuxtLink
          to="/agenda-web"
          class="flex cursor-pointer items-center gap-1.5 rounded-full border border-stroke bg-surface px-4 py-1.5 text-[11px] font-bold text-text-muted transition hover:border-accent hover:text-text-primary"
        >
          <span>Ir a Agenda web</span>
          <ArrowRight class="h-3.5 w-3.5" />
        </NuxtLink>
      </div>
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div class="rounded-2xl border border-stroke bg-surface p-5">
          <div class="flex items-center justify-between text-text-dim">
            <span class="text-[10px] font-bold uppercase tracking-widest">Reservas hoy</span>
            <Ticket class="h-4 w-4" />
          </div>
          <p class="mt-2 text-3xl font-semibold tracking-tight text-text-primary">{{ webAgendaStats.today }}</p>
        </div>
        <div class="rounded-2xl border border-stroke bg-surface p-5">
          <div class="flex items-center justify-between text-text-dim">
            <span class="text-[10px] font-bold uppercase tracking-widest">Ingresos del mes</span>
            <CircleDollarSign class="h-4 w-4" />
          </div>
          <p class="mt-2 text-3xl font-semibold tracking-tight text-text-primary">{{ formatMoney(webAgendaStats.monthRevenue) }}</p>
        </div>
        <div class="rounded-2xl border border-stroke bg-surface p-5">
          <div class="flex items-center justify-between text-text-dim">
            <span class="text-[10px] font-bold uppercase tracking-widest">Tours nuevos</span>
            <User class="h-4 w-4" />
          </div>
          <p class="mt-2 text-3xl font-semibold tracking-tight text-text-primary">{{ webAgendaStats.newTours }}</p>
        </div>
        <div class="rounded-2xl border border-stroke bg-surface p-5">
          <div class="flex items-center justify-between text-text-dim">
            <span class="text-[10px] font-bold uppercase tracking-widest">Reservas totales</span>
            <CalendarClock class="h-4 w-4" />
          </div>
          <p class="mt-2 text-3xl font-semibold tracking-tight text-text-primary">{{ webAgendaStats.total }}</p>
        </div>
      </div>
    </section>

    <!-- Piloto IA: 4 KPIs del agente autónomo -->
    <section v-if="isAutopilotEnabled && canViewAi" class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-sm font-black uppercase tracking-widest text-text-muted">
          Piloto IA
        </h2>
        <NuxtLink
          to="/piloto-ia"
          class="flex cursor-pointer items-center gap-1.5 rounded-full border border-stroke bg-surface px-4 py-1.5 text-[11px] font-bold text-text-muted transition hover:border-accent hover:text-text-primary"
        >
          <span>Ir a Piloto IA</span>
          <ArrowRight class="h-3.5 w-3.5" />
        </NuxtLink>
      </div>
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div class="rounded-2xl border border-stroke bg-surface p-4">
          <div class="flex items-center gap-2">
            <Bot class="h-4 w-4" :class="pilotIsLive ? 'text-emerald-400' : 'text-amber-400'" />
            <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Estado del piloto
            </p>
          </div>
          <div class="mt-2 flex items-center gap-2">
            <span
              class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
              :class="
                pilotIsLive
                  ? 'border-emerald-400/35 bg-emerald-400/15 text-emerald-400'
                  : 'border-amber-400/35 bg-amber-400/15 text-amber-400'
              "
            >
              <span
                class="h-1.5 w-1.5 rounded-full"
                :class="pilotIsLive ? 'bg-emerald-400' : 'bg-amber-400'"
              />
              {{ pilotIsLive ? 'ACTIVO' : 'PAUSADO' }}
            </span>
          </div>
          <p class="mt-1.5 text-[10px] font-semibold text-text-dim">
            {{ pilotStats.config?.scheduleMode === 'after_hours' ? 'Solo fuera de horario' : 'Atención 24/7' }}
          </p>
        </div>

        <div class="rounded-2xl border border-stroke bg-surface p-4">
          <div class="flex items-center gap-2">
            <Sparkles class="h-4 w-4 text-accent" />
            <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Motor Gemini
            </p>
          </div>
          <div class="mt-2 flex items-center gap-2">
            <span
              class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
              :class="
                pilotStats.hasGeminiKey
                  ? 'border-emerald-400/35 bg-emerald-400/15 text-emerald-400'
                  : 'border-red-400/35 bg-red-400/15 text-red-400'
              "
            >
              <span
                class="h-1.5 w-1.5 rounded-full"
                :class="pilotStats.hasGeminiKey ? 'bg-emerald-400' : 'bg-red-400'"
              />
              {{ pilotStats.hasGeminiKey ? 'CONECTADO' : 'SIN CLAVE' }}
            </span>
          </div>
          <p class="mt-1.5 text-[10px] font-semibold text-text-dim">
            Tono {{ PILOT_TONE_LABELS[pilotStats.config?.tone ?? 'ejecutivo'] }}
          </p>
        </div>

        <div class="rounded-2xl border border-stroke bg-surface p-4">
          <div class="flex items-center gap-2">
            <Wrench class="h-4 w-4 text-accent" />
            <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Herramientas
            </p>
          </div>
          <p class="mt-2 text-xl font-black text-text-primary">
            {{ pilotToolsCount }}
            <span class="text-[11px] font-bold text-text-dim">/ 2</span>
          </p>
          <p class="text-[10px] font-semibold text-text-dim">
            Disponibilidad · Tours
          </p>
        </div>

        <div class="rounded-2xl border border-stroke bg-surface p-4">
          <div class="flex items-center gap-2">
            <BookOpen class="h-4 w-4 text-accent" />
            <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Base de conocimiento
            </p>
          </div>
          <p class="mt-2 text-xl font-black text-text-primary">
            {{ pilotStats.config?.faqs?.length ?? 0 }}
            <span class="text-[11px] font-bold text-text-dim">FAQs</span>
          </p>
          <p class="text-[10px] font-semibold text-text-dim">
            Límite {{ pilotStats.config?.maxAutoTurns ?? 12 }} turnos por chat
          </p>
        </div>
      </div>
    </section>

    <!-- Diagnóstico de Retención IA -->
    <section v-if="isAiEnabled && canViewAi" class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2.5">
          <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Brain class="h-4 w-4" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-black uppercase tracking-widest text-text-muted">
                Diagnóstico de Retención IA
              </h2>
              <span class="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-black text-accent">
                Modelo ML + Gemini
              </span>
            </div>
          </div>
        </div>

        <NuxtLink
          to="/retencion"
          class="flex cursor-pointer items-center gap-1.5 rounded-full border border-stroke bg-surface px-4 py-1.5 text-[11px] font-bold text-text-muted transition hover:border-accent hover:text-text-primary"
        >
          <span>Ir a IA Reportes</span>
          <ArrowRight class="h-3.5 w-3.5" />
        </NuxtLink>
      </div>

      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div class="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 transition hover:border-emerald-500/50">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="rounded-xl bg-emerald-500/15 p-2 text-emerald-400">
                <DollarSign class="h-4 w-4" />
              </div>
              <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
                Ingresos Salvados
              </p>
            </div>
            <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black text-emerald-400">
              30 DÍAS
            </span>
          </div>
          <p class="mt-3 text-2xl font-black text-emerald-400">
            {{ formatMoney(aiKpis.savedRevenue30d) }}
          </p>
          <p class="mt-1 text-[11px] font-semibold text-text-dim">
            {{ aiKpis.recoveredMembers30d }} miembros recuperados
          </p>
        </div>

        <div class="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 transition hover:border-red-500/50">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="rounded-xl bg-red-500/15 p-2 text-red-400">
                <AlertTriangle class="h-4 w-4" />
              </div>
              <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
                Riesgo Alto
              </p>
            </div>
            <span class="rounded-full bg-red-500/15 px-2 py-0.5 text-[9px] font-black text-red-400">
              URGENTE
            </span>
          </div>
          <p class="mt-3 text-2xl font-black text-red-400">
            {{ aiKpis.highRisk }}
          </p>
          <p class="mt-1 text-[11px] font-semibold text-text-dim">
            &gt;65% prob. de deserción
          </p>
        </div>

        <div class="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 transition hover:border-amber-500/50">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="rounded-xl bg-amber-500/15 p-2 text-amber-400">
                <User class="h-4 w-4" />
              </div>
              <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
                Riesgo Medio
              </p>
            </div>
            <span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-black text-amber-400">
              ALERTA
            </span>
          </div>
          <p class="mt-3 text-2xl font-black text-amber-400">
            {{ aiKpis.mediumRisk }}
          </p>
          <p class="mt-1 text-[11px] font-semibold text-text-dim">
            35–65% asistencia a la baja
          </p>
        </div>

        <div class="rounded-2xl border border-stroke bg-surface p-4 transition hover:border-accent/40">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="rounded-xl bg-accent/15 p-2 text-accent">
                <CheckCircle2 class="h-4 w-4" />
              </div>
              <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
                Fidelizados
              </p>
            </div>
            <span class="rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-black text-accent">
              SALUDABLE
            </span>
          </div>
          <p class="mt-3 text-2xl font-black text-text-primary">
            {{ aiKpis.lowRisk }}
            <span class="text-xs font-bold text-text-dim">/ {{ aiKpis.totalActive }}</span>
          </p>
          <p class="mt-1 text-[11px] font-semibold text-text-dim">
            {{ ((aiKpis.lowRisk / Math.max(1, aiKpis.totalActive)) * 100).toFixed(0) }}% retención estable
          </p>
        </div>
      </div>

      <div v-if="aiTopMembers.length" class="overflow-hidden rounded-2xl border border-stroke bg-surface">
        <div class="flex items-center justify-between border-b border-stroke px-5 py-3">
          <div class="flex items-center gap-2">
            <span class="text-xs font-black uppercase tracking-wider text-text-primary">
              Atención recomendada por IA
            </span>
            <span class="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-black text-red-400">
              {{ aiKpis.highRisk }} requieren contacto
            </span>
          </div>
          <span class="text-[11px] font-medium text-text-dim">
            Jugadas contextuales sugeridas
          </span>
        </div>

        <div class="divide-y divide-stroke">
          <div
            v-for="m in aiTopMembers"
            :key="m.id"
            class="flex flex-col gap-3 p-4 transition hover:bg-base/40 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="flex items-center gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-xs font-black text-red-400">
                {{ (m.combined_risk * 100).toFixed(0) }}%
              </div>
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <NuxtLink :to="`/miembros/${m.id}`" class="text-xs font-black text-text-primary transition hover:text-accent">
                    {{ m.name }}
                  </NuxtLink>
                  <span class="rounded-full border border-stroke bg-base px-2 py-0.5 text-[9px] font-bold text-text-muted">
                    {{ branchName(m.branch_id) }}
                  </span>
                  <span
                    v-if="m.days_since_last_visit >= 7"
                    class="rounded-full bg-red-500/10 px-2 py-0.5 text-[9px] font-bold text-red-400"
                  >
                    {{ m.days_since_last_visit }}d sin asistir
                  </span>
                </div>
                <p class="mt-0.5 text-[11px] text-text-dim">
                  {{ m.churn_top_factors?.[0] || 'Patrón de baja asistencia detectado por el modelo' }}
                </p>
              </div>
            </div>

            <NuxtLink
              to="/retencion"
              class="flex shrink-0 cursor-pointer items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-base transition hover:opacity-90"
            >
              <Sparkles class="h-4 w-4" />
              <span>Ejecutar Jugada</span>
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>

    <section class="rounded-2xl border border-stroke bg-surface p-5">
      <div class="flex items-center gap-3">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent"
        >
          <FileBarChart class="h-5 w-5" />
        </div>
        <div>
          <h2 class="text-sm font-black text-text-primary">Generar reporte</h2>
          <p class="text-[10px] font-semibold text-text-dim">
            Selecciona el tipo, el rango de fechas y la sede.
          </p>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <label class="block md:col-span-2">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Tipo de reporte
          </span>
          <USelectMenu
            v-model="reportType"
            :items="reportTypes"
            value-key="value"
            class="mt-1 w-full"
          />
        </label>
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Desde
          </span>
          <input
            v-model="fromDate"
            type="date"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </label>
        <label class="block">
          <span
            class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
          >
            Hasta
          </span>
          <input
            v-model="toDate"
            type="date"
            class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </label>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <button
          v-for="preset in [
            { label: 'Hoy', days: 0 },
            { label: '7 días', days: 7 },
            { label: '30 días', days: 30 },
          ]"
          :key="preset.days"
          class="cursor-pointer rounded-full border px-3 py-1 text-[10px] font-bold transition"
          :class="
            activePreset === preset.days
              ? 'border-sky-400 bg-sky-400/15 text-sky-400'
              : 'border-stroke bg-base text-text-muted hover:border-sky-400/60 hover:text-sky-400'
          "
          @click="applyPreset(preset.days)"
        >
          {{ preset.label }}
        </button>
        <span class="mx-1 h-4 w-px bg-stroke" />
        <button
          v-if="isAdmin"
          class="cursor-pointer rounded-full border px-3 py-1 text-[10px] font-bold transition"
          :class="
            selectedBranch === 'todas'
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-stroke bg-surface text-text-dim hover:text-text-muted'
          "
          @click="selectedBranch = 'todas'"
        >
          Todas las sedes
        </button>
        <button
          v-for="branch in reportBranches"
          :key="branch.id"
          class="cursor-pointer rounded-full border px-3 py-1 text-[10px] font-bold transition"
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

      <div class="mt-4 flex justify-end">
        <button
          class="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-accent px-5 text-[11px] font-black text-base transition hover:opacity-90 disabled:opacity-50"
          :disabled="generating"
          @click="generate"
        >
          <Play class="h-3.5 w-3.5" />
          {{ generating ? 'Generando…' : 'Generar reporte' }}
        </button>
      </div>
    </section>

    <template v-if="generated && paymentsReport">
      <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div class="rounded-2xl border border-stroke bg-surface p-4 text-center">
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            Pagos
          </p>
          <p class="mt-1 text-xl font-black text-text-primary">
            {{ paymentsReport.stats.total }}
          </p>
        </div>
        <div class="rounded-2xl border border-stroke bg-surface p-4 text-center">
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            Aprobados
          </p>
          <p class="mt-1 text-xl font-black text-emerald-400">
            {{ paymentsReport.stats.approved }}
          </p>
        </div>
        <div class="rounded-2xl border border-stroke bg-surface p-4 text-center">
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            Rechazados
          </p>
          <p class="mt-1 text-xl font-black text-red-400">
            {{ paymentsReport.stats.declined }}
          </p>
        </div>
        <div class="rounded-2xl border border-stroke bg-surface p-4 text-center">
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            Recaudado
          </p>
          <p class="mt-1 text-xl font-black text-text-primary">
            $ {{ paymentsReport.stats.amountApproved }}
          </p>
        </div>
      </div>

      <section v-if="paymentsReport.stats.byPlan.length">
        <h2
          class="mb-3 text-sm font-black uppercase tracking-widest text-text-muted"
        >
          Recaudado por plan
        </h2>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <button
            v-for="row in paymentsReport.stats.byPlan"
            :key="row.planId"
            type="button"
            class="flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-3 transition"
            :class="
              paymentPlanFilter === row.planId
                ? 'border-accent bg-accent/10'
                : 'border-stroke bg-surface hover:border-accent/50'
            "
            @click="togglePaymentPlan(row.planId)"
          >
            <UBadge
              :color="planColor(row.plan)"
              variant="subtle"
              size="sm"
              :label="row.plan"
            />
            <div class="text-right">
              <p class="text-sm font-black text-text-primary">
                $ {{ row.amount }}
              </p>
              <p class="text-[10px] text-text-dim">{{ row.count }} pagos</p>
            </div>
          </button>
        </div>
        <p
          v-if="paymentPlanFilter !== 'todos'"
          class="mt-2 text-[10px] font-semibold text-text-dim"
        >
          Filtrando por {{ paymentPlanFilterName }} - toca la card de nuevo
          para ver todos.
        </p>
      </section>

      <section>
        <div class="mb-3 flex items-center justify-between">
          <h2
            class="text-sm font-black uppercase tracking-widest text-text-muted"
          >
            Detalle de pagos
          </h2>
          <button
            class="flex cursor-pointer items-center gap-1.5 rounded-full border border-stroke px-3 py-1.5 text-[10px] font-black text-text-muted transition hover:border-accent hover:text-accent"
            @click="exportCsv"
          >
            <Download class="h-3.5 w-3.5" />
            Exportar CSV
          </button>
        </div>
        <div class="overflow-hidden rounded-2xl border border-stroke bg-surface">
          <table class="w-full text-left">
            <thead>
              <tr
                class="border-b border-stroke text-[10px] uppercase tracking-widest text-text-dim"
              >
                <th class="px-5 py-3 font-bold">Miembro</th>
                <th class="px-5 py-3 font-bold">Plan</th>
                <th class="px-5 py-3 font-bold">Sede</th>
                <th class="px-5 py-3 font-bold">Método</th>
                <th class="px-5 py-3 font-bold">Monto</th>
                <th class="px-5 py-3 font-bold">Estado</th>
                <th class="px-5 py-3 text-right font-bold">Fecha</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="payment in filteredPayments"
                :key="payment.id"
                class="border-t border-stroke"
              >
                <td class="px-5 py-3">
                  <div class="flex items-center gap-3">
                    <img
                      v-if="payment.memberPhotoUrl"
                      :src="payment.memberPhotoUrl"
                      :alt="payment.memberName"
                      class="h-9 w-9 rounded-full border border-stroke object-cover"
                    />
                    <div>
                      <button
                        class="cursor-pointer text-xs font-bold text-text-primary transition hover:text-accent hover:underline"
                        @click="navigateTo(`/miembros/${payment.memberId}`)"
                      >
                        {{ payment.memberName }}
                      </button>
                      <p
                        v-if="payment.memberNumber"
                        class="font-mono text-[10px] text-text-dim"
                      >
                        {{ payment.memberNumber }}
                      </p>
                    </div>
                  </div>
                </td>
                <td class="px-5 py-3">
                  <UBadge
                    :color="planColor(payment.plan)"
                    variant="subtle"
                    size="sm"
                    :label="payment.plan"
                  />
                </td>
                <td class="px-5 py-3 text-[11px] text-text-muted">
                  {{ branchName(payment.branchId) }}
                </td>
                <td class="px-5 py-3 font-mono text-[10px] text-text-dim">
                  {{ payment.method }}
                </td>
                <td class="px-5 py-3 text-sm font-black text-text-primary">
                  $ {{ payment.amount }}
                </td>
                <td class="px-5 py-3">
                  <span
                    class="inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                    :class="
                      payment.status === 'APPROVED'
                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400'
                        : 'border-red-400/30 bg-red-400/10 text-red-400'
                    "
                  >
                    {{ payment.status === 'APPROVED' ? 'APROBADO' : 'RECHAZADO' }}
                  </span>
                </td>
                <td class="px-5 py-3 text-right font-mono text-[10px] text-text-dim">
                  {{ formatDate(payment.createdAt) }}
                </td>
              </tr>
            </tbody>
          </table>
          <p
            v-if="filteredPayments.length === 0"
            class="py-8 text-center text-xs font-semibold text-text-dim"
          >
            {{
              paymentPlanFilter === 'todos'
                ? 'Sin pagos en el rango seleccionado'
                : `Sin pagos del plan ${paymentPlanFilterName}`
            }}
          </p>
        </div>
      </section>
    </template>

    <template v-else-if="generated && checkInsReport">
      <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div class="rounded-2xl border border-stroke bg-surface p-4 text-center">
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            Accesos
          </p>
          <p class="mt-1 text-xl font-black text-text-primary">
            {{ checkInsReport.stats.total }}
          </p>
        </div>
        <div class="rounded-2xl border border-stroke bg-surface p-4 text-center">
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            Permitidos
          </p>
          <p class="mt-1 text-xl font-black text-emerald-400">
            {{ checkInsReport.stats.granted }}
          </p>
        </div>
        <div class="rounded-2xl border border-stroke bg-surface p-4 text-center">
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            Denegados
          </p>
          <p class="mt-1 text-xl font-black text-red-400">
            {{ checkInsReport.stats.denied }}
          </p>
        </div>
        <div class="rounded-2xl border border-stroke bg-surface p-4 text-center">
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            Miembros únicos
          </p>
          <p class="mt-1 text-xl font-black text-text-primary">
            {{ checkInsReport.stats.uniqueMembers }}
          </p>
        </div>
      </div>

      <section>
        <div class="mb-3 flex items-center justify-between">
          <h2
            class="text-sm font-black uppercase tracking-widest text-text-muted"
          >
            Detalle de accesos
          </h2>
          <button
            class="flex cursor-pointer items-center gap-1.5 rounded-full border border-stroke px-3 py-1.5 text-[10px] font-black text-text-muted transition hover:border-accent hover:text-accent"
            @click="exportCsv"
          >
            <Download class="h-3.5 w-3.5" />
            Exportar CSV
          </button>
        </div>
        <div class="overflow-hidden rounded-2xl border border-stroke bg-surface">
          <table class="w-full text-left">
            <thead>
              <tr
                class="border-b border-stroke text-[10px] uppercase tracking-widest text-text-dim"
              >
                <th class="px-5 py-3 font-bold">Miembro</th>
                <th class="px-5 py-3 font-bold">Sede</th>
                <th class="px-5 py-3 font-bold">Método</th>
                <th class="px-5 py-3 font-bold">Resultado</th>
                <th class="px-5 py-3 text-right font-bold">Fecha</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="record in checkInsReport.checkIns"
                :key="record.id"
                class="border-t border-stroke"
              >
                <td class="px-5 py-3">
                  <button
                    class="cursor-pointer text-xs font-bold text-text-primary transition hover:text-accent hover:underline"
                    @click="navigateTo(`/miembros/${record.userId}`)"
                  >
                    {{ record.memberName }}
                  </button>
                </td>
                <td class="px-5 py-3 text-[11px] text-text-muted">
                  {{ branchName(record.branchId) }}
                </td>
                <td class="px-5 py-3 font-mono text-[10px] uppercase text-text-dim">
                  {{ record.method }}
                </td>
                <td class="px-5 py-3">
                  <span
                    class="inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                    :class="
                      record.granted
                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400'
                        : 'border-red-400/30 bg-red-400/10 text-red-400'
                    "
                  >
                    {{ record.granted ? 'OK' : 'DENEGADO' }}
                  </span>
                </td>
                <td class="px-5 py-3 text-right font-mono text-[10px] text-text-dim">
                  {{ formatDate(record.checkInAt) }}
                </td>
              </tr>
            </tbody>
          </table>
          <p
            v-if="checkInsReport.checkIns.length === 0"
            class="py-8 text-center text-xs font-semibold text-text-dim"
          >
            Sin accesos en el rango seleccionado
          </p>
        </div>
      </section>
    </template>

    <template v-else-if="generated && adsReport">
      <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div class="rounded-2xl border border-stroke bg-surface p-4 text-center">
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            Impresiones
          </p>
          <p class="mt-1 text-xl font-black text-text-primary">
            {{ adsReport.stats.impressions.toLocaleString('es-MX') }}
          </p>
        </div>
        <div class="rounded-2xl border border-stroke bg-surface p-4 text-center">
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            Taps
          </p>
          <p class="mt-1 text-xl font-black text-text-primary">
            {{ adsReport.stats.taps.toLocaleString('es-MX') }}
          </p>
        </div>
        <div class="rounded-2xl border border-stroke bg-surface p-4 text-center">
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            CTR global
          </p>
          <p class="mt-1 text-xl font-black text-accent">
            {{ adsReport.stats.ctr }}%
          </p>
        </div>
        <div class="rounded-2xl border border-stroke bg-surface p-4 text-center">
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            Audiencia promos
          </p>
          <p class="mt-1 text-xl font-black text-text-primary">
            {{ adsReport.stats.optedInMembers.toLocaleString('es-MX') }}
          </p>
          <p class="text-[9px] text-text-dim">miembros con promos de aliados</p>
        </div>
      </div>

      <section>
        <div class="mb-3 flex items-center justify-between">
          <h2
            class="text-sm font-black uppercase tracking-widest text-text-muted"
          >
            Rendimiento por anuncio
          </h2>
          <button
            class="flex cursor-pointer items-center gap-1.5 rounded-full border border-stroke px-3 py-1.5 text-[10px] font-black text-text-muted transition hover:border-accent hover:text-accent"
            @click="exportCsv"
          >
            <Download class="h-3.5 w-3.5" />
            Exportar CSV
          </button>
        </div>
        <div class="overflow-hidden rounded-2xl border border-stroke bg-surface">
          <table class="w-full text-left">
            <thead>
              <tr
                class="border-b border-stroke text-[10px] uppercase tracking-widest text-text-dim"
              >
                <th class="px-5 py-3 font-bold">Anuncio</th>
                <th class="px-5 py-3 font-bold">Sede</th>
                <th class="px-5 py-3 font-bold">Vigencia</th>
                <th class="px-5 py-3 font-bold">Estado</th>
                <th class="px-5 py-3 font-bold">Impresiones</th>
                <th class="px-5 py-3 font-bold">Taps</th>
                <th class="px-5 py-3 text-right font-bold">CTR</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="ad in adsReport.ads"
                :key="ad.id"
                class="border-t border-stroke"
              >
                <td class="px-5 py-3">
                  <div class="flex items-center gap-3">
                    <img
                      :src="ad.imageUrl"
                      :alt="ad.title"
                      class="h-9 w-14 rounded-lg border border-stroke object-cover"
                    />
                    <div>
                      <p class="text-xs font-bold text-text-primary">
                        {{ ad.advertiser }}
                      </p>
                      <p class="text-[10px] text-text-dim">{{ ad.title }}</p>
                    </div>
                  </div>
                </td>
                <td class="px-5 py-3 text-[11px] text-text-muted">
                  {{ ad.branchId ? branchName(ad.branchId) : 'Todas' }}
                </td>
                <td class="px-5 py-3 font-mono text-[10px] text-text-dim">
                  {{ new Date(ad.endsAt).toLocaleDateString('es-MX') }}
                </td>
                <td class="px-5 py-3">
                  <span
                    class="inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                    :class="
                      ad.status === 'ACTIVE'
                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400'
                        : 'border-stroke bg-base text-text-dim'
                    "
                  >
                    {{ ad.status === 'ACTIVE' ? 'ACTIVO' : 'PAUSADO' }}
                  </span>
                </td>
                <td class="px-5 py-3 text-[11px] font-bold text-text-primary">
                  {{ ad.impressions.toLocaleString('es-MX') }}
                </td>
                <td class="px-5 py-3 text-[11px] font-bold text-text-primary">
                  {{ ad.taps.toLocaleString('es-MX') }}
                </td>
                <td class="px-5 py-3 text-right">
                  <span
                    class="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-black text-accent"
                  >
                    {{
                      ad.impressions > 0
                        ? ((ad.taps / ad.impressions) * 100).toFixed(1) + '%'
                        : '-'
                    }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          <p
            v-if="adsReport.ads.length === 0"
            class="py-8 text-center text-xs font-semibold text-text-dim"
          >
            Sin anuncios en el rango seleccionado
          </p>
        </div>
        <p class="mt-2 text-[10px] text-text-dim">
          Este reporte es el que el comercial le muestra al anunciante para
          justificar el costo del espacio publicitario.
        </p>
      </section>
    </template>

    <div
      v-else-if="!pending"
      class="rounded-2xl border border-dashed border-stroke bg-surface p-10 text-center"
    >
      <FileBarChart class="mx-auto h-8 w-8 text-text-dim" />
      <p class="mt-3 text-xs font-semibold text-text-dim">
        Configura el tipo, el rango de fechas y la sede, luego genera el
        reporte.
      </p>
    </div>
  </div>
</template>
