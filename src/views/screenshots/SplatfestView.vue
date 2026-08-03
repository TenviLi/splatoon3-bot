<template>
  <ScreenshotLayout :header="$t('festival.title') + ' · ' + region">
    <div
      v-if="hasSplatfestContent(festival)"
      :data-screenshot-content="`splatfest-${region.toLowerCase()}`"
      class="grow flex items-center justify-center"
    >
      <div class="flex space-x-32 items-center mx-6">
        <SplatfestBox
          :festival="festival"
          class="flex-1 max-w-md md:-rotate-1 scale-[1.2]"
        />

        <SplatfestResultsBox
          v-if="festival.status === STATUS_PAST && festival.hasResults"
          :festival="festival"
          data-screenshot-splatfest-results
          class="max-w-md md:rotate-1 scale-[1.2]"
        />
      </div>
    </div>
  </ScreenshotLayout>
</template>

<script setup>
import { computed } from 'vue';
import ScreenshotLayout from '@/layouts/ScreenshotLayout.vue';

import { useUSSplatfestsStore, useEUSplatfestsStore, useJPSplatfestsStore, useAPSplatfestsStore } from '@/stores/splatfests';
import SplatfestBox from '@/components/SplatfestBox.vue';
import SplatfestResultsBox from '@/components/SplatfestResultsBox.vue';
import { isSplatfestRegion } from '@/common/splatfestRegions.mjs';
import { hasSplatfestContent } from '@/common/contentAvailability.mjs';
import { STATUS_PAST } from '@/common/splatfestSelection.mjs';

const usSplatfests = useUSSplatfestsStore();
const euSplatfests = useEUSplatfestsStore();
const jpSplatfests = useJPSplatfestsStore();
const apSplatfests = useAPSplatfestsStore();

const props = defineProps({
  region: {
    type: String,
    required: true,
    validator: isSplatfestRegion,
  },
});

const regionStores = Object.freeze({
  NA: usSplatfests,
  EU: euSplatfests,
  JP: jpSplatfests,
  AP: apSplatfests,
});

const festival = computed(() => {
  const store = regionStores[props.region];
  return store.activeFestival ?? store.upcomingFestival ?? store.recentFestival;
});
</script>
