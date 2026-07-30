import { createI18n } from 'vue-i18n'
import zhCN from '../../src/assets/i18n/zh-CN.json' with { type: 'json' }
import { loadDataSnapshot } from '../data/DataSnapshot.mjs'
import { getTopOfCurrentHour } from '../common/util.mjs'

function createTranslator(locale) {
  const i18n = createI18n({
    legacy: false,
    locale: 'zh-CN',
    fallbackLocale: 'zh-CN',
    messages: {
      'zh-CN': { ...zhCN, splatnet: locale },
    },
    datetimeFormats: {
      'zh-CN': {
        dateTimeShort: { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' },
        dateTimeShortWeekday: { month: 'numeric', weekday: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
        time: { hour: 'numeric', minute: '2-digit' },
      },
    },
  }).global

  return Object.freeze({
    t: (...args) => i18n.t(...args),
    d: (...args) => i18n.d(...args),
  })
}

export async function createBotContext({ snapshotDirectory, now = Date.now() } = {}) {
  const snapshot = await loadDataSnapshot(snapshotDirectory)
  const currentTime = getTopOfCurrentHour(new Date(now))
  const schedulesData = snapshot.values.schedules.data
  const gearData = snapshot.values.gear.data
  const translator = createTranslator(snapshot.values['locale/zh-CN'])
  const stageImages = new Map(schedulesData.vsStages.nodes.map((stage) => [stage.id, stage.originalImage]))
  const activeSchedule = (nodes, selectSettings) => {
    const node = nodes.find(
      (schedule) => Date.parse(schedule.startTime) <= currentTime && Date.parse(schedule.endTime) > currentTime
    )
    if (!node) {
      return null
    }

    const settings = selectSettings(node)
    if (!settings) {
      return { ...node, settings: null }
    }

    return {
      ...node,
      settings: {
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
      },
    }
  }
  const currentGear = (entries) => entries?.filter((entry) => Date.parse(entry.saleEndTime) > currentTime) || []
  const gesotown = gearData.gesotown
  const dailyDropBrand = Date.parse(gesotown.pickupBrand?.saleEndTime) > currentTime ? gesotown.pickupBrand : null

  return Object.freeze({
    ...translator,
    now,
    snapshotManifest: snapshot.manifest,
    schedules: Object.freeze({
      regular: activeSchedule(schedulesData.regularSchedules.nodes, (node) => node.regularMatchSetting),
      anarchySeries: activeSchedule(schedulesData.bankaraSchedules.nodes, (node) =>
        node.bankaraMatchSettings?.find((settings) => settings.mode === 'CHALLENGE')
      ),
      anarchyOpen: activeSchedule(schedulesData.bankaraSchedules.nodes, (node) =>
        node.bankaraMatchSettings?.find((settings) => settings.mode === 'OPEN')
      ),
      salmonRun: activeSchedule(
        schedulesData.coopGroupingSchedule.regularSchedules.nodes,
        (node) => node.setting
      ),
    }),
    gear: Object.freeze({
      dailyDropBrand,
      dailyDropGear: dailyDropBrand ? currentGear(dailyDropBrand.brandGears) : [],
      regularGear: currentGear(gesotown.limitedGears),
    }),
  })
}
