<template>
  <div>
    <img
      v-if="boss?.name === 'Cohozuna'"
      src="@/assets/img/king-cohozuna.png"
      :class="size"
      :title="localizedBossName"
    />
    <img
      v-else-if="boss?.name === 'Horrorboros'"
      src="@/assets/img/king-horrorboros.png"
      :class="size"
      :title="localizedBossName"
    />
    <img
      v-else-if="boss?.name === 'Megalodontia'"
      src="@/assets/img/king-megalodontia.png"
      :class="size"
      :title="localizedBossName"
    />
    <img
      v-else-if="boss?.name === 'Triumvirate'"
      src="@/assets/img/king-triumvirate.png"
      :class="size"
      :title="localizedBossName"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  schedule: Object,
  size: {
    type: String,
    default: 'w-6',
  },
});

const { t } = useI18n();
const boss = computed(() => props.schedule?.settings?.boss);
const localizedBossName = computed(() => boss.value ? t(`splatnet.bosses.${boss.value.id}.name`, boss.value.name) : '');
</script>
