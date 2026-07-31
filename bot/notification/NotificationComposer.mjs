import { getGearIcon } from '../common/util.mjs'
import {
  getPublishedArtifact,
  validatePublicationManifest,
} from '../publish/PublicationManifest.mjs'
import { getNotificationDefinition } from '../run/RunPlan.mjs'
import { createNotification } from './Notification.mjs'

function requireValue(value, label) {
  if (!value) {
    throw new Error(`Notification data is unavailable: ${label}`)
  }

  return value
}

function notificationImage(artifact, alt) {
  return {
    url: artifact.notificationImage.url,
    alt,
    width: artifact.notificationImage.width,
    height: artifact.notificationImage.height,
    aspectRatio: Number((artifact.notificationImage.width / artifact.notificationImage.height).toFixed(2)),
  }
}

function composeSchedules(context, publicationManifest) {
  const artifact = getPublishedArtifact(publicationManifest, 'schedules')
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
    source: { name: '今天你喷喷了吗?', iconUrl: publicationManifest.branding.icons.schedules },
    title: '日程已更新',
    subtitle: `${context.d(regular.startTime, 'time')} - ${context.d(regular.endTime, 'time')}`,
    image: notificationImage(artifact, 'Splatoon 3 对战日程'),
    sections: [
      { title: '🔫  占地对战', text: stageNames(regular) },
      rankedSection(anarchySeries, '挑战'),
      rankedSection(anarchyOpen, '开放'),
    ].filter(Boolean),
    action: { label: '查看日程截图', url: artifact.notificationImage.url },
    accentColor: 0x39c5bb,
  })
}

function composeSalmonRun(context, publicationManifest) {
  const artifact = getPublishedArtifact(publicationManifest, 'salmon-run')
  const schedule = requireValue(context.schedules.salmonRun, 'salmon run schedule')
  const hasMysteryWeapon = schedule.settings.weapons.some((weapon) => weapon.name === 'Random')
  const weaponNames = schedule.settings.weapons.map((weapon) =>
    context.t(`splatnet.weapons.${weapon.__splatoon3ink_id}.name`, weapon.name)
  )

  return createNotification({
    id: 'salmon-run',
    source: { name: '打工的时间到啦!', iconUrl: publicationManifest.branding.icons.salmonRun },
    title: context.t(`splatnet.stages.${schedule.settings.coopStage.id}.name`, schedule.settings.coopStage.name),
    subtitle: `${context.d(schedule.startTime, 'dateTimeShortWeekday')} - ${context.d(schedule.endTime, 'dateTimeShort')}`,
    image: notificationImage(artifact, 'Splatoon 3 鲑鱼跑排班'),
    sections: [
      {
        title: hasMysteryWeapon ? '🎉 随机武器! 随机武器!' : '🐻 发放武器:',
        listItems: hasMysteryWeapon ? [] : weaponNames,
      },
    ],
    action: { label: '查看鲑鱼跑截图', url: artifact.notificationImage.url },
    accentColor: 0xf97316,
  })
}

function composeDailyDropGear(context, publicationManifest) {
  const artifact = getPublishedArtifact(publicationManifest, 'gear-dailydrop')
  const brand = requireValue(context.gear.dailyDropBrand, 'daily drop brand')
  const gears = requireValue(context.gear.dailyDropGear, 'daily drop gear')

  return createNotification({
    id: 'gear-dailydrop',
    source: { name: '鱿鱼须商城·今日精选', iconUrl: publicationManifest.branding.icons.gear },
    title: `「${context.t(`splatnet.brands.${brand.brand.id}.name`, brand.brand.name)}」`,
    subtitle: context.t('time.until', { time: context.d(brand.saleEndTime, 'dateTimeShortWeekday') }),
    image: notificationImage(artifact, '鱿鱼须商城今日精选'),
    facts: gears.map((gear) => ({
      label: getGearIcon(gear) || '装备',
      value: `${context.t(`splatnet.gear.${gear.gear.__splatoon3ink_id}.name`, gear.gear.name)}\n(${context.t(
        `splatnet.powers.${gear.gear.primaryGearPower.__splatoon3ink_id}.name`,
        gear.gear.primaryGearPower.name
      )})`,
    })),
    action: { label: '查看今日精选', url: artifact.notificationImage.url },
    accentColor: 0xfacc15,
  })
}

function composeRegularGear(context, publicationManifest) {
  const artifact = getPublishedArtifact(publicationManifest, 'gear-regular')
  const gear = requireValue(context.gear.regularGear?.slice().reverse()[0], 'regular gear')

  return createNotification({
    id: 'gear-regular',
    source: { name: '鱿鱼须商城·目前贩卖', iconUrl: publicationManifest.branding.icons.gear },
    title: '鱿鱼须商城上新啦',
    image: notificationImage(artifact, '鱿鱼须商城目前贩卖装备'),
    facts: [
      {
        label: getGearIcon(gear) || '装备',
        value: `${context.t(`splatnet.gear.${gear.gear.__splatoon3ink_id}.name`, gear.gear.name)}\n(${context.t(
          `splatnet.powers.${gear.gear.primaryGearPower.__splatoon3ink_id}.name`,
          gear.gear.primaryGearPower.name
        )})`,
      },
    ],
    action: { label: '查看目前贩卖', url: artifact.notificationImage.url },
    accentColor: 0xfb923c,
  })
}

const composers = Object.freeze({
  schedules: composeSchedules,
  'salmon-run': composeSalmonRun,
  'gear-dailydrop': composeDailyDropGear,
  'gear-regular': composeRegularGear,
})

export function composeNotification(name, context, { publicationManifest } = {}) {
  getNotificationDefinition(name)
  const composer = composers[name]

  if (!composer) {
    throw new Error(`No notification composer for ${name}`)
  }

  return composer(context, validatePublicationManifest(publicationManifest))
}
