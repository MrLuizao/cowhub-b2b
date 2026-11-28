<script setup lang="ts">
import { parseDate, type DateValue } from '@internationalized/date';
import { Calendar } from '@lucide/vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    min?: string;
    max?: string;
    disabled?: boolean;
    placeholder?: string;
    buttonClass?: string;
  }>(),
  {
    min: undefined,
    max: undefined,
    disabled: false,
    placeholder: 'Seleccionar fecha',
    buttonClass: '',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const open = ref(false);

const calendarValue = computed({
  get: () => {
    if (!props.modelValue || !/^\d{4}-\d{2}-\d{2}$/.test(props.modelValue)) return undefined;
    try {
      return parseDate(props.modelValue);
    } catch {
      return undefined;
    }
  },
  set: (val: DateValue | undefined) => {
    if (val) {
      emit('update:modelValue', val.toString());
      open.value = false;
    }
  },
});

const minDate = computed(() => {
  if (!props.min || !/^\d{4}-\d{2}-\d{2}$/.test(props.min)) return undefined;
  try {
    return parseDate(props.min);
  } catch {
    return undefined;
  }
});

const maxDate = computed(() => {
  if (!props.max || !/^\d{4}-\d{2}-\d{2}$/.test(props.max)) return undefined;
  try {
    return parseDate(props.max);
  } catch {
    return undefined;
  }
});

const formatted = computed(() => {
  if (!props.modelValue || !/^\d{4}-\d{2}-\d{2}$/.test(props.modelValue)) return '';
  const [y, m, d] = props.modelValue.split('-');
  return `${d}/${m}/${y}`;
});
</script>

<template>
  <UPopover v-model:open="open">
    <button
      type="button"
      :disabled="disabled"
      class="flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-stroke bg-base px-3 text-left text-xs text-text-primary transition hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
      :class="buttonClass"
    >
      <span :class="formatted ? 'text-text-primary' : 'text-text-dim'">
        {{ formatted || placeholder }}
      </span>
      <Calendar class="h-3.5 w-3.5 shrink-0 text-text-dim" />
    </button>
    <template #content>
      <UCalendar
        v-model="calendarValue"
        :min-value="minDate"
        :max-value="maxDate"
        class="p-2"
      />
    </template>
  </UPopover>
</template>
