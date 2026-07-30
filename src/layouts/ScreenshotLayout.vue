<template>
  <main data-screenshot-root class="screenshot-background relative h-screen flex flex-col overflow-hidden">
    <slot />

    <div class="h-16"></div>

    <div data-screenshot-footer class="h-12 m-4 bg-black bg-opacity-50 backdrop-blur-sm rounded-full absolute bottom-0 inset-x-0">
      <div class="flex justify-between h-full font-splatoon2 text-sm text-zinc-300">
        <div class="flex justify-start items-center space-x-6 ml-4">
          <div>
            <img src="@/assets/img/favicon.svg" class="h-16 -my-8" />
          </div>
          <div class="flex items-center space-x-8">
            <div class="text-3xl text-zinc-50">
              {{ props.header }}
            </div>
            <div class="text-xl text-thin text-zinc-500">
              <img src="@/assets/img/wxwork-icon.png" width="20" height="20" class="inline" />
              @锂碘
            </div>
            <!-- <div>splatoon3.ink</div> -->
          </div>
        </div>
        <div class="flex justify-end items-center mr-6 text-2xl">
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
import { nextTick, onMounted, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useTimeStore } from '../stores/time'
import TimeOffsetSelector from '../components/Debug/TimeOffsetSelector.vue'
import { markScreenshotReady } from '../common/screenshotReady.mjs'

const props = defineProps({
  header: {
    type: String,
  },
})

const route = useRoute()
const time = useTimeStore()

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

  return date.toLocaleString('zh-CN', {
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
