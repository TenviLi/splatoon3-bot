<template>
  <main data-screenshot-root class="screenshot-background relative h-screen flex flex-col overflow-hidden">
    <slot />

    <div class="h-16"></div>

    <div data-screenshot-footer class="h-12 m-4 bg-black bg-opacity-50 backdrop-blur-sm rounded-full absolute bottom-0 inset-x-0">
      <div class="flex justify-between h-full font-splatoon2 text-sm text-zinc-300">
        <div class="ml-4 flex min-w-0 flex-1 items-center gap-6">
          <div class="shrink-0">
            <img src="@/assets/img/favicon.svg" class="h-16 -my-8" />
          </div>
          <div class="flex min-w-0 items-center gap-8">
            <div class="shrink-0 text-3xl text-zinc-50">
              {{ props.header }}
            </div>
            <div data-screenshot-attribution class="min-w-0 max-w-64 truncate text-xl font-thin text-zinc-400">
              {{ screenshotAttribution }}
            </div>
          </div>
        </div>
        <div class="mr-6 flex shrink-0 items-center justify-end text-2xl">
          {{ formatDateTime(time.now) }}
        </div>
      </div>
    </div>

    <div class="fixed bottom-0 right-4 z-50">
      <TimeOffsetSelector v-if="isDev" class="mb-4" />
    </div>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useTimeStore } from '../stores/time'
import TimeOffsetSelector from '../components/Debug/TimeOffsetSelector.vue'
import { markScreenshotReady } from '../common/screenshotReady.mjs'
import { normalizeScreenshotAttribution } from '../common/screenshotAttribution.mjs'

const props = defineProps({
  header: {
    type: String,
  },
})

const route = useRoute()
const time = useTimeStore()
const { locale } = useI18n()
const screenshotAttribution = computed(() => normalizeScreenshotAttribution(route.query.attribution))

watchEffect(() => {
  if (route.query.time) {
    const renderTime = Number(route.query.time)
    if (!Number.isFinite(renderTime)) {
      throw new Error(`Invalid screenshot render time: ${route.query.time}`)
    }

    time.stopUpdatingNow()
    time.setNow(renderTime)
  }
})

function formatDateTime(date) {
  date = new Date(date)

  return date.toLocaleString(locale.value, {
    dateStyle: 'long',
    timeStyle: 'short',
  })
}

const isDev = import.meta.env.DEV

onMounted(async () => {
  await nextTick()
  await markScreenshotReady()
})
</script>

<style scoped>
@reference "../assets/css/base.css";

.screenshot-background {
  background-image: url('../assets/img/information-bg.jpg');
  background-position: center;
  background-size: 400px;
}

.footer-links a span {
  @apply text-zinc-300;
}

.footer-links a:hover span {
  @apply text-white underline;
}
</style>
