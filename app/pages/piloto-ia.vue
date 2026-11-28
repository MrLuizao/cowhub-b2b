<script setup lang="ts">
import {
  AlertCircle,
  Bot,
  Building2,
  CalendarCheck,
  Clock,
  Plus,
  Power,
  Save,
  Send,
  Trash2,
  Wrench,
} from '@lucide/vue';

import type { AiPilotConfig, AiPilotSimulationResult } from '#shared/types';

const { session } = useAuth();
const toast = useToast();
const isAdmin = computed(() => session.value?.role === 'ADMIN');

const loading = ref(true);
const saving = ref(false);
const saveConfirmOpen = ref(false);
const toggleConfirmOpen = ref(false);
const provisioned = ref(false);
const hasGeminiKey = ref(false);

const form = reactive<AiPilotConfig>({
  enabled: true,
  agentName: 'Recepción · COW-HUB',
  tone: 'ejecutivo',
  scheduleMode: 'always',
  customInstructions: '',
  faqs: [],
  tools: {
    checkAvailability: true,
    createTour: true,
    createBooking: true,
  },
  maxAutoTurns: 12,
});

/// Sandbox de prueba en vivo
interface SimMessage {
  sender: 'member' | 'ai';
  text: string;
  toolsUsed?: Array<{ name: string; args: Record<string, unknown> }>;
  escalated?: boolean;
  escalationReason?: string | null;
}
const simMessages = ref<SimMessage[]>([]);
const simInput = ref('');
const simRunning = ref(false);
const simScrollEl = ref<HTMLElement | null>(null);

const isPilotLive = computed(() => provisioned.value && form.enabled);

function scrollSimToBottom(): void {
  nextTick(() => {
    if (simScrollEl.value) {
      simScrollEl.value.scrollTop = simScrollEl.value.scrollHeight;
    }
  });
}

async function loadConfig(): Promise<void> {
  loading.value = true;
  try {
    const res = await $api<{
      provisioned: boolean;
      hasGeminiKey: boolean;
      config: AiPilotConfig;
    }>('/api/ai-pilot/config');
    provisioned.value = res.provisioned;
    hasGeminiKey.value = res.hasGeminiKey;
    Object.assign(form, {
      ...res.config,
      faqs: res.config.faqs.map((f) => ({ ...f })),
      tools: { ...res.config.tools },
    });
  } catch (err) {
    console.error('[Piloto IA] Error cargando config:', err);
    toast.add({
      title: 'No se pudo cargar la configuración',
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}

function addFaq(): void {
  form.faqs.push({ q: '', a: '' });
}

function removeFaq(idx: number): void {
  form.faqs.splice(idx, 1);
}

async function persistConfig(overrideEnabled?: boolean): Promise<void> {
  if (!isAdmin.value || saving.value) return;
  saving.value = true;
  try {
    const nextEnabled =
      typeof overrideEnabled === 'boolean' ? overrideEnabled : form.enabled;
    const res = await $api<{ config: AiPilotConfig }>('/api/ai-pilot/config', {
      method: 'PUT',
      body: {
        enabled: nextEnabled,
        agentName: form.agentName,
        tone: form.tone,
        scheduleMode: form.scheduleMode,
        customInstructions: form.customInstructions,
        faqs: form.faqs.filter((f) => f.q.trim() && f.a.trim()),
        tools: { ...form.tools },
        maxAutoTurns: Number(form.maxAutoTurns) || 12,
      },
    });
    Object.assign(form, {
      ...res.config,
      faqs: res.config.faqs.map((f) => ({ ...f })),
      tools: { ...res.config.tools },
    });
    saveConfirmOpen.value = false;
    toggleConfirmOpen.value = false;
    toast.add({
      title:
        typeof overrideEnabled === 'boolean'
          ? nextEnabled
            ? 'Piloto IA activado'
            : 'Piloto IA pausado'
          : 'Configuración guardada',
      color: 'success',
    });
  } catch {
    toast.add({
      title: 'No se pudo guardar la configuración',
      color: 'error',
    });
  } finally {
    saving.value = false;
  }
}

async function runSimulation(): Promise<void> {
  const text = simInput.value.trim();
  if (!text || simRunning.value) return;
  const prior = simMessages.value.map((m) => ({ sender: m.sender, text: m.text }));
  simMessages.value.push({ sender: 'member', text });
  simInput.value = '';
  simRunning.value = true;
  scrollSimToBottom();

  try {
    const res = await $api<AiPilotSimulationResult>('/api/ai-pilot/simulate', {
      method: 'POST',
      body: {
        message: text,
        history: prior,
        configOverride: {
          agentName: form.agentName,
          tone: form.tone,
          customInstructions: form.customInstructions,
          faqs: form.faqs,
          tools: { ...form.tools },
        },
      },
    });
    simMessages.value.push({
      sender: 'ai',
      text: res.reply,
      toolsUsed: res.toolsUsed,
      escalated: res.escalated,
      escalationReason: res.escalationReason,
    });
  } catch {
    simMessages.value.push({
      sender: 'ai',
      text: 'No se pudo ejecutar la simulación con el servidor.',
    });
  } finally {
    simRunning.value = false;
    scrollSimToBottom();
  }
}

onMounted(() => {
  void loadConfig();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Encabezado descriptivo + Barra de herramientas -->
    <div>
      <h2 class="mb-3 text-sm font-black uppercase tracking-widest text-text-muted">
        Configuración operativa y simulador del agente autónomo
      </h2>

      <div class="flex flex-wrap items-center gap-3">
        <span
          class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
          :class="
            isPilotLive
              ? 'border-emerald-400/35 bg-emerald-400/15 text-emerald-400'
              : 'border-amber-400/35 bg-amber-400/15 text-amber-400'
          "
        >
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="isPilotLive ? 'bg-emerald-400' : 'bg-amber-400'"
          />
          {{ isPilotLive ? 'ACTIVO' : 'PAUSADO' }}
        </span>
        <span class="rounded-full border border-stroke bg-surface px-3 py-1 text-[11px] font-bold text-text-muted">
          {{ form.agentName }}
        </span>
        <span class="rounded-full border border-stroke bg-surface px-3 py-1 text-[11px] font-bold text-text-muted">
          {{ form.faqs.length }} preguntas frecuentes
        </span>

        <div v-if="isAdmin" class="ml-auto flex items-center gap-2.5">
          <button
            type="button"
            class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2.5 text-xs font-bold transition"
            :class="
              form.enabled
                ? 'border-amber-400/40 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20'
                : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20'
            "
            :disabled="loading || saving"
            @click="toggleConfirmOpen = true"
          >
            <Power class="h-3.5 w-3.5" />
            {{ form.enabled ? 'Pausar piloto' : 'Activar piloto' }}
          </button>

          <button
            type="button"
            class="flex shrink-0 cursor-pointer items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-base transition hover:opacity-90 disabled:opacity-50"
            :disabled="loading || saving"
            @click="saveConfirmOpen = true"
          >
            <Save class="h-4 w-4" />
            Guardar cambios
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="loading"
      class="rounded-2xl border border-stroke bg-surface p-10 text-center text-xs text-text-dim"
    >
      Cargando configuración del Piloto IA...
    </div>

    <div v-else class="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.9fr]">
      <!-- Columna izquierda: Configuración -->
      <div class="space-y-5">
        <!-- Identidad y operación -->
        <section class="space-y-4 rounded-2xl border border-stroke bg-surface p-5">
          <h3 class="text-xs font-black uppercase tracking-widest text-text-primary">
            Identidad y operación
          </h3>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="block text-[10px] font-bold uppercase tracking-widest text-text-dim">
                Nombre interno del perfil
              </label>
              <input
                v-model="form.agentName"
                type="text"
                :disabled="!isAdmin"
                maxlength="60"
                class="mt-1.5 w-full rounded-xl border border-stroke bg-base px-3.5 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent disabled:opacity-60"
              />
            </div>

            <div>
              <label class="block text-[10px] font-bold uppercase tracking-widest text-text-dim">
                Tono de respuesta
              </label>
              <USelect
                v-model="form.tone"
                :disabled="!isAdmin"
                :items="[
                  { label: 'Ejecutivo (Business Center)', value: 'ejecutivo' },
                  { label: 'Cercano y amigable', value: 'cercano' },
                  { label: 'Directo y breve', value: 'directo' },
                ]"
                size="lg"
                class="mt-1.5 w-full"
                :ui="{ base: 'h-10 rounded-xl border border-stroke bg-base px-3.5 text-sm text-text-primary ring-0 shadow-none' }"
              />
            </div>

            <div>
              <label class="block text-[10px] font-bold uppercase tracking-widest text-text-dim">
                Horario de atención automática
              </label>
              <USelect
                v-model="form.scheduleMode"
                :disabled="!isAdmin"
                :items="[
                  { label: '24/7 (siempre primer nivel)', value: 'always' },
                  { label: 'Solo fuera de horario de recepción', value: 'after_hours' },
                ]"
                size="lg"
                class="mt-1.5 w-full"
                :ui="{ base: 'h-10 rounded-xl border border-stroke bg-base px-3.5 text-sm text-text-primary ring-0 shadow-none' }"
              />
            </div>

            <div>
              <label class="block text-[10px] font-bold uppercase tracking-widest text-text-dim">
                Turnos máx. antes de escalar
              </label>
              <input
                v-model.number="form.maxAutoTurns"
                type="number"
                min="2"
                max="30"
                :disabled="!isAdmin"
                class="mt-1.5 w-full rounded-xl border border-stroke bg-base px-3.5 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent disabled:opacity-60"
              />
            </div>
          </div>
        </section>

        <!-- Herramientas operativas -->
        <section class="space-y-4 rounded-2xl border border-stroke bg-surface p-5">
          <h3 class="text-xs font-black uppercase tracking-widest text-text-primary">
            Herramientas operativas (datos reales)
          </h3>

          <div class="grid gap-3 sm:grid-cols-3">
            <label
              class="flex cursor-pointer items-start gap-3 rounded-xl border border-stroke bg-base p-4 transition hover:border-accent/40"
            >
              <input
                v-model="form.tools.checkAvailability"
                type="checkbox"
                :disabled="!isAdmin"
                class="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--color-accent)]"
              />
              <div>
                <p class="flex items-center gap-1.5 text-xs font-bold text-text-primary">
                  <Clock class="h-3.5 w-3.5 text-accent" />
                  Consultar disponibilidad
                </p>
                <p class="mt-0.5 text-[11px] text-text-dim">
                  Lee horarios libres reales de salas en Firestore por fecha.
                </p>
              </div>
            </label>

            <label
              class="flex cursor-pointer items-start gap-3 rounded-xl border border-stroke bg-base p-4 transition hover:border-accent/40"
            >
              <input
                v-model="form.tools.createTour"
                type="checkbox"
                :disabled="!isAdmin"
                class="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--color-accent)]"
              />
              <div>
                <p class="flex items-center gap-1.5 text-xs font-bold text-text-primary">
                  <CalendarCheck class="h-3.5 w-3.5 text-accent" />
                  Agendar tours en chat
                </p>
                <p class="mt-0.5 text-[11px] text-text-dim">
                  Registra folios TOUR-XXXXXX directo en Agenda Web y avisa por correo.
                </p>
              </div>
            </label>

            <label
              class="flex cursor-pointer items-start gap-3 rounded-xl border border-stroke bg-base p-4 transition hover:border-accent/40"
            >
              <input
                v-model="form.tools.createBooking"
                type="checkbox"
                :disabled="!isAdmin"
                class="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--color-accent)]"
              />
              <div>
                <p class="flex items-center gap-1.5 text-xs font-bold text-text-primary">
                  <Building2 class="h-3.5 w-3.5 text-accent" />
                  Reservar espacios en chat
                </p>
                <p class="mt-0.5 text-[11px] text-text-dim">
                  Crea reservas CH-XXXXXX en Agenda Web validando traslapes y horario.
                </p>
              </div>
            </label>
          </div>
        </section>

        <!-- Instrucciones y FAQs -->
        <section class="space-y-4 rounded-2xl border border-stroke bg-surface p-5">
          <h3 class="text-xs font-black uppercase tracking-widest text-text-primary">
            Reglas del negocio y preguntas frecuentes
          </h3>

          <div>
            <label class="block text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Instrucciones generales
            </label>
            <textarea
              v-model="form.customInstructions"
              rows="4"
              :disabled="!isAdmin"
              maxlength="2500"
              class="mt-1.5 w-full rounded-xl border border-stroke bg-base px-3.5 py-2.5 text-xs leading-relaxed text-text-primary outline-none transition focus:border-accent disabled:opacity-60"
            />
          </div>

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
                FAQs personalizadas ({{ form.faqs.length }})
              </span>
              <button
                v-if="isAdmin"
                type="button"
                class="inline-flex cursor-pointer items-center gap-1 rounded-full border border-stroke bg-base px-3 py-1.5 text-[11px] font-bold text-text-primary transition hover:border-accent/50"
                @click="addFaq"
              >
                <Plus class="h-3 w-3" />
                Agregar FAQ
              </button>
            </div>

            <div
              v-for="(faq, idx) in form.faqs"
              :key="idx"
              class="space-y-2 rounded-xl border border-stroke bg-base p-3.5"
            >
              <div class="flex items-center gap-2">
                <input
                  v-model="faq.q"
                  type="text"
                  placeholder="Pregunta frecuente..."
                  :disabled="!isAdmin"
                  class="flex-1 rounded-lg border border-stroke bg-surface px-3 py-2 text-xs text-text-primary outline-none transition focus:border-accent"
                />
                <button
                  v-if="isAdmin"
                  type="button"
                  aria-label="Eliminar FAQ"
                  class="cursor-pointer rounded-lg border border-red-400/35 bg-red-400/10 p-2 text-red-400 transition hover:bg-red-400/20"
                  @click="removeFaq(idx)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                v-model="faq.a"
                rows="2"
                placeholder="Respuesta oficial..."
                :disabled="!isAdmin"
                class="w-full rounded-lg border border-stroke bg-surface px-3 py-2 text-xs text-text-primary outline-none transition focus:border-accent"
              />
            </div>
          </div>
        </section>
      </div>

      <!-- Columna derecha: Sandbox de simulación -->
      <section class="flex h-[40rem] flex-col overflow-hidden rounded-2xl border border-stroke bg-surface">
        <div class="flex items-center justify-between border-b border-stroke p-4">
          <div>
            <h3 class="text-xs font-black uppercase tracking-widest text-text-primary">
              Simulador en vivo
            </h3>
            <p class="text-[11px] text-text-dim">
              Prueba respuestas y herramientas sin crear tours reales
            </p>
          </div>
          <button
            v-if="simMessages.length"
            type="button"
            class="cursor-pointer rounded-full border border-stroke bg-base px-3 py-1 text-[10px] font-bold text-text-muted transition hover:text-text-primary"
            @click="simMessages = []"
          >
            Limpiar
          </button>
        </div>

        <div ref="simScrollEl" class="flex-1 space-y-3 overflow-y-auto p-4">
          <div
            v-if="simMessages.length === 0"
            class="space-y-3 py-10 text-center text-xs text-text-dim"
          >
            <Bot class="mx-auto h-10 w-10 opacity-30" />
            <p>Prueba preguntas frecuentes o consultas en vivo:</p>
            <div class="flex flex-wrap justify-center gap-1.5">
              <button
                v-for="sample in [
                  '¿Qué salas tienen y cuánto cuestan?',
                  '¿Hay disponibilidad mañana en la sala de juntas?',
                  'Quiero hablar con una persona',
                ]"
                :key="sample"
                type="button"
                class="cursor-pointer rounded-xl border border-stroke bg-base px-3 py-1.5 text-[11px] text-text-secondary transition hover:border-accent/50 hover:text-text-primary"
                @click="simInput = sample; runSimulation()"
              >
                {{ sample }}
              </button>
            </div>
          </div>

          <div
            v-for="(m, idx) in simMessages"
            :key="idx"
            class="flex flex-col"
            :class="m.sender === 'member' ? 'items-end' : 'items-start'"
          >
            <div
              class="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed"
              :class="
                m.sender === 'member'
                  ? 'bg-accent font-medium text-base'
                  : 'border border-stroke bg-base text-text-primary'
              "
            >
              <p class="whitespace-pre-wrap">{{ m.text }}</p>
            </div>

            <div v-if="m.toolsUsed?.length || m.escalated" class="mt-1.5 flex flex-wrap gap-1.5">
              <span
                v-for="(t, ti) in m.toolsUsed"
                :key="ti"
                class="inline-flex items-center gap-1 rounded-md border border-accent/35 bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent"
              >
                <Wrench class="h-2.5 w-2.5" />
                {{ t.name }}
              </span>
              <span
                v-if="m.escalated"
                class="inline-flex items-center gap-1 rounded-md border border-red-400/35 bg-red-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400"
              >
                <AlertCircle class="h-2.5 w-2.5" />
                Escalado: {{ m.escalationReason }}
              </span>
            </div>
          </div>

          <div v-if="simRunning" class="text-[11px] text-text-dim">
            Consultando datos reales y redactando respuesta...
          </div>
        </div>

        <form class="flex items-center gap-2 border-t border-stroke p-3.5" @submit.prevent="runSimulation">
          <input
            v-model="simInput"
            type="text"
            placeholder="Escribe como si fueras un cliente..."
            class="flex-1 rounded-xl border border-stroke bg-base px-3.5 py-2.5 text-xs text-text-primary outline-none transition focus:border-accent"
          />
          <button
            type="submit"
            :disabled="!simInput.trim() || simRunning"
            class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-accent text-base transition hover:opacity-90 disabled:opacity-50"
          >
            <Send class="h-4 w-4" />
          </button>
        </form>
      </section>
    </div>

    <!-- Confirmación pausar / activar piloto -->
    <UModal
      v-model:open="toggleConfirmOpen"
      :title="form.enabled ? 'Pausar Piloto IA' : 'Activar Piloto IA'"
      :description="
        form.enabled
          ? 'Los nuevos chats pasarán directamente a recepción humana hasta que vuelvas a activar el piloto.'
          : 'El piloto volverá a responder automáticamente en primer nivel los nuevos chats entrantes.'
      "
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="outline"
            @click="toggleConfirmOpen = false"
          />
          <UButton
            :label="form.enabled ? 'Pausar piloto' : 'Activar piloto'"
            :color="form.enabled ? 'warning' : 'success'"
            :loading="saving"
            @click="persistConfig(!form.enabled)"
          />
        </div>
      </template>
    </UModal>

    <!-- Confirmación de guardado -->
    <UModal
      v-model:open="saveConfirmOpen"
      title="Guardar configuración del Piloto IA"
      description="Los cambios aplicarán de inmediato a las conversaciones nuevas y activas atendidas por el piloto."
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="outline"
            @click="saveConfirmOpen = false"
          />
          <UButton
            label="Guardar cambios"
            color="primary"
            :loading="saving"
            @click="persistConfig()"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
