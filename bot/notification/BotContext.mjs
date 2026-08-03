import { createI18n } from 'vue-i18n'
import languages from '../../src/common/languages.mjs'
import { resolveBotLocale } from '../config/BotLocale.mjs'
import { resolveBotTimeZone } from '../config/BotTimeZone.mjs'
import { loadDataSnapshot } from '../data/DataSnapshot.mjs'
import { splatfestRegions } from '../../src/common/splatfestRegions.mjs'
import { selectRelevantSplatfest, STATUS_ACTIVE } from '../../src/common/splatfestSelection.mjs'
import { pluralRules } from '../../src/common/pluralRules.mjs'

function createTranslator(locale, timeZone) {
  const i18n = createI18n({
    legacy: false,
    warnHtmlMessage: false,
    locale: locale.name,
    fallbackLocale: locale.name,
    messages: {
      [locale.name]: { ...languages[locale.name], splatnet: locale.data },
    },
    datetimeFormats: {
      [locale.name]: {
        dateTimeShort: {
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone,
        },
        dateTimeShortWeekday: {
          month: 'numeric',
          weekday: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone,
        },
        time: { hour: 'numeric', minute: '2-digit', timeZone },
      },
    },
    pluralRules,
  }).global

  return Object.freeze({
    t: (...args) => i18n.t(...args),
    d: (...args) => i18n.d(...args),
  })
}

export async function createBotContext({
  snapshotDirectory,
  now = Date.now(),
  timeZone = resolveBotTimeZone(),
  locale = resolveBotLocale(),
} = {}) {
  const snapshot = await loadDataSnapshot(snapshotDirectory)
  const currentTime = now
  const schedulesData = snapshot.values.schedules.data
  const gearData = snapshot.values.gear.data
  const coopData = snapshot.values.coop.data
  const festivalsData = snapshot.values.festivals
  const localeData = snapshot.values[`locale/${locale}`]
  if (!localeData) {
    throw new Error(`Data Snapshot does not contain locale/${locale}`)
  }
  const translator = createTranslator({ name: locale, data: localeData }, timeZone)
  const stageImages = new Map(schedulesData.vsStages.nodes.map((stage) => [stage.id, stage.originalImage]))
  const withLocalizedStageImages = (settings) => {
    if (!settings) {
      return null
    }

    return {
      ...settings,
      ...(settings.vsStages
        ? {
            vsStages: settings.vsStages.map((stage) => ({
              ...stage,
              thumbnailImage: stage.image,
              image: stageImages.get(stage.id) || stage.image,
            })),
          }
        : {}),
    }
  }
  const transformSchedule = (node, settings) => ({
    ...node,
    settings: withLocalizedStageImages(settings),
  })
  const activeSchedule = (nodes, selectSettings) => {
    const node = nodes.find(
      (schedule) => Date.parse(schedule.startTime) <= currentTime && Date.parse(schedule.endTime) > currentTime
    )
    if (!node) {
      return null
    }

    return transformSchedule(node, selectSettings(node))
  }
  const relevantChallenge = schedulesData.eventSchedules.nodes
    .map((node) => ({
      ...node,
      startTime: node.timePeriods.at(0)?.startTime,
      endTime: node.timePeriods.at(-1)?.endTime,
    }))
    .find((node) => node.timePeriods.some((period) => Date.parse(period.endTime) > currentTime))
  const salmonRunNodes = [
    ...schedulesData.coopGroupingSchedule.regularSchedules.nodes.map((node) => ({ ...node, isBigRun: false })),
    ...schedulesData.coopGroupingSchedule.bigRunSchedules.nodes.map((node) => ({ ...node, isBigRun: true })),
  ].sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime))
  const currentFest = schedulesData.currentFest
  const withLocalizedTricolorStage = (stage) => stage
    ? {
        ...stage,
        thumbnailImage: stage.image,
        image: stageImages.get(stage.id) || stage.image,
      }
    : null
  const tricolor = currentFest &&
    Date.parse(currentFest.midtermTime) <= currentTime &&
    Date.parse(currentFest.endTime) > currentTime
    ? {
        ...currentFest,
        tricolorStage: withLocalizedTricolorStage(currentFest.tricolorStage),
        tricolorStages: currentFest.tricolorStages?.map(withLocalizedTricolorStage) || [],
      }
    : null
  const relevantFestival = ({ dataKey }) => {
    const festivals = festivalsData[dataKey]?.data?.festRecords?.nodes || []
    return selectRelevantSplatfest(festivals, currentTime)
  }
  const currentGear = (entries) => entries?.filter((entry) => Date.parse(entry.saleEndTime) > currentTime) || []
  const gesotown = gearData.gesotown
  const dailyDropBrand = Date.parse(gesotown.pickupBrand?.saleEndTime) > currentTime ? gesotown.pickupBrand : null
  const splatfests = Object.freeze(
    Object.fromEntries(
      splatfestRegions.map((definition) => [definition.name, relevantFestival(definition)])
    )
  )

  return Object.freeze({
    ...translator,
    now,
    locale,
    snapshotManifest: snapshot.manifest,
    snapshotManifestSha256: snapshot.manifestSha256,
    schedules: Object.freeze({
      isSplatfestActive: Object.values(splatfests).some((festival) => festival?.status === STATUS_ACTIVE),
      regular: activeSchedule(schedulesData.regularSchedules.nodes, (node) => node.regularMatchSetting),
      anarchySeries: activeSchedule(schedulesData.bankaraSchedules.nodes, (node) =>
        node.bankaraMatchSettings?.find((settings) => settings.bankaraMode === 'CHALLENGE')
      ),
      anarchyOpen: activeSchedule(schedulesData.bankaraSchedules.nodes, (node) =>
        node.bankaraMatchSettings?.find((settings) => settings.bankaraMode === 'OPEN')
      ),
      xMatch: activeSchedule(schedulesData.xSchedules.nodes, (node) => node.xMatchSetting),
      splatfestOpen: activeSchedule(schedulesData.festSchedules.nodes, (node) =>
        node.festMatchSettings?.find((settings) => settings.festMode === 'REGULAR')
      ),
      splatfestPro: activeSchedule(schedulesData.festSchedules.nodes, (node) =>
        node.festMatchSettings?.find((settings) => settings.festMode === 'CHALLENGE')
      ),
      tricolor,
      salmonRun: activeSchedule(salmonRunNodes, (node) => node.setting),
    }),
    challenge: relevantChallenge
      ? transformSchedule(relevantChallenge, relevantChallenge.leagueMatchSetting)
      : null,
    gear: Object.freeze({
      dailyDropBrand,
      dailyDropGear: dailyDropBrand ? currentGear(dailyDropBrand.brandGears) : [],
      regularGear: currentGear(gesotown.limitedGears),
      salmonRun: coopData.coopResult.monthlyGear,
    }),
    splatfests,
  })
}
