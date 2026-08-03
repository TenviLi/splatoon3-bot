<template>
  <ScreenshotLayout :header="$t('events.title')">
    <div class="grow flex items-center justify-center scale-[1.1]">
      <ChallengeScheduleBox
        v-if="hasChallengeContent(challenge)"
        data-screenshot-content="challenges"
        :event="challenge"
        type="challenge"
        class="w-full max-w-xl -rotate-1"
      />
    </div>
  </ScreenshotLayout>
</template>

<script setup>
import { computed } from 'vue';
import ScreenshotLayout from '@/layouts/ScreenshotLayout.vue';
import ChallengeScheduleBox from '@/components/challenge/ChallengeScheduleBox.vue';
import { useEventSchedulesStore } from '@/stores/schedules.mjs';
import { hasChallengeContent } from '@/common/contentAvailability.mjs';

const store = useEventSchedulesStore();
const challenge = computed(() => store.activeSchedule ?? store.currentSchedules?.[0]);
</script>
