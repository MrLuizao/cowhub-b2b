<script setup lang="ts">
// Redirección transparente a la nueva sección oficial de Salas
definePageMeta({
  middleware: [
    () => navigateTo('/salas'),
  ],
});
</script>

<template>
  <div />
</template>
