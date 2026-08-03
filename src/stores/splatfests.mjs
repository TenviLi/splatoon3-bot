import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed } from 'vue';
import { useFestivalsDataStore, useSchedulesDataStore } from './data.mjs';
import { useTimeStore } from './time.mjs';
import { getSplatfestRegion } from '@/common/splatfestRegions.mjs';
import {
  decorateSplatfest,
  selectRelevantSplatfest,
  STATUS_ACTIVE,
  STATUS_PAST,
  STATUS_UPCOMING,
} from '@/common/splatfestSelection.mjs';

export { STATUS_ACTIVE, STATUS_PAST, STATUS_UPCOMING };

function defineSplatfestRegionStore(region) {
  return defineStore(`splatfests/${region}`, () => {
    const time = useTimeStore();
    const store = useFestivalsDataStore();

    function getRegions(node) {
      let result = [];
      const regions = node.__splatoon3ink_id.split('-')[0];

      // The order here is important for SplatfestStatus/SplatfestResultsStatus posts
      if (regions.includes('U')) result.push('NA');
      if (regions.includes('J')) result.push('JP');
      if (regions.includes('E')) result.push('EU');
      if (regions.includes('A')) result.push('AP');

      return result;
    }

    const festivals = computed(() => store.data?.[region]?.data.festRecords.nodes.map(node => {
      return {
        ...decorateSplatfest(node, time.now),
        regions: getRegions(node),
      };
    }) ?? []);

    const previousFestivals = computed(() => festivals.value?.filter(f => f.status === STATUS_PAST));
    const relevantFestival = computed(() => selectRelevantSplatfest(festivals.value, time.now));
    const activeFestival = computed(() =>
      relevantFestival.value?.status === STATUS_ACTIVE ? relevantFestival.value : null
    );
    const upcomingFestival = computed(() =>
      relevantFestival.value?.status === STATUS_UPCOMING ? relevantFestival.value : null
    );
    const recentFestival = computed(() =>
      relevantFestival.value?.status === STATUS_PAST ? relevantFestival.value : null
    );

    // TODO: Eventually this needs to be handled on a per-region basis.
    const tricolor = computed(() => {
      let { currentFest: fest, vsStages } = useSchedulesDataStore().data ?? {};

      if (!fest) {
        return null;
      }

      // Move the thumbnail image to "thumbnailImage" and pull in the high-res image for the stage
      if (fest.tricolorStage && !fest.tricolorStage.thumbnailImage) {
        fest.tricolorStage.thumbnailImage = fest.tricolorStage.image;
        fest.tricolorStage.image =
          vsStages.nodes.find(s => s.id === fest.tricolorStage.id)?.originalImage ||
          fest.tricolorStage.image;
      }

      if (fest.tricolorStages) {
        fest.tricolorStages.forEach(stage => stage.thumbnailImage = stage.image);
      }

      return {
        ...fest,
        isTricolorActive: time.isActive(fest.midtermTime, fest.endTime),
        startTime: fest.midtermTime,
        endTime: fest.endTime,
      };
    });

    return { festivals, previousFestivals, activeFestival, upcomingFestival, recentFestival, tricolor };
  });
}

export const useUSSplatfestsStore = defineSplatfestRegionStore(getSplatfestRegion('NA').dataKey);
export const useEUSplatfestsStore = defineSplatfestRegionStore(getSplatfestRegion('EU').dataKey);
export const useJPSplatfestsStore = defineSplatfestRegionStore(getSplatfestRegion('JP').dataKey);
export const useAPSplatfestsStore = defineSplatfestRegionStore(getSplatfestRegion('AP').dataKey);

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUSSplatfestsStore, import.meta.hot));
  import.meta.hot.accept(acceptHMRUpdate(useEUSplatfestsStore, import.meta.hot));
  import.meta.hot.accept(acceptHMRUpdate(useJPSplatfestsStore, import.meta.hot));
  import.meta.hot.accept(acceptHMRUpdate(useAPSplatfestsStore, import.meta.hot));
}
