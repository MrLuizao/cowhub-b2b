<script setup lang="ts">
import { ArrowLeft, Check, MapPin, Pencil, Plus, Power, Trash2, UserPlus, X } from '@lucide/vue';

import type { Branch, BranchDetail, Activity, MemberAdmin, Host } from '#shared/types';

const route = useRoute();
const router = useRouter();
const { session, canEditBranch } = useAuth();
const detail = ref<BranchDetail | null>(null);
const branches = ref<Branch[]>([]);
const pending = ref(true);
const saving = ref(false);
const editing = ref(false);

/// Admin gestiona cualquier sede; gerente solo la suya.
const canManageBranch = computed(() =>
  detail.value ? canEditBranch(detail.value.branch.id) : false,
);

/// Solo el admin toca datos globales de la espacio (nombre, encargado, capacidad);
/// el gerente solo configura horario y sala de su sede.
const isAdmin = computed(() => session.value?.role === 'ADMIN');

const editForm = ref({
  name: '',
  address: '',
  imageUrl: '',
  maxCapacity: 1,
  currentCapacity: 0,
  status: 'OPEN' as Branch['status'],
  openTime: '06:00',
  closeTime: '22:00',
  lat: '',
  lng: '',
});

const editingActivityId = ref<string | null>(null);
const activityForm = ref({
  name: '',
  hostId: '',
  room: '',
  start: '06:00',
  end: '07:00',
  capacity: 20,
  booked: 0,
});

const assignHostId = ref('');
const assignActivityId = ref('');
const allActivities = ref<Activity[]>([]);
const allMembers = ref<MemberAdmin[]>([]);

const deleteModalOpen = ref(false);
const deleting = ref(false);

const availableHostItems = computed(() =>
  (detail.value?.availableHosts ?? []).map((t) => ({
    label: `${t.name} - ${t.specialty}`,
    value: t.id,
  })),
);

const hostItems = computed(() =>
  (detail.value?.hosts ?? []).map((t) => ({
    label: t.name,
    value: t.id,
  })),
);

function hostName(hostId: string): string {
  return (
    detail.value?.hosts.find((t) => t.id === hostId)?.name ??
    editingActivity.value?.host ??
    '-'
  );
}

const editingActivity = computed(
  () =>
    detail.value?.activities.find((c) => c.id === editingActivityId.value) ?? null,
);

const availableActivityItems = computed(() =>
  allActivities.value
    .filter(
      (c) =>
        detail.value && !c.branchIds.includes(detail.value.branch.id),
    )
    .map((c) => ({
      label: `${c.name} - ${c.host} · ${hhmm(c.startMinutes)}`,
      value: c.id,
    })),
);

const saveModalOpen = ref(false);
const saveModalTitle = ref('');
const saveModalDescription = ref('');
const saveModalEmpty = ref(false);
const saveModalAction = ref<(() => Promise<void>) | null>(null);

function confirmSave(
  title: string,
  changes: string[],
  action: () => Promise<void>,
): void {
  saveModalTitle.value = title;
  saveModalDescription.value = changes.length
    ? `${changes.join('. ')}.`
    : 'No se detectaron cambios respecto a los datos actuales.';
  saveModalEmpty.value = changes.length === 0;
  saveModalAction.value = action;
  saveModalOpen.value = true;
}

async function runSave(): Promise<void> {
  if (!saveModalAction.value) return;
  await saveModalAction.value();
  saveModalOpen.value = false;
}

/// Botón rápido de encendido/apagado de la sede - con confirmación porque
/// cerrar bloquea los accesos de los miembros al instante.
function confirmToggleStatus(): void {
  const b = detail.value?.branch;
  if (!b) return;
  const closing = b.status === 'OPEN';
  confirmSave(
    closing ? `Cerrar sede ${b.name}` : `Abrir sede ${b.name}`,
    [
      closing
        ? 'La sede se mostrará cerrada en la app y el scanner dejará de admitir accesos'
        : 'La sede se mostrará abierta en la app y volverá a admitir accesos',
    ],
    async () => {
      if (saving.value) return;
      saving.value = true;
      try {
        const updated = await $api<Branch>(`/api/branches/${b.id}`, {
          method: 'PUT',
          body: { status: closing ? 'CLOSED' : 'OPEN' },
        });
        if (detail.value) detail.value.branch = updated;
      } finally {
        saving.value = false;
      }
    },
  );
}

const branchChanges = computed<string[]>(() => {
  const b = detail.value?.branch;
  if (!b) return [];
  const changes: string[] = [];
  if (editForm.value.name !== b.name)
    changes.push(`Nombre: '${b.name}' → '${editForm.value.name}'`);
  if (editForm.value.address !== b.address)
    changes.push('Se actualizará la dirección');
  if (
    parseCoord(editForm.value.lat) !== b.lat ||
    parseCoord(editForm.value.lng) !== b.lng
  )
    changes.push('Se actualizará la ubicación en el mapa');
  if (editForm.value.imageUrl !== b.imageUrl)
    changes.push('Se actualizará la imagen de la sede');
  if (editForm.value.maxCapacity !== b.maxCapacity)
    changes.push(
      `Ocupación máximo: ${b.maxCapacity} → ${editForm.value.maxCapacity}`,
    );
  if (editForm.value.currentCapacity !== b.currentCapacity)
    changes.push(
      `Ocupación actual: ${b.currentCapacity} → ${editForm.value.currentCapacity}`,
    );
  if (editForm.value.status !== b.status)
    changes.push(
      editForm.value.status === 'OPEN'
        ? 'La sede se abrirá al público'
        : 'La sede se cerrará - los miembros no podrán hacer acceso',
    );
  if (
    toMinutes(editForm.value.openTime) !== b.openMinutes ||
    toMinutes(editForm.value.closeTime) !== b.closeMinutes
  )
    changes.push(
      `Horario de operación: ${hhmm(b.openMinutes)}–${hhmm(b.closeMinutes)} → ${editForm.value.openTime}–${editForm.value.closeTime}`,
    );
  return changes;
});

const activityChanges = computed<string[]>(() => {
  const c = editingActivity.value;
  if (!c) return [];
  const changes: string[] = [];
  const local = activityTime(c);
  if (activityForm.value.name !== c.name)
    changes.push(`Nombre: '${c.name}' → '${activityForm.value.name}'`);
  if (activityForm.value.hostId !== c.hostId)
    changes.push(`Encargado: ${c.host} → ${hostName(activityForm.value.hostId)}`);
  if (activityForm.value.room !== local.room)
    changes.push(`Sala: ${local.room} → ${activityForm.value.room}`);
  if (
    toMinutes(activityForm.value.start) !== local.startMinutes ||
    toMinutes(activityForm.value.end) !== local.endMinutes
  )
    changes.push(
      `Horario: ${hhmm(local.startMinutes)}–${hhmm(local.endMinutes)} → ${activityForm.value.start}–${activityForm.value.end}`,
    );
  if (activityForm.value.capacity !== c.capacity)
    changes.push(`Capacidad: ${c.capacity} → ${activityForm.value.capacity}`);
  if (activityForm.value.booked !== c.booked)
    changes.push(`Inscritos: ${c.booked} → ${activityForm.value.booked}`);
  if (activityForm.value.booked > activityForm.value.capacity)
    changes.push('Los inscritos exceden la capacidad - se ajustarán al máximo');
  return changes;
});

onMounted(async () => {
  try {
    const [branchList, activityList, memberList] = await Promise.all([
      $api<Branch[]>('/api/branches'),
      $api<Activity[]>('/api/activities'),
      $api<MemberAdmin[]>('/api/members'),
      load(),
    ]);
    branches.value = branchList;
    allActivities.value = activityList;
    allMembers.value = memberList;
  } finally {
    pending.value = false;
  }
});

async function load(): Promise<void> {
  detail.value = await $api<BranchDetail>(`/api/branches/${route.params.id}`);
}

function branchName(branchId: string): string {
  return branches.value.find((b) => b.id === branchId)?.name ?? '-';
}

function otherBranches(host: Host): string {
  return host.branchIds
    .filter((b) => b !== detail.value?.branch.id)
    .map(branchName)
    .join(' · ');
}

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseCoord(raw: string): number | null {
  const value = Number(raw.trim());
  return raw.trim() !== '' && Number.isFinite(value) ? value : null;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function startEdit(): void {
  if (!detail.value) return;
  editForm.value = {
    name: detail.value.branch.name,
    address: detail.value.branch.address,
    imageUrl: detail.value.branch.imageUrl,
    maxCapacity: detail.value.branch.maxCapacity,
    currentCapacity: detail.value.branch.currentCapacity,
    status: detail.value.branch.status,
    openTime: hhmm(detail.value.branch.openMinutes),
    closeTime: hhmm(detail.value.branch.closeMinutes),
    lat: detail.value.branch.lat?.toString() ?? '',
    lng: detail.value.branch.lng?.toString() ?? '',
  };
  editing.value = true;
}

async function saveBranch(): Promise<void> {
  if (!detail.value || saving.value) return;
  saving.value = true;
  try {
    const updated = await $api<Branch>(
      `/api/branches/${detail.value.branch.id}`,
      {
        method: 'PUT',
        body: {
          ...editForm.value,
          /// max/current_capacity son admin-only en el PUT - enviarlos
          /// aunque no cambiaran rechazaba TODO el guardado del gerente.
          ...(isAdmin.value
            ? {}
            : { maxCapacity: undefined, currentCapacity: undefined }),
          openMinutes: toMinutes(editForm.value.openTime),
          closeMinutes: toMinutes(editForm.value.closeTime),
          lat: parseCoord(editForm.value.lat),
          lng: parseCoord(editForm.value.lng),
        },
      },
    );
    detail.value = { ...detail.value, branch: updated };
    editing.value = false;
  } finally {
    saving.value = false;
  }
}

/// Horario/sala efectivos de una espacio en ESTA sede.
function activityTime(activity: Activity) {
  return activityTimeAt(activity, detail.value?.branch.id);
}

function startEditActivity(activity: Activity): void {
  const local = activityTime(activity);
  editingActivityId.value = activity.id;
  activityForm.value = {
    name: activity.name,
    hostId: activity.hostId,
    room: local.room,
    start: hhmm(local.startMinutes),
    end: hhmm(local.endMinutes),
    capacity: activity.capacity,
    booked: activity.booked,
  };
}

async function saveActivity(): Promise<void> {
  if (!detail.value || !editingActivityId.value || saving.value) return;
  saving.value = true;
  try {
    const updated = await $api<Activity>(
      `/api/activities/${editingActivityId.value}`,
      {
        method: 'PUT',
        body: {
          /// Horario/sala siempre se guardan como override de esta sede.
          branchTime: {
            branchId: detail.value.branch.id,
            startMinutes: toMinutes(activityForm.value.start),
            endMinutes: toMinutes(activityForm.value.end),
            room: activityForm.value.room,
          },
          /// Datos globales solo los puede cambiar el admin.
          ...(isAdmin.value
            ? {
                name: activityForm.value.name,
                hostId: activityForm.value.hostId,
                capacity: activityForm.value.capacity,
                booked: activityForm.value.booked,
              }
            : {}),
        },
      },
    );
    const index = detail.value.activities.findIndex((c) => c.id === updated.id);
    if (index !== -1) detail.value.activities[index] = updated;
    editingActivityId.value = null;
  } finally {
    saving.value = false;
  }
}

const activityToRemove = ref<Activity | null>(null);
const removeActivityModalOpen = ref(false);
const removingClass = ref(false);

const selectedActivity = ref<Activity | null>(null);
const activityDetailOpen = ref(false);

function openActivityDetail(activity: Activity): void {
  selectedActivity.value = activity;
  activityDetailOpen.value = true;
}

function activityDuration(activity: Activity): string {
  const local = activityTime(activity);
  return `${local.endMinutes - local.startMinutes} min`;
}

function classFill(activity: Activity): number {
  return activity.capacity > 0
    ? Math.min(1, activity.booked / activity.capacity)
    : 0;
}

const selectedActivityBranches = computed(() =>
  (selectedActivity.value?.branchIds ?? []).map(branchName),
);

function editSelectedActivity(): void {
  if (!selectedActivity.value) return;
  startEditActivity(selectedActivity.value);
  activityDetailOpen.value = false;
}

const selectedHost = ref<Host | null>(null);
const hostDetailOpen = ref(false);

function openHostDetail(host: Host): void {
  selectedHost.value = host;
  hostDetailOpen.value = true;
}

const selectedHostBranches = computed(() =>
  (selectedHost.value?.branchIds ?? []).map(branchName),
);

const selectedHostActivities = computed(
  () =>
    detail.value?.activities.filter(
      (c) => c.hostId === selectedHost.value?.id,
    ) ?? [],
);

function askRemoveSelectedHost(): void {
  const host = selectedHost.value;
  hostDetailOpen.value = false;
  if (host) confirmRemoveHost(host);
}

const removeActivityDescription = computed(() => {
  if (!activityToRemove.value || !detail.value) return '';
  const c = activityToRemove.value;
  const others = c.branchIds
    .filter((b) => b !== detail.value!.branch.id)
    .map(branchName)
    .join(' · ');
  return others
    ? `"${c.name}" dejará de impartirse en ${detail.value.branch.name}. Seguirá en: ${others}.`
    : `"${c.name}" dejará de impartirse en ${detail.value.branch.name} y quedará sin sede asignada (podrás reasignarla o eliminarla desde Espacios).`;
});

function confirmRemoveActivity(activity: Activity): void {
  activityToRemove.value = activity;
  removeActivityModalOpen.value = true;
}

async function removeActivity(): Promise<void> {
  if (!detail.value || !activityToRemove.value || removingClass.value) return;
  removingClass.value = true;
  try {
    const branchId = detail.value.branch.id;
    await $api<Activity>(`/api/activities/${activityToRemove.value.id}`, {
      method: 'PUT',
      body: {
        branchIds: activityToRemove.value.branchIds.filter(
          (b) => b !== branchId,
        ),
      },
    });
    detail.value.activities = detail.value.activities.filter(
      (c) => c.id !== activityToRemove.value?.id,
    );
    detail.value.stats.activities = detail.value.activities.length;
    const inAll = allActivities.value.find((c) => c.id === activityToRemove.value?.id);
    if (inAll) inAll.branchIds = inAll.branchIds.filter((b) => b !== branchId);
    removeActivityModalOpen.value = false;
    activityToRemove.value = null;
  } finally {
    removingClass.value = false;
  }
}

async function assignActivity(): Promise<void> {
  if (!detail.value || !assignActivityId.value) return;
  const activity = allActivities.value.find((c) => c.id === assignActivityId.value);
  if (!activity) return;
  const updated = await $api<Activity>(`/api/activities/${activity.id}`, {
    method: 'PUT',
    body: { branchIds: [...activity.branchIds, detail.value.branch.id] },
  });
  activity.branchIds = updated.branchIds;
  assignActivityId.value = '';
  await load();
}

const deleteBlockers = computed(() => ({
  members: allMembers.value.filter(
    (m) => m.branchId === detail.value?.branch.id,
  ).length,
  activities: detail.value?.activities.length ?? 0,
  hosts: detail.value?.hosts.length ?? 0,
}));

const deleteBlocked = computed(
  () =>
    deleteBlockers.value.members +
      deleteBlockers.value.activities +
      deleteBlockers.value.hosts >
    0,
);

const deleteDescription = computed(() => {
  if (!detail.value) return '';
  const b = deleteBlockers.value;
  if (deleteBlocked.value) {
    const parts: string[] = [];
    if (b.members) parts.push(`${b.members} miembro(s)`);
    if (b.activities) parts.push(`${b.activities} espacio(s)`);
    if (b.hosts) parts.push(`${b.hosts} anfitrión(es)`);
    return `'${detail.value.branch.name}' tiene ${parts.join(', ')} asignados - retíralos o reasígnalos antes de eliminar la sede.`;
  }
  return `Se eliminará la sede '${detail.value.branch.name}' del catálogo. Esta acción no se puede deshacer.`;
});

async function deleteBranch(): Promise<void> {
  if (!detail.value || deleting.value) return;
  deleting.value = true;
  try {
    await $api(`/api/branches/${detail.value.branch.id}`, {
      method: 'DELETE',
    });
    deleteModalOpen.value = false;
    await navigateTo('/sedes');
  } finally {
    deleting.value = false;
  }
}

async function assignHost(): Promise<void> {
  if (!detail.value || !assignHostId.value) return;
  await $api(`/api/hosts/${assignHostId.value}/update`, {
    method: 'POST',
    body: { addBranchId: detail.value.branch.id },
  });
  assignHostId.value = '';
  await load();
}

const hostToRemove = ref<Host | null>(null);
const removeModalOpen = ref(false);
const removing = ref(false);

const removeDescription = computed(() => {
  if (!hostToRemove.value || !detail.value) return '';
  const others = otherBranches(hostToRemove.value);
  return others
    ? `${hostToRemove.value.name} dejará de estar asignado a ${detail.value.branch.name}. Seguirá asignado a: ${others}.`
    : `${hostToRemove.value.name} dejará de estar asignado a ${detail.value.branch.name} y quedará sin sedes asignadas.`;
});

function confirmRemoveHost(host: Host): void {
  hostToRemove.value = host;
  removeModalOpen.value = true;
}

async function unassignHost(): Promise<void> {
  if (!detail.value || !hostToRemove.value || removing.value) return;
  removing.value = true;
  try {
    await $api(`/api/hosts/${hostToRemove.value.id}/update`, {
      method: 'POST',
      body: { removeBranchId: detail.value.branch.id },
    });
    removeModalOpen.value = false;
    hostToRemove.value = null;
    await load();
  } finally {
    removing.value = false;
  }
}
</script>

<template>
  <div
    v-if="pending"
    class="rounded-2xl border border-stroke bg-surface p-10 text-center text-sm font-semibold text-text-dim"
  >
    Cargando sede…
  </div>

  <div v-else-if="detail" class="space-y-6">
    <button
      type="button"
      class="inline-flex cursor-pointer items-center gap-2 text-xs font-black uppercase tracking-widest text-text-muted transition hover:text-accent"
      @click="router.back()"
    >
      <ArrowLeft class="h-4 w-4 text-accent" />
      Volver
    </button>

    <div class="flex items-center gap-4">
      <img
        :src="detail.branch.imageUrl"
        :alt="detail.branch.name"
        class="h-20 w-28 rounded-2xl border border-stroke object-cover"
      />
      <div class="min-w-0 flex-1">
        <h1 class="text-xl font-black text-text-primary">
          {{ detail.branch.name }}
        </h1>
        <p class="mt-1 truncate text-[11px] text-text-dim">
          {{ detail.branch.address }} · {{ hhmm(detail.branch.openMinutes) }} a
          {{ hhmm(detail.branch.closeMinutes) }}
        </p>
        <p class="mt-0.5 flex items-center gap-1.5">
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="
              detail.branch.status === 'OPEN'
                ? 'bg-emerald-400'
                : 'bg-red-400'
            "
          />
          <span
            class="text-[10px] font-bold uppercase tracking-widest"
            :class="
              detail.branch.status === 'OPEN'
                ? 'text-emerald-400'
                : 'text-red-400'
            "
          >
            {{ detail.branch.status === 'OPEN' ? 'Abierta' : 'Cerrada' }}
          </span>
        </p>
      </div>
      <button
        v-if="canManageBranch"
        class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-4 py-1.5 text-[11px] font-black transition"
        :class="
          detail.branch.status === 'OPEN'
            ? 'border-red-400/40 bg-red-400/10 text-red-400 hover:bg-red-400/20'
            : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20'
        "
        @click="confirmToggleStatus"
      >
        <Power class="h-3.5 w-3.5" />
        {{ detail.branch.status === 'OPEN' ? 'Cerrar sede' : 'Abrir sede' }}
      </button>
    </div>

    <section class="rounded-2xl border border-stroke bg-surface p-5">
      <div class="flex items-center justify-between">
        <h2 class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
          Información de la sede
        </h2>
        <button
          v-if="!editing && canManageBranch"
          class="flex cursor-pointer items-center gap-1.5 rounded-full border border-stroke px-3 py-1 text-[10px] font-black text-text-muted transition hover:border-accent hover:text-accent"
          @click="startEdit"
        >
          <Pencil class="h-3 w-3" />
          Editar
        </button>
      </div>

      <div v-if="!editing" class="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            Dirección
          </p>
          <p class="mt-1 text-sm font-black text-text-primary">
            {{ detail.branch.address }}
          </p>
          <a
            v-if="detail.branch.lat != null && detail.branch.lng != null"
            :href="`https://www.google.com/maps/search/?api=1&query=${detail.branch.lat},${detail.branch.lng}`"
            target="_blank"
            rel="noopener"
            class="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-accent transition hover:underline"
          >
            <MapPin class="h-3 w-3" />
            Ver en Google Maps
          </a>
        </div>
        <div>
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            Horario de operación
          </p>
          <p class="mt-1 text-sm font-black text-text-primary">
            {{ hhmm(detail.branch.openMinutes) }} –
            {{ hhmm(detail.branch.closeMinutes) }}
          </p>
        </div>
        <div>
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            Ocupación máximo
          </p>
          <p class="mt-1 text-sm font-black text-text-primary">
            {{ detail.branch.maxCapacity }}
          </p>
        </div>
        <div>
          <p class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
            Ocupación actual
          </p>
          <p class="mt-1 text-sm font-black text-text-primary">
            {{ detail.branch.currentCapacity }}
          </p>
        </div>
      </div>

      <div v-else class="mt-4 space-y-3">
        <div class="grid grid-cols-2 gap-3">
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
              Dirección
            </span>
            <input
              v-model="editForm.address"
              type="text"
              class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label class="block">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Latitud
            </span>
            <input
              v-model="editForm.lat"
              type="text"
              inputmode="decimal"
              placeholder="19.2926"
              class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-dim focus:border-accent"
            />
          </label>
          <label class="block">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Longitud
            </span>
            <input
              v-model="editForm.lng"
              type="text"
              inputmode="decimal"
              placeholder="-99.6572"
              class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-dim focus:border-accent"
            />
          </label>
          <div class="col-span-2">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Imagen
            </span>
            <ImagePicker
              v-model="editForm.imageUrl"
              label="Subir imagen de la sede"
              compact
              class="mt-1"
            />
          </div>
          <label class="block">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Ocupación máximo
            </span>
            <input
              v-model.number="editForm.maxCapacity"
              type="number"
              min="1"
              :disabled="!isAdmin"
              class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent disabled:opacity-50"
            />
          </label>
          <label class="block">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Ocupación actual
            </span>
            <input
              v-model.number="editForm.currentCapacity"
              type="number"
              min="0"
              :disabled="!isAdmin"
              class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent disabled:opacity-50"
            />
          </label>
          <label class="block">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Apertura
            </span>
            <input
              v-model="editForm.openTime"
              type="time"
              class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label class="block">
            <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Cierre
            </span>
            <input
              v-model="editForm.closeTime"
              type="time"
              class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
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
            @click="
              confirmSave(
                'Guardar cambios de la sede',
                branchChanges,
                saveBranch,
              )
            "
          >
            <Check class="h-3.5 w-3.5" />
            {{ saving ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </div>
    </section>

    <section>
      <h2 class="mb-3 text-sm font-black uppercase tracking-widest text-text-muted">
        Anfitriones asignados
      </h2>
      <div v-if="canManageBranch" class="my-4 flex items-center gap-3">
        <USelectMenu
          v-model="assignHostId"
          :items="availableHostItems"
          value-key="value"
          placeholder="Asignar anfitrión a esta sede…"
          class="flex-1"
        />
        <button
          class="flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-accent px-4 text-[11px] font-black text-base transition hover:opacity-90 disabled:opacity-40"
          :disabled="!assignHostId"
          @click="assignHost"
        >
          <UserPlus class="h-3.5 w-3.5" />
          Asignar
        </button>
      </div>
      <div class="space-y-3">
        <div
          v-for="host in detail.hosts"
          :key="host.id"
          class="flex items-center gap-3 rounded-2xl border border-stroke bg-surface p-4"
        >
          <button
            type="button"
            class="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
            title="Ver detalle del anfitrión"
            @click="openHostDetail(host)"
          >
            <img
              :src="host.photoUrl"
              :alt="host.name"
              class="h-10 w-10 shrink-0 rounded-xl border border-stroke object-cover"
            />
            <div class="min-w-0">
              <p
                class="truncate text-xs font-bold text-text-primary transition group-hover:text-accent"
              >
                {{ host.name }}
              </p>
              <p class="truncate text-[10px] text-text-dim">
                {{ host.specialty }}
              </p>
              <p
                v-if="otherBranches(host)"
                class="truncate text-[9px] text-text-dim"
              >
                También en: {{ otherBranches(host) }}
              </p>
            </div>
          </button>
          <span
            class="shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-black"
            :class="
              host.isOnDuty
                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400'
                : 'border-stroke bg-base text-text-dim'
            "
          >
            {{ host.isOnDuty ? 'EN TURNO' : 'FUERA' }}
          </span>
          <button
            v-if="canManageBranch"
            class="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-stroke text-text-muted transition hover:border-red-400 hover:text-red-400"
            title="Quitar de esta sede"
            @click="confirmRemoveHost(host)"
          >
            <X class="h-3 w-3" />
          </button>
        </div>
      </div>
      <p
        v-if="detail.hosts.length === 0"
        class="py-4 text-center text-xs font-semibold text-text-dim"
      >
        Sin anfitriones asignados
      </p>
    </section>

    <section>
      <h2 class="mb-3 text-sm font-black uppercase tracking-widest text-text-muted">
        Espacios y horarios
      </h2>

      <div v-if="canManageBranch" class="my-4 flex items-center gap-3">
        <USelectMenu
          v-model="assignActivityId"
          :items="availableActivityItems"
          value-key="value"
          placeholder="Asignar espacio existente a esta sede…"
          class="flex-1"
        />
        <button
          class="flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-accent px-4 text-[11px] font-black text-base transition hover:opacity-90 disabled:opacity-40"
          :disabled="!assignActivityId"
          @click="assignActivity"
        >
          <Plus class="h-3.5 w-3.5" />
          Asignar
        </button>
      </div>

      <div class="space-y-3">
        <div
          v-for="activity in detail.activities"
          :key="activity.id"
          class="rounded-2xl border border-stroke bg-surface p-4"
        >
          <div
            v-if="editingActivityId === activity.id"
            class="space-y-3"
          >
            <div class="grid grid-cols-2 gap-3">
              <label v-if="isAdmin" class="block">
                <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">Nombre</span>
                <input
                  v-model="activityForm.name"
                  type="text"
                  class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label v-if="isAdmin" class="block">
                <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">Encargado</span>
                <USelectMenu
                  v-model="activityForm.hostId"
                  :items="hostItems"
                  value-key="value"
                  class="mt-1 w-full"
                />
              </label>
              <label class="block">
                <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">Sala (esta sede)</span>
                <input
                  v-model="activityForm.room"
                  type="text"
                  class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label v-if="isAdmin" class="block">
                <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">Capacidad</span>
                <input
                  v-model.number="activityForm.capacity"
                  type="number"
                  min="1"
                  class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label class="block">
                <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">Inicio (esta sede)</span>
                <input
                  v-model="activityForm.start"
                  type="time"
                  class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label class="block">
                <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">Fin (esta sede)</span>
                <input
                  v-model="activityForm.end"
                  type="time"
                  class="mt-1 w-full rounded-xl border border-stroke bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
            </div>
            <div class="flex justify-end gap-2">
              <button
                class="flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-stroke px-3 text-[11px] font-black text-text-muted transition hover:text-text-primary"
                @click="editingActivityId = null"
              >
                <X class="h-3.5 w-3.5" />
                Cancelar
              </button>
              <button
                class="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-accent px-4 text-[11px] font-black text-base transition hover:opacity-90"
                :disabled="saving"
                @click="
                  confirmSave(
                    'Guardar cambios de la espacio',
                    activityChanges,
                    saveActivity,
                  )
                "
              >
                <Check class="h-3.5 w-3.5" />
                Guardar
              </button>
            </div>
          </div>

          <div v-else class="flex items-center gap-3">
            <button
              type="button"
              class="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
              title="Ver detalle de la espacio"
              @click="openActivityDetail(activity)"
            >
              <div
                class="shrink-0 rounded-xl border border-stroke bg-base px-2.5 py-1.5 text-center"
              >
                <p class="font-mono text-[11px] font-black text-accent">
                  {{ hhmm(activityTime(activity).startMinutes) }}
                </p>
                <p class="font-mono text-[9px] text-text-dim">
                  {{ hhmm(activityTime(activity).endMinutes) }}
                </p>
              </div>
              <div class="min-w-0">
                <p
                  class="truncate text-xs font-bold text-text-primary transition group-hover:text-accent"
                >
                  {{ activity.name }}
                </p>
                <p class="truncate text-[10px] text-text-dim">
                  {{ activity.host }} · {{ activityTime(activity).room }} ·
                  {{ activityDuration(activity) }}
                </p>
              </div>
            </button>
            <span class="shrink-0 text-[11px] font-bold text-text-dim">
              {{ activity.booked }}/{{ activity.capacity }} cupos
            </span>
            <button
              v-if="canManageBranch"
              class="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-stroke text-text-muted transition hover:border-accent hover:text-accent"
              title="Editar espacio"
              @click.stop="startEditActivity(activity)"
            >
              <Pencil class="h-3 w-3" />
            </button>
            <button
              v-if="canManageBranch"
              class="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-stroke text-red-400 transition hover:border-red-400"
              title="Quitar de esta sede"
              @click.stop="confirmRemoveActivity(activity)"
            >
              <X class="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      <p
        v-if="detail.activities.length === 0"
        class="mt-3 py-4 text-center text-xs font-semibold text-text-dim"
      >
        Sin espacios en esta sede
      </p>

    </section>

    <UModal
      v-model:open="saveModalOpen"
      :title="saveModalTitle"
      :description="saveModalDescription"
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
            label="Confirmar cambios"
            :disabled="saveModalEmpty"
            :loading="saving"
            @click="runSave"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="hostDetailOpen"
      :title="selectedHost?.name ?? 'Detalle del anfitrión'"
      description="Anfitrión asignado a esta sede."
    >
      <template #body>
        <div v-if="selectedHost" class="space-y-4">
          <div class="flex items-center gap-4">
            <img
              :src="selectedHost.photoUrl"
              :alt="selectedHost.name"
              class="h-16 w-16 rounded-2xl border border-stroke object-cover"
            />
            <div class="min-w-0">
              <p class="text-sm font-black text-text-primary">
                {{ selectedHost.specialty }}
              </p>
              <p class="mt-0.5 text-[11px] text-text-dim">
                Turno {{ shiftLabel(selectedHost.shift).toLowerCase() }}
              </p>
              <span
                class="mt-1.5 inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-black"
                :class="
                  selectedHost.isOnDuty
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400'
                    : 'border-stroke bg-base text-text-dim'
                "
              >
                {{ selectedHost.isOnDuty ? 'EN TURNO AHORA' : 'FUERA DE TURNO' }}
              </span>
            </div>
          </div>
          <div>
            <p
              class="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-text-dim"
            >
              Sedes asignadas
            </p>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="name in selectedHostBranches"
                :key="name"
                class="rounded-full border px-2.5 py-0.5 text-[10px] font-bold"
                :class="
                  name === detail.branch.name
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-stroke bg-base text-text-muted'
                "
              >
                {{ name }}
              </span>
            </div>
          </div>
          <div>
            <p
              class="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-text-dim"
            >
              Espacios que imparte en esta sede
            </p>
            <div v-if="selectedHostActivities.length" class="space-y-1.5">
              <div
                v-for="c in selectedHostActivities"
                :key="c.id"
                class="flex items-center justify-between rounded-xl border border-stroke bg-base px-3 py-2"
              >
                <p class="text-[11px] font-bold text-text-primary">
                  {{ c.name }}
                  <span class="font-semibold text-text-dim">· {{ c.room }}</span>
                </p>
                <p class="font-mono text-[10px] text-text-dim">
                  {{ hhmm(c.startMinutes) }}–{{ hhmm(c.endMinutes) }}
                </p>
              </div>
            </div>
            <p v-else class="text-[11px] text-text-dim">
              Sin espacios asignadas en esta sede
            </p>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-between gap-2">
          <UButton
            label="Ver ficha completa"
            color="neutral"
            variant="outline"
            icon="i-lucide-arrow-right"
            trailing
            @click="
              hostDetailOpen = false;
              navigateTo(`/anfitriones/${selectedHost?.id}`);
            "
          />
          <UButton
            v-if="canManageBranch"
            label="Quitar de la sede"
            color="primary"
            variant="soft"
            icon="i-lucide-x"
            @click="askRemoveSelectedHost"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="removeModalOpen"
      title="Quitar anfitrión de la sede"
      :description="removeDescription"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="outline"
            @click="removeModalOpen = false"
          />
          <UButton
            label="Quitar de la sede"
            color="primary"
            :loading="removing"
            @click="unassignHost"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="activityDetailOpen"
      :title="selectedActivity?.name ?? 'Detalle de espacio'"
      description="Espacio que se imparte en esta sede."
    >
      <template #body>
        <div v-if="selectedActivity" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <p
                class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
              >
                Horario
              </p>
              <p class="mt-1 text-sm font-black text-text-primary">
                {{ hhmm(activityTime(selectedActivity).startMinutes) }} –
                {{ hhmm(activityTime(selectedActivity).endMinutes) }}
                <span class="text-[10px] font-semibold text-text-dim">
                  ({{ activityDuration(selectedActivity) }})
                </span>
              </p>
            </div>
            <div>
              <p
                class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
              >
                Encargado
              </p>
              <p class="mt-1 text-sm font-black text-text-primary">
                {{ selectedActivity.host }}
              </p>
            </div>
            <div>
              <p
                class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
              >
                Sala
              </p>
              <p class="mt-1 text-sm font-black text-text-primary">
                {{ activityTime(selectedActivity).room }}
              </p>
            </div>
            <div>
              <p
                class="text-[10px] font-bold uppercase tracking-widest text-text-dim"
              >
                Ocupación
              </p>
              <div class="mt-1.5 flex items-center gap-2">
                <div
                  class="h-1.5 flex-1 overflow-hidden rounded-full bg-base"
                >
                  <div
                    class="h-full rounded-full transition-all"
                    :class="
                      classFill(selectedActivity) >= 1
                        ? 'bg-red-400'
                        : classFill(selectedActivity) >= 0.7
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                    "
                    :style="{ width: `${classFill(selectedActivity) * 100}%` }"
                  />
                </div>
                <span class="text-[11px] font-black text-text-primary">
                  {{ selectedActivity.booked }}/{{ selectedActivity.capacity }}
                </span>
              </div>
              <p class="mt-0.5 text-[9px] font-semibold text-text-dim">
                {{
                  classFill(selectedActivity) >= 1
                    ? 'Espacio llena'
                    : `${selectedActivity.capacity - selectedActivity.booked} cupos disponibles`
                }}
              </p>
            </div>
          </div>
          <div>
            <p
              class="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-text-dim"
            >
              Se imparte en
            </p>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="name in selectedActivityBranches"
                :key="name"
                class="rounded-full border px-2.5 py-0.5 text-[10px] font-bold"
                :class="
                  name === detail.branch.name
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-stroke bg-base text-text-muted'
                "
              >
                {{ name }}
              </span>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-between gap-2">
          <UButton
            label="Ver ficha completa"
            color="neutral"
            variant="outline"
            icon="i-lucide-arrow-right"
            trailing
            @click="
              activityDetailOpen = false;
              navigateTo(`/espacios/${selectedActivity?.id}`);
            "
          />
          <UButton
            v-if="canManageBranch"
            label="Editar espacio"
            icon="i-lucide-pencil"
            @click="editSelectedActivity"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="removeActivityModalOpen"
      title="Quitar espacio de la sede"
      :description="removeActivityDescription"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="outline"
            @click="removeActivityModalOpen = false"
          />
          <UButton
            label="Quitar de la sede"
            color="primary"
            :loading="removingClass"
            @click="removeActivity"
          />
        </div>
      </template>
    </UModal>

    <button
      class="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-red-400/40 bg-red-400/10 text-xs font-black text-red-400 transition hover:bg-red-400/20"
      @click="deleteModalOpen = true"
    >
      <Trash2 class="h-4 w-4" />
      Eliminar sede
    </button>

    <UModal
      v-model:open="deleteModalOpen"
      title="Eliminar sede"
      :description="deleteDescription"
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
            label="Eliminar sede"
            color="primary"
            :disabled="deleteBlocked"
            :loading="deleting"
            @click="deleteBranch"
          />
        </div>
      </template>
    </UModal>

  </div>

  <div
    v-else
    class="rounded-2xl border border-stroke bg-surface p-10 text-center text-sm font-semibold text-text-dim"
  >
    Sede no encontrada
  </div>
</template>
