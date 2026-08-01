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

function shortRuleName(context, ruleName) {
  return ruleName.replace(
    context.t('screenshot.rainmakerLong'),
    context.t('screenshot.rainmakerShort')
  )
}

function notificationImageVariant(image) {
  return {
    url: image.url,
    width: image.width,
    height: image.height,
    aspectRatio: Number((image.width / image.height).toFixed(2)),
  }
}

function notificationImage(artifact, alt) {
  return {
    ...notificationImageVariant(artifact.notificationImage),
    alt,
    compact: notificationImageVariant(artifact.compactImage),
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

    const rule = shortRuleName(
      context,
      context.t(`splatnet.rules.${schedule.settings.vsRule.id}.name`, schedule.settings.vsRule.name)
    )
    return {
      title: `🔰  ${rule}  (${context.t(mode)})`,
      text: stageNames(schedule),
    }
  }
  const regularRule = shortRuleName(
    context,
    context.t(`splatnet.rules.${regular.settings.vsRule.id}.name`, regular.settings.vsRule.name)
  )

  return createNotification({
    id: 'schedules',
    source: { name: context.t('notification.schedules.source'), iconUrl: publicationManifest.branding.icons.schedules.url },
    title: context.t('notification.schedules.title'),
    subtitle: `${context.d(regular.startTime, 'time')} - ${context.d(regular.endTime, 'time')}`,
    image: notificationImage(artifact, context.t('screenshot.headers.schedules')),
    sections: [
      { title: `🔫  ${regularRule}`, text: stageNames(regular) },
      rankedSection(anarchySeries, 'schedule.types.series'),
      rankedSection(anarchyOpen, 'schedule.types.open'),
    ].filter(Boolean),
    action: { label: context.t('notification.schedules.action'), url: artifact.notificationImage.url },
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
    source: { name: context.t('notification.salmonRun.source'), iconUrl: publicationManifest.branding.icons.salmonRun.url },
    title: context.t(`splatnet.stages.${schedule.settings.coopStage.id}.name`, schedule.settings.coopStage.name),
    subtitle: `${context.d(schedule.startTime, 'dateTimeShortWeekday')} - ${context.d(schedule.endTime, 'dateTimeShort')}`,
    image: notificationImage(artifact, context.t('screenshot.headers.salmonRun')),
    sections: [
      {
        title: hasMysteryWeapon
          ? context.t('notification.salmonRun.randomWeapons')
          : `🐻 ${context.t('salmonrun.weapons')}:`,
        listItems: hasMysteryWeapon ? [] : weaponNames,
      },
    ],
    action: { label: context.t('notification.salmonRun.action'), url: artifact.notificationImage.url },
    accentColor: 0xf97316,
  })
}

function composeDailyDropGear(context, publicationManifest) {
  const artifact = getPublishedArtifact(publicationManifest, 'gear-dailydrop')
  const brand = requireValue(context.gear.dailyDropBrand, 'daily drop brand')
  const gears = requireValue(context.gear.dailyDropGear, 'daily drop gear')

  return createNotification({
    id: 'gear-dailydrop',
    source: { name: context.t('screenshot.headers.dailyDropGear'), iconUrl: publicationManifest.branding.icons.gear.url },
    title: `「${context.t(`splatnet.brands.${brand.brand.id}.name`, brand.brand.name)}」`,
    subtitle: context.t('time.until', { time: context.d(brand.saleEndTime, 'dateTimeShortWeekday') }),
    image: notificationImage(artifact, context.t('screenshot.headers.dailyDropGear')),
    facts: gears.map((gear) => ({
      label: getGearIcon(gear) || context.t('gear.title'),
      value: `${context.t(`splatnet.gear.${gear.gear.__splatoon3ink_id}.name`, gear.gear.name)}\n(${context.t(
        `splatnet.powers.${gear.gear.primaryGearPower.__splatoon3ink_id}.name`,
        gear.gear.primaryGearPower.name
      )})`,
    })),
    action: { label: context.t('notification.dailyDropGear.action'), url: artifact.notificationImage.url },
    accentColor: 0xfacc15,
  })
}

function composeRegularGear(context, publicationManifest) {
  const artifact = getPublishedArtifact(publicationManifest, 'gear-regular')
  const gear = requireValue(context.gear.regularGear?.slice().reverse()[0], 'regular gear')

  return createNotification({
    id: 'gear-regular',
    source: { name: context.t('screenshot.headers.regularGear'), iconUrl: publicationManifest.branding.icons.gear.url },
    title: context.t('notification.regularGear.title'),
    image: notificationImage(artifact, context.t('screenshot.headers.regularGear')),
    facts: [
      {
        label: getGearIcon(gear) || context.t('gear.title'),
        value: `${context.t(`splatnet.gear.${gear.gear.__splatoon3ink_id}.name`, gear.gear.name)}\n(${context.t(
          `splatnet.powers.${gear.gear.primaryGearPower.__splatoon3ink_id}.name`,
          gear.gear.primaryGearPower.name
        )})`,
      },
    ],
    action: { label: context.t('notification.regularGear.action'), url: artifact.notificationImage.url },
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
