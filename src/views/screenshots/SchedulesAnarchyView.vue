<template>
  <ScreenshotLayout :header="$t('screenshot.headers.schedules')">
    <div class="grow flex items-center justify-center">
      <div
        v-if="contentReady"
        data-screenshot-content="schedules-anarchy"
        class="flex items-center justify-center gap-12 mx-8"
      >
        <ScreenshotScheduleBox type="anarchySeries" class="w-96 -rotate-1" />
        <ScreenshotScheduleBox type="anarchyOpen" class="w-96 rotate-1" />
      </div>
    </div>
  </ScreenshotLayout>
</template>

<script setup>
import { computed } from 'vue'
import ScreenshotLayout from '@/layouts/ScreenshotLayout.vue'
import ScreenshotScheduleBox from '@/components/screenshots/ScreenshotScheduleBox.vue'
import { hasBattleScheduleContent } from '@/common/contentAvailability.mjs'
import {
  useAnarchyOpenSchedulesStore,
  useAnarchySeriesSchedulesStore,
} from '@/stores/schedules.mjs'

const anarchySeriesSchedules = useAnarchySeriesSchedulesStore()
const anarchyOpenSchedules = useAnarchyOpenSchedulesStore()
const contentReady = computed(() =>
  [anarchySeriesSchedules, anarchyOpenSchedules]
    .every((store) => hasBattleScheduleContent(store.activeSchedule))
)
</script>

<style>
body {
  background-image: url('@/assets/img/information-bg.jpg');
  background-size: 400px;
  background-position: center;
}
</style>
