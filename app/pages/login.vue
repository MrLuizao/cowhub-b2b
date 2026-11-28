<script setup lang="ts">
import {
  ArrowRight,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MessageCircle,
  ScanLine,
} from '@lucide/vue';

definePageMeta({ layout: false });

const { login, session } = useAuth();
const firebase = useFirebase();

/// Credenciales demo prellenadas para entrar rápido en presentaciones.
const email = ref('admin@cowhub.mx');
const password = ref('CowHub2026!');
const role = ref<StaffRole>('ADMIN');
const showPassword = ref(false);
const errorMessage = ref<string | null>(null);
const submitting = ref(false);
/// Transición de salida (como la referencia): el panel oscuro se
/// expande de izquierda a derecha hasta cubrir la pantalla antes de
/// navegar al panel.
const leaving = ref(false);

/// Slideshow del panel derecho - rota solo cada SLIDE_MS, con flechas
/// y barra de progreso como en la referencia. Las "escenas" son CSS
/// puro (texturas oscuras + acento) para no depender de assets.
const SLIDE_MS = 6000;
const slides = [
  {
    icon: ScanLine,
    title: 'Acceso por QR y ocupación en vivo',
    desc: 'La entrada de miembros y visitantes, medida en tiempo real por sede.',
    scene: 'dots',
  },
  {
    icon: CalendarCheck,
    title: 'Actividades, reservas y staff',
    desc: 'Horarios, cupo y anfitriones organizados por sucursal.',
    scene: 'bars',
  },
  {
    icon: MessageCircle,
    title: 'Salas en vivo, tours y soporte',
    desc: 'Atiende solicitudes de recorrido, chat con miembros y disponibilidad al instante.',
    scene: 'beam',
  },
] as const;

const slideIndex = ref(0);
const slideTick = ref(0); /// reinicia la barra de progreso
let slideTimer: ReturnType<typeof setInterval> | null = null;

function goSlide(i: number): void {
  slideIndex.value = (i + slides.length) % slides.length;
  slideTick.value++;
  restartTimer();
}
function restartTimer(): void {
  if (slideTimer) clearInterval(slideTimer);
  slideTimer = setInterval(() => {
    slideIndex.value = (slideIndex.value + 1) % slides.length;
    slideTick.value++;
  }, SLIDE_MS);
}
onMounted(restartTimer);
onBeforeUnmount(() => slideTimer && clearInterval(slideTimer));

async function submit(): Promise<void> {
  errorMessage.value = null;
  submitting.value = true;
  try {
    await login(email.value, password.value, role.value);
    /// Wipe: el overlay negro cubre la pantalla (~700ms) y en cuanto la
    /// tapa navegamos - el home entra con skeleton, sin pantalla extra.
    leaving.value = true;
    await new Promise((r) => setTimeout(r, 700));
    await navigateTo(homeFor(session.value?.role));
  } catch (cause) {
    errorMessage.value =
      cause instanceof Error ? cause.message : 'No se pudo iniciar sesión';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen bg-base">
    <!-- Formulario -->
    <div class="flex min-h-screen w-full flex-col px-6 py-8 sm:px-10 lg:w-[440px] lg:shrink-0 xl:w-[480px]">
      <div class="mx-auto my-auto w-full max-w-sm py-6">
        <div class="mb-2">
          <CowhubLogo size="lg" tagline="CONSOLA ADMINISTRATIVA" />
        </div>

        <h2 class="mt-10 text-3xl font-black tracking-tight text-text-primary">
          Inicia sesión
        </h2>
        <p class="mt-2 text-xs leading-relaxed text-text-dim">
          {{
            firebase.enabled
              ? 'Acceso con cuenta de staff - tu perfil lo asigna el negocio.'
              : 'Modo demo: cualquier email válido y contraseña de 4+ caracteres.'
          }}
        </p>

        <form class="mt-9 space-y-5" @submit.prevent="submit()">
          <div>
            <label for="email" class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Email corporativo
            </label>
            <div class="relative mt-2">
              <Mail class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
              <input id="email" v-model="email" type="email" autocomplete="email" placeholder="staff@tunegocio.mx"
                class="w-full rounded-xl border border-stroke bg-surface py-3 pl-11 pr-4 text-sm text-text-primary outline-none transition placeholder:text-text-dim/60 focus:border-accent" />
            </div>
          </div>

          <div>
            <label for="password" class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Contraseña
            </label>
            <div class="relative mt-2">
              <Lock class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
              <input id="password" v-model="password" :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password" placeholder="••••••••"
                class="w-full rounded-xl border border-stroke bg-surface py-3 pl-11 pr-12 text-sm text-text-primary outline-none transition placeholder:text-text-dim/60 focus:border-accent" />
              <button type="button" :aria-label="showPassword ? 'Ocultar' : 'Mostrar'"
                class="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-dim transition hover:text-text-primary"
                @click="showPassword = !showPassword">
                <component :is="showPassword ? EyeOff : Eye" class="h-4 w-4" />
              </button>
            </div>
          </div>

          <div v-if="!firebase.enabled">
            <label for="role" class="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Perfil (demo)
            </label>
            <USelect
              id="role"
              v-model="role"
              :items="[
                { label: 'Admin global', value: 'ADMIN' },
                { label: 'Gerente de sede', value: 'MANAGER' },
                { label: 'Recepcionista', value: 'RECEPTIONIST' },
              ]"
              size="lg"
              class="mt-2 w-full"
              :ui="{ base: 'h-11 rounded-xl border border-stroke bg-surface px-4 text-sm text-text-primary ring-0 shadow-none' }"
            />
          </div>

          <p v-if="errorMessage"
            class="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-xs font-bold text-red-400">
            {{ errorMessage }}
          </p>

          <button type="submit" :disabled="submitting"
            class="group flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3.5 text-sm font-semibold text-[#141318] transition hover:bg-white/90 disabled:opacity-50">
            {{ submitting ? 'Ingresando…' : 'Ingresar al panel' }}
            <ArrowRight v-if="!submitting" class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </form>

        <p class="mt-6 text-center text-[11px] text-text-dim">
          <NuxtLink to="/legal/aviso-privacidad"
            class="underline underline-offset-2 transition hover:text-text-primary">
            Aviso de privacidad
          </NuxtLink>
        </p>
      </div>

      <div class="mx-auto mt-6 flex w-full max-w-sm justify-center">
        <a href="https://foundry-landing-pi.vercel.app/" target="_blank" rel="noopener noreferrer" class="shrink-0"
          style="margin-left: 2em;">
          <img src="/brand/fundere-original-dark.png" alt="FUNDERE Software Studio"
            class="h-12 w-auto cursor-pointer object-contain mix-blend-screen" />
        </a>
      </div>
    </div>

    <!-- Slideshow -->
    <div class="relative hidden flex-1 overflow-hidden border-l border-stroke lg:block">
      <!-- Escenas -->
      <div v-for="(s, i) in slides" :key="i" class="absolute inset-0 transition-all duration-700 ease-out" :class="i === slideIndex
        ? 'translate-x-0 opacity-100'
        : i < slideIndex ||
          (slideIndex === 0 && i === slides.length - 1)
          ? '-translate-x-8 opacity-0'
          : 'translate-x-8 opacity-0'
        ">
        <!-- Escena: dots (textura perforada con acentos pastel) -->
        <div v-if="s.scene === 'dots'" class="flowdesk-canvas absolute inset-0">
          <div
            class="absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,0.12)_1px,transparent_1.6px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_65%_40%,black_25%,transparent_75%)]" />
          <div
            class="absolute -right-32 top-1/4 h-[480px] w-[480px] rounded-full bg-gradient-to-tr from-[#989de7]/25 via-[#ff98cb]/15 to-[#ffcf68]/20 blur-[110px]" />
          <div
            class="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_90%,rgba(152,157,231,0.18),transparent_55%)]" />
        </div>
        <!-- Escena: bars (barras apiladas estilo FlowDesk) -->
        <div v-else-if="s.scene === 'bars'" class="flowdesk-canvas absolute inset-0">
          <div class="absolute inset-x-0 bottom-0 flex items-end gap-3 px-14 pb-10">
            <div v-for="(h, j) in [35, 60, 42, 78, 55, 92, 66, 48, 84, 38, 70, 58]" :key="j"
              class="flex flex-1 flex-col gap-1.5">
              <div class="w-full rounded-md transition-all"
                :class="j === 5 ? 'bg-pastel-yellow' : 'bg-pastel-yellow/35'"
                :style="{ height: `${Math.round(h * 0.65)}px` }" />
              <div class="w-full rounded-md transition-all" :class="j === 5 ? 'bg-pastel-pink' : 'bg-pastel-pink/35'"
                :style="{ height: `${Math.round(h * 0.9)}px` }" />
              <div class="w-full rounded-md transition-all"
                :class="j === 5 ? 'bg-pastel-lavender' : 'bg-pastel-lavender/35'"
                :style="{ height: `${Math.round(h * 1.45)}px` }" />
            </div>
          </div>
          <div class="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-base/75" />
        </div>
        <!-- Escena: beam (salas, tours y soporte) -->
        <div v-else class="flowdesk-canvas absolute inset-0">
          <div
            class="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#989de7]/30 to-[#ff98cb]/30 blur-[70px]" />
          <div v-for="r in 3" :key="r"
            class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-pastel-lavender/30"
            :style="{
              width: `${160 + r * 150}px`,
              height: `${160 + r * 150}px`,
              opacity: 0.5 - r * 0.13,
            }" />
          <div
            class="absolute inset-0 [background-image:linear-gradient(rgba(152,157,231,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(152,157,231,0.12)_1px,transparent_1px)] [background-size:60px_60px] opacity-40" />
        </div>

        <div class="absolute inset-0 bg-gradient-to-t from-base/80 via-transparent to-base/40" />
      </div>

      <!-- Caption -->
      <div class="absolute left-10 top-10 max-w-xs xl:left-14 xl:top-14">
        <Transition name="fade" mode="out-in">
          <div v-if="slides[slideIndex]" :key="slideIndex">
            <component :is="slides[slideIndex]?.icon" class="h-6 w-6 text-accent" />
            <p class="mt-4 text-xl font-black leading-snug tracking-tight text-text-primary">
              {{ slides[slideIndex]?.title }}
            </p>
            <p class="mt-2 text-xs leading-relaxed text-text-muted">
              {{ slides[slideIndex]?.desc }}
            </p>
          </div>
        </Transition>
      </div>

      <!-- Controles: barra de progreso + flechas -->
      <div class="absolute bottom-8 right-10 flex items-center gap-4 xl:right-14">
        <div class="h-px w-16 overflow-hidden bg-stroke">
          <div :key="slideTick" class="h-full bg-gradient-to-r from-[#989de7] via-[#ff98cb] to-[#ffcf68]"
            :style="{ animation: `slide-progress ${SLIDE_MS}ms linear forwards` }" />
        </div>
        <button type="button" aria-label="Anterior" class="text-text-muted transition hover:text-text-primary"
          @click="goSlide(slideIndex - 1)">
          <ChevronLeft class="h-5 w-5" />
        </button>
        <button type="button" aria-label="Siguiente" class="text-text-muted transition hover:text-text-primary"
          @click="goSlide(slideIndex + 1)">
          <ChevronRight class="h-5 w-5" />
        </button>
      </div>
    </div>

    <!-- Wipe de salida - cubre la pantalla de izquierda a derecha -->
    <div
      class="pointer-events-none fixed inset-0 z-50 -translate-x-full bg-base transition-transform duration-700 ease-[cubic-bezier(0.7,0,0.25,1)]"
      :class="leaving && 'translate-x-0'">
      <div
        class="absolute inset-x-0 bottom-0 h-2/3 bg-[radial-gradient(ellipse_at_50%_100%,rgba(152,157,231,0.22),rgba(255,152,203,0.12),transparent_60%)]" />
    </div>
  </div>
</template>

<style scoped>
@keyframes slide-progress {
  from {
    width: 0%;
  }

  to {
    width: 100%;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.45s ease,
    transform 0.45s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
