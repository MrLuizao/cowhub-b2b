<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg' | 'xl';
    showTagline?: boolean;
    tagline?: string;
    showIcon?: boolean;
    iconOnly?: boolean;
  }>(),
  {
    size: 'md',
    showTagline: true,
    tagline: 'COWORKING HUB',
    showIcon: true,
    iconOnly: false,
  },
);

const iconSizes = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
  xl: 'h-12 w-12',
};

const textSizes = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
  xl: 'text-3xl',
};

const tagSizes = {
  sm: 'text-[8px] tracking-[0.2em]',
  md: 'text-[9px] tracking-[0.25em]',
  lg: 'text-[10px] tracking-[0.25em]',
  xl: 'text-[11px] tracking-[0.3em]',
};
</script>

<template>
  <div class="inline-flex items-center gap-3 select-none">
    <!-- El Portal: arcos arquitectónicos concéntricos + núcleo bronce -->
    <svg
      v-if="showIcon || iconOnly"
      :class="iconSizes[size]"
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8.5 31V15.5C8.5 10.2533 12.7533 6 18 6C23.2467 6 27.5 10.2533 27.5 15.5V31H24.2"
        class="stroke-accent"
        stroke-width="1.5"
        stroke-linecap="square"
      />
      <path
        d="M11.8 31H8.5M12.2 31V15.8C12.2 12.5967 14.7967 10 18 10C21.2033 10 23.8 12.5967 23.8 15.8V31"
        class="stroke-accent"
        stroke-width="1.5"
        stroke-linecap="square"
      />
      <circle cx="18" cy="19.5" r="2.2" class="fill-accent" />
    </svg>

    <!-- Wordmark -->
    <div v-if="!iconOnly" class="min-w-0">
      <div class="flex items-baseline leading-none">
        <span
          class="brand-wordmark font-normal uppercase tracking-[0.22em] text-text-primary"
          :class="textSizes[size]"
        >
          COW<span class="text-accent">HUB</span>
        </span>
      </div>
      <p
        v-if="showTagline"
        class="mt-1.5 font-medium uppercase text-text-dim leading-none"
        :class="tagSizes[size]"
      >
        {{ tagline }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.brand-wordmark {
  font-family: 'Marcellus', var(--font-display);
}
</style>
