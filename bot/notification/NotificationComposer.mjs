import { getGearIcon } from '../common/util.mjs'
import { getNotificationDefinition } from '../run/RunPlan.mjs'
import { createNotification } from './Notification.mjs'

function normalizeAssetBaseUrl(value) {
  if (!value) {
    throw new Error('UPYUN_DOMAIN is required to compose notifications')
  }

  return value.replace(/\/$/, '')
}

function assetUrl(baseUrl, relativePath) {
  return `${baseUrl}/${relativePath}`
}

function screenshotUrl(baseUrl, screenshotName) {
  return assetUrl(baseUrl, `${screenshotName}.png!sm`)
}

function requireValue(value, label) {
  if (!value) {
    throw new Error(`Notification data is unavailable: ${label}`)
  }

  return value
}

function composeSchedules(context, assetBaseUrl) {
  const regular = requireValue(context.schedules.regular, 'regular schedule')
  const anarchySeries = requireValue(context.schedules.anarchySeries, 'anarchy series schedule')
  const anarchyOpen = requireValue(context.schedules.anarchyOpen, 'anarchy open schedule')
  const stageNames = (schedule) =>
    schedule.settings.vsStages
      .map((stage) => context.t(`splatnet.stages.${stage.id}.name`, stage.name))
      .join('·')
  const rankedSection = (schedule, mode) => {
    if (!schedule?.settings?.vsRule || !schedule.settings.vsStages) {
      return null
    }

    const rule = context
      .t(`splatnet.rules.${schedule.settings.vsRule.id}.name`, schedule.settings.vsRule.name)
      .replace('对战', '')
    return { title: `🔰  ${rule}  (${mode})`, text: stageNames(schedule) }
  }

  return createNotification({
    id: 'schedules',
    source: { name: '今天你喷喷了吗?', iconUrl: assetUrl(assetBaseUrl, 'icon.png!sm') },
    title: '日程已更新',
    subtitle: `${context.d(regular.startTime, 'time')} - ${context.d(regular.endTime, 'time')}`,
    image: { url: screenshotUrl(assetBaseUrl, 'schedules'), alt: 'Splatoon 3 对战日程', aspectRatio: 1.78 },
    sections: [
      { title: '🔫  占地对战', text: stageNames(regular) },
      rankedSection(anarchySeries, '挑战'),
      rankedSection(anarchyOpen, '开放'),
    ].filter(Boolean),
    action: { label: '查看日程截图', url: screenshotUrl(assetBaseUrl, 'schedules') },
    accentColor: 0x39c5bb,
  })
}

function composeSalmonRun(context, assetBaseUrl) {
  const schedule = requireValue(context.schedules.salmonRun, 'salmon run schedule')
  const hasMysteryWeapon = schedule.settings.weapons.some((weapon) => weapon.name === 'Random')

  return createNotification({
    id: 'salmon-run',
    source: { name: '打工的时间到啦!', iconUrl: assetUrl(assetBaseUrl, 'icon2.png!sm') },
    title: context.t(`splatnet.stages.${schedule.settings.coopStage.id}.name`, schedule.settings.coopStage.name),
    subtitle: `${context.d(schedule.startTime, 'dateTimeShortWeekday')} - ${context.d(schedule.endTime, 'dateTimeShort')}`,
    image: { url: screenshotUrl(assetBaseUrl, 'salmon-run'), alt: 'Splatoon 3 鲑鱼跑排班', aspectRatio: 1.78 },
    sections: [{ title: hasMysteryWeapon ? '🎉 随机武器! 随机武器!' : '🐻 发放武器:' }],
    facts: hasMysteryWeapon
      ? []
      : schedule.settings.weapons.map((weapon) => ({
          label: '-',
          value: context.t(`splatnet.weapons.${weapon.__splatoon3ink_id}.name`, weapon.name),
        })),
    action: { label: '查看鲑鱼跑截图', url: screenshotUrl(assetBaseUrl, 'salmon-run') },
    accentColor: 0xf97316,
  })
}

function composeDailyDropGear(context, assetBaseUrl) {
  const brand = requireValue(context.gear.dailyDropBrand, 'daily drop brand')
  const gears = requireValue(context.gear.dailyDropGear, 'daily drop gear')

  return createNotification({
    id: 'gear-dailydrop',
    source: { name: '鱿鱼须商城·今日精选', iconUrl: assetUrl(assetBaseUrl, 'icon3.png!sm') },
    title: `「${context.t(`splatnet.brands.${brand.brand.id}.name`, brand.brand.name)}」`,
    subtitle: context.t('time.until', { time: context.d(brand.saleEndTime, 'dateTimeShortWeekday') }),
    image: { url: screenshotUrl(assetBaseUrl, 'gear-dailydrop'), alt: '鱿鱼须商城今日精选', aspectRatio: 1.78 },
    facts: gears.map((gear) => ({
      label: getGearIcon(gear) || '装备',
      value: `${context.t(`splatnet.gear.${gear.gear.__splatoon3ink_id}.name`, gear.gear.name)}\n(${context.t(
        `splatnet.powers.${gear.gear.primaryGearPower.__splatoon3ink_id}.name`,
        gear.gear.primaryGearPower.name
      )})`,
    })),
    action: { label: '查看今日精选', url: screenshotUrl(assetBaseUrl, 'gear-dailydrop') },
    accentColor: 0xfacc15,
  })
}

function composeRegularGear(context, assetBaseUrl) {
  const gear = requireValue(context.gear.regularGear?.slice().reverse()[0], 'regular gear')

  return createNotification({
    id: 'gear-regular',
    source: { name: '鱿鱼须商城·目前贩卖', iconUrl: assetUrl(assetBaseUrl, 'icon3.png!sm') },
    title: '鱿鱼须商城上新啦',
    image: { url: screenshotUrl(assetBaseUrl, 'gear-regular'), alt: '鱿鱼须商城目前贩卖装备', aspectRatio: 1.78 },
    facts: [
      {
        label: getGearIcon(gear) || '装备',
        value: `${context.t(`splatnet.gear.${gear.gear.__splatoon3ink_id}.name`, gear.gear.name)}\n(${context.t(
          `splatnet.powers.${gear.gear.primaryGearPower.__splatoon3ink_id}.name`,
          gear.gear.primaryGearPower.name
        )})`,
      },
    ],
    action: { label: '查看目前贩卖', url: screenshotUrl(assetBaseUrl, 'gear-regular') },
    accentColor: 0xfb923c,
  })
}

const composers = Object.freeze({
  schedules: composeSchedules,
  'salmon-run': composeSalmonRun,
  'gear-dailydrop': composeDailyDropGear,
  'gear-regular': composeRegularGear,
})

export function composeNotification(name, context, { assetBaseUrl = process.env.UPYUN_DOMAIN } = {}) {
  getNotificationDefinition(name)
  const composer = composers[name]

  if (!composer) {
    throw new Error(`No notification composer for ${name}`)
  }

  return composer(context, normalizeAssetBaseUrl(assetBaseUrl))
}
