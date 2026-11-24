<script setup lang="ts">
import type { Component } from 'vue';

const props = withDefaults(
  defineProps<{
    label: string;
    value: string;
    trend: number;
    spark: number[];
    icon?: Component;
  }>(),
  { icon: undefined },
);

const trendClasses = computed(() =>
  props.trend >= 0
    ? 'bg-pastel-lavender/15 text-pastel-lavender ring-1 ring-inset ring-pastel-lavender/25'
    : 'bg-pastel-pink/15 text-pastel-pink ring-1 ring-inset ring-pastel-pink/25',
);
</script>

<template>
  <div class="rounded-2xl border border-stroke bg-surface p-5 transition-colors hover:border-white/15">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-sm font-medium text-text-muted">
          {{ props.label }}
        </p>
        <p class="mt-2.5 text-3xl font-semibold tracking-tight text-white">
          {{ props.value }}
        </p>
      </div>
      <div
        v-if="props.icon"
        class="rounded-xl border border-stroke bg-surface-elevated p-2 text-text-muted"
      >
        <component :is="props.icon" class="h-4 w-4" />
      </div>
    </div>
    <div class="mt-4 flex items-end justify-between gap-3">
      <Sparkline :values="props.spark" :positive="props.trend >= 0" :width="110" :height="32" />
      <span
        class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
        :class="trendClasses"
      >
        {{ props.trend >= 0 ? '+' : '' }}{{ props.trend.toFixed(1) }}%
      </span>
    </div>
  </div>
</template>
