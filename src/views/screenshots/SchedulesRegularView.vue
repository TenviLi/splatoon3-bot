<template>
  <ScreenshotLayout :header="$t('screenshot.headers.schedules')">
    <div class="grow flex items-center justify-center">
      <div class="w-full max-w-4xl mx-6">
        <ScreenshotFocusedScheduleBox
          type="regular"
          screenshot-name="schedules-regular"
          class="-rotate-1"
        />
      </div>
    </div>
  </ScreenshotLayout>
</template>

<script setup>
import ScreenshotLayout from '../../layouts/ScreenshotLayout.vue'
import ScreenshotFocusedScheduleBox from '../../components/screenshots/ScreenshotFocusedScheduleBox.vue'
</script>

<style>
body {
  background-image: url('@/assets/img/information-bg.jpg');
  background-size: 400px;
  background-position: center;
}
</style>
