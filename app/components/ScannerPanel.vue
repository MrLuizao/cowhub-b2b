<script setup lang="ts">
import { Building2, Keyboard, ScanLine } from '@lucide/vue';

import type { PartnerProvider } from '#shared/types';

/// embedded = sin cromo de tarjeta ni título propio (va dentro de una
/// tarjeta padre que ya provee header, p. ej. /recepcion).
const props = defineProps<{ embedded?: boolean }>();

const emit = defineEmits<{
  detect: [code: string];
  partner: [provider: PartnerProvider, token: string];
}>();

/// Modo de captura: credencial de miembro o token de agregador
/// (visitas de externos - el token lo genera recepción).
const mode = ref<'member' | PartnerProvider>('member');
const usbCode = ref('');
const usbInputRef = ref<HTMLInputElement | null>(null);

const modes = [
  { id: 'member' as const, label: 'Miembro COW-HUB', logo: '/brand/icon.svg' },
];

function submitUsb(): void {
  const code = usbCode.value.trim();
  if (!code) return;
  if (mode.value === 'member') emit('detect', code);
  else emit('partner', mode.value, code);
  usbCode.value = '';
  usbInputRef.value?.focus();
}

onMounted(() => {
  usbInputRef.value?.focus();
});
</script>

<template>
  <div
    class="flex flex-col"
    :class="
      props.embedded
        ? ''
        : 'rounded-2xl border border-stroke bg-surface p-5'
    "
  >
    <div v-if="!props.embedded" class="flex items-center gap-2">
      <ScanLine class="h-4 w-4 text-accent" />
      <h2 class="text-sm font-black tracking-tight text-text-primary">
        Registro de acceso
      </h2>
    </div>

    <div class="mt-3 flex gap-1.5">
      <button
        v-for="m in modes"
        :key="m.id"
        type="button"
        class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest transition"
        :class="
          mode === m.id
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-stroke bg-base text-text-dim hover:text-text-muted'
        "
        @click="mode = m.id"
      >
        <img
          v-if="m.logo"
          :src="m.logo"
          :alt="m.label"
          class="-ml-1 h-4 w-4 rounded-sm"
        />
        {{ m.label }}
      </button>
    </div>

    <form class="mt-4 space-y-2" @submit.prevent="submitUsb()">
      <label
        class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-text-dim"
      >
        <Building2 v-if="mode !== 'member'" class="h-3.5 w-3.5" />
        <Keyboard v-else class="h-3.5 w-3.5" />
        {{ mode === 'member' ? 'Entrada del lector' : 'Token del agregador' }}
      </label>
      <input
        ref="usbInputRef"
        v-model="usbCode"
        type="text"
        autocomplete="off"
        :placeholder="
          mode === 'member'
            ? 'Escanea la credencial del miembro…'
            : 'Escanea o teclea el token del día…'
        "
        class="w-full rounded-xl border border-stroke bg-base px-4 py-3 font-mono text-base text-text-primary outline-none transition placeholder:text-text-dim focus:border-accent"
        @keydown.enter.prevent="submitUsb()"
      />
      <p class="text-[10px] leading-relaxed text-text-dim">
        {{
          mode === 'member'
            ? 'El lector actúa como teclado: este campo queda enfocado, escanea el QR o escribe el número de miembro y presiona Enter para registrar el acceso.'
            : 'El visitante externo genera su código de acceso en recepción - escanéalo o téclalo y presiona Enter. Se valida contra el agregador.'
        }}
      </p>
    </form>
  </div>
</template>
