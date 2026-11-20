<script setup lang="ts">
import type { Chart } from 'chart.js';

import type { TrafficPoint } from '#shared/types';

const props = defineProps<{ traffic: TrafficPoint[] }>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let chart: Chart<'bar', number[], string> | null = null;

function labelsOf(points: TrafficPoint[]): string[] {
  return points.map((point) => `${String(point.hour).padStart(2, '0')}h`);
}

function valuesOf(points: TrafficPoint[]): number[] {
  return points.map((point) => point.value);
}

onMounted(async () => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const { default: ChartCtor } = await import('chart.js/auto');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  chart = new ChartCtor(ctx, {
    type: 'bar',
    data: {
      labels: labelsOf(props.traffic),
      datasets: [
        {
          label: 'Accesos',
          data: valuesOf(props.traffic),
          backgroundColor: 'rgba(152, 157, 231, 0.55)',
          hoverBackgroundColor: '#989DE7',
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 28,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#FFFFFF',
          borderColor: 'rgba(20, 19, 24, 0.08)',
          borderWidth: 1,
          titleColor: '#141318',
          bodyColor: '#52525B',
          padding: 12,
          cornerRadius: 12,
          displayColors: true,
          boxWidth: 8,
          boxHeight: 8,
          usePointStyle: true,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#706F7C', font: { family: 'Outfit', size: 11 } },
          border: { display: false },
        },
        y: {
          position: 'right',
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#706F7C', font: { family: 'Outfit', size: 11 } },
          border: { display: false },
        },
      },
    },
  });
});

watch(
  () => props.traffic,
  (traffic) => {
    if (!chart) return;
    chart.data.labels = labelsOf(traffic);
    chart.data.datasets[0]!.data = valuesOf(traffic);
    chart.update();
  },
);

onBeforeUnmount(() => {
  chart?.destroy();
});
</script>

<template>
  <div class="h-full min-h-64">
    <canvas ref="canvasRef" />
  </div>
</template>
