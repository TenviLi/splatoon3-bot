<template>
  <ScreenshotLayout :header="$t('screenshot.headers.schedules')">
    <div class="grow flex items-center justify-center">
      <div
        v-if="activeFestivals.length > 0"
        :data-screenshot-content="contentReady ? 'schedules' : undefined"
        class="flex space-x-6 items-center mx-6"
      >
        <div :class="marginsClass">
          <SplatfestMultiBox
            :festivals="activeFestivals"
            class="flex-1 md:-rotate-1"
            :class="`${splatfestSizeClass} ${regionSizeClass}`"
          />
        </div>
        <ScreenshotScheduleBox type="splatfestOpen" class="flex-1 rotate-1" />
        <ScreenshotScheduleBox type="splatfestPro" class="flex-1 -rotate-1" />
        <ScreenshotTricolorBox
          v-if="tricolor?.isTricolorActive"
          :tricolor="tricolor"
          class="flex-1 rotate-1"
        />
      </div>

      <div
        v-else
        :data-screenshot-content="contentReady ? 'schedules' : undefined"
        class="flex space-x-6 mx-6"
      >
        <ScreenshotScheduleBox type="regular" class="flex-1 -rotate-1" />
        <ScreenshotScheduleBox type="anarchySeries" class="flex-1 rotate-1" />
        <ScreenshotScheduleBox type="anarchyOpen" class="flex-1 -rotate-1" />
        <ScreenshotScheduleBox type="xMatch" class="flex-1 rotate-1" />
      </div>
    </div>
  </ScreenshotLayout>
</template>

<script setup>
import { computed } from 'vue';
import uniqBy from 'lodash/uniqBy.js';
import ScreenshotLayout from '@/layouts/ScreenshotLayout.vue';
import ScreenshotScheduleBox from '@/components/screenshots/ScreenshotScheduleBox.vue';
import ScreenshotTricolorBox from '@/components/screenshots/ScreenshotTricolorBox.vue';
import { useUSSplatfestsStore, useEUSplatfestsStore, useJPSplatfestsStore, useAPSplatfestsStore } from '@/stores/splatfests';
import SplatfestMultiBox from '@/components/SplatfestMultiBox.vue';
import { hasBattleScheduleContent, hasTricolorContent } from '@/common/contentAvailability.mjs';
import {
  useAnarchyOpenSchedulesStore,
  useAnarchySeriesSchedulesStore,
  useRegularSchedulesStore,
  useSplatfestOpenSchedulesStore,
  useSplatfestProSchedulesStore,
  useXSchedulesStore,
} from '@/stores/schedules.mjs';

const usSplatfests = useUSSplatfestsStore();
const euSplatfests = useEUSplatfestsStore();
const jpSplatfests = useJPSplatfestsStore();
const apSplatfests = useAPSplatfestsStore();
const regularSchedules = useRegularSchedulesStore();
const anarchySeriesSchedules = useAnarchySeriesSchedulesStore();
const anarchyOpenSchedules = useAnarchyOpenSchedulesStore();
const xSchedules = useXSchedulesStore();
const splatfestOpenSchedules = useSplatfestOpenSchedulesStore();
const splatfestProSchedules = useSplatfestProSchedulesStore();
const tricolor = computed(() =>
  usSplatfests.tricolor || euSplatfests.tricolor || jpSplatfests.tricolor || apSplatfests.tricolor
);
const activeFestivals = computed(() =>
  uniqBy(
    [
      usSplatfests.activeFestival,
      euSplatfests.activeFestival,
      jpSplatfests.activeFestival,
      apSplatfests.activeFestival,
    ].filter(Boolean),
    '__splatoon3ink_id'
  )
);
const splatfestSizeClass = computed(() =>
  tricolor.value?.isTricolorActive || activeFestivals.value.length > 1 ? 'max-w-xs' : 'max-w-md'
);
const regionSizeClass = computed(() => (activeFestivals.value?.length > 1) ? '' : 'scale-[1.2]');
const marginsClass = computed(() => (activeFestivals.value?.length <= 1) ? 'mx-10' : '');
const contentReady = computed(() => {
  if (activeFestivals.value.length > 0) {
    return Boolean(
      hasBattleScheduleContent(splatfestOpenSchedules.activeSchedule) &&
        hasBattleScheduleContent(splatfestProSchedules.activeSchedule) &&
        (!tricolor.value?.isTricolorActive || hasTricolorContent(tricolor.value))
    );
  }

  return [
    regularSchedules,
    anarchySeriesSchedules,
    anarchyOpenSchedules,
    xSchedules,
  ].every((store) => hasBattleScheduleContent(store.activeSchedule));
});
</script>
