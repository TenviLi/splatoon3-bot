<template>
  <div class="min-h-screen grow flex items-center justify-center">
    <div class="text-center space-y-4">
      <div><strong>Screenshots</strong></div>

      <div v-for="group in screenshotNavigationGroups" :key="group.label ?? 'screenshots'">
        <template v-if="group.label">{{ group.label }}: </template>
        <template v-for="route in group.routes" :key="route.name">
          <router-link :to="route.path">{{ route.label }}</router-link>&nbsp;
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { screenshotNavigationGroups } from '@/common/screenshotRoutes.mjs'
</script>

<style scoped>
@reference "../../assets/css/base.css";

a {
  @apply underline;
}
</style>
