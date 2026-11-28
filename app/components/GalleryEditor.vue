<script setup lang="ts">
import { Plus, Trash2 } from '@lucide/vue';

const props = defineProps<{
  modelValue: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

const draftUrl = ref('');

function addUrl(): void {
  const url = draftUrl.value.trim();
  if (!url) return;
  if (!props.modelValue.includes(url)) {
    emit('update:modelValue', [...props.modelValue, url]);
  }
  draftUrl.value = '';
}

function removeAt(idx: number): void {
  const next = [...props.modelValue];
  next.splice(idx, 1);
  emit('update:modelValue', next);
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex gap-2">
      <input
        v-model="draftUrl"
        type="url"
        placeholder="https://... (pega URL de foto para la galería)"
        class="flex-1 rounded-xl border border-stroke bg-base px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
        @keydown.enter.prevent="addUrl"
      />
      <button
        type="button"
        class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-stroke bg-base px-3 py-2 text-xs font-bold text-text-primary transition hover:border-accent hover:text-accent"
        @click="addUrl"
      >
        <Plus class="h-3.5 w-3.5" />
        Agregar
      </button>
    </div>

    <div v-if="modelValue.length" class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <div
        v-for="(url, idx) in modelValue"
        :key="url + idx"
        class="group relative overflow-hidden rounded-xl border border-stroke bg-base"
      >
        <img :src="url" :alt="`Foto galería ${idx + 1}`" class="h-20 w-full object-cover" />
        <button
          type="button"
          title="Quitar foto"
          class="absolute right-1.5 top-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-base/85 text-red-400 transition hover:bg-red-500 hover:text-white"
          @click="removeAt(idx)"
        >
          <Trash2 class="h-3 w-3" />
        </button>
      </div>
    </div>
    <p v-else class="text-[11px] text-text-dim">
      Sin fotos adicionales en galería. Se mostrará solo la imagen principal.
    </p>
  </div>
</template>
