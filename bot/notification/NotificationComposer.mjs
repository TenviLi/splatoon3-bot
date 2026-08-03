import { getGearIcon, getGearTypeIcon } from '../common/util.mjs'
import {
  getPublishedArtifact,
  validatePublicationManifest,
} from '../publish/PublicationManifest.mjs'
import { getNotificationDefinition } from '../run/RunPlan.mjs'
import { createNotification } from './Notification.mjs'
import {
  getTricolorStages,
  hasBattleScheduleContent,
  hasChallengeContent,
  hasDailyDropGearContent,
  hasRegularGearContent,
  hasSalmonRunGearContent,
  hasSalmonRunScheduleContent,
  hasSplatfestContent,
  hasTricolorContent,
} from '../../src/common/contentAvailability.mjs'
import { STATUS_PAST } from '../../src/common/splatfestSelection.mjs'

function requireValue(value, label) {
  if (!value) {
    throw new Error(`Notification data is unavailable: ${label}`)
  }

  return value
}

function requireContent(value, label, predicate) {
  if (!predicate(value)) {
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

function localizedRuleName(context, rule) {
  return shortRuleName(context, context.t(`splatnet.rules.${rule.id}.name`, rule.name))
}

function localizedStageName(context, stage) {
  return context.t(`splatnet.stages.${stage.id}.name`, stage.name)
}

function stageNames(context, schedule) {
  return schedule.settings.vsStages.map((stage) => localizedStageName(context, stage)).join(' · ')
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
    variants: Object.fromEntries(
      Object.entries(artifact.platformImages).map(([platformName, image]) => [
        platformName,
        notificationImageVariant(image),
      ])
    ),
  }
}

function scheduleSection(context, schedule, { icon, type }) {
  if (!hasBattleScheduleContent(schedule)) {
    return null
  }

  return {
    title: `${icon} ${context.t(type)} · ${localizedRuleName(context, schedule.settings.vsRule)}`,
    text: stageNames(context, schedule),
  }
}

function scheduleSubtitle(context, schedule) {
  return `${context.d(schedule.startTime, 'time')} - ${context.d(schedule.endTime, 'time')}`
}

function composeSchedules(context, publicationManifest) {
  const artifact = getPublishedArtifact(publicationManifest, 'schedules')
  let sections
  let referenceSchedule

  if (context.schedules.isSplatfestActive) {
    const splatfestOpen = requireContent(
      context.schedules.splatfestOpen,
      'Splatfest Open schedule',
      hasBattleScheduleContent
    )
    const splatfestPro = requireContent(
      context.schedules.splatfestPro,
      'Splatfest Pro schedule',
      hasBattleScheduleContent
    )
    const tricolor = context.schedules.tricolor
      ? requireContent(context.schedules.tricolor, 'Tricolor schedule', hasTricolorContent)
      : null
    const tricolorStages = getTricolorStages(tricolor)

    sections = [
      scheduleSection(context, splatfestOpen, { icon: '🎉', type: 'schedule.types.open' }),
      scheduleSection(context, splatfestPro, { icon: '🏆', type: 'schedule.types.pro' }),
      ...(tricolor
        ? [{
            title: `🔺 ${context.t('schedule.types.tricolor')}`,
            text: tricolorStages.map((stage) => localizedStageName(context, stage)).join(' · '),
          }]
        : []),
    ]
    referenceSchedule = splatfestOpen
  } else {
    const regular = requireContent(context.schedules.regular, 'regular schedule', hasBattleScheduleContent)
    const anarchySeries = requireContent(
      context.schedules.anarchySeries,
      'Anarchy Series schedule',
      hasBattleScheduleContent
    )
    const anarchyOpen = requireContent(
      context.schedules.anarchyOpen,
      'Anarchy Open schedule',
      hasBattleScheduleContent
    )
    const xMatch = requireContent(context.schedules.xMatch, 'X Battle schedule', hasBattleScheduleContent)

    sections = [
      scheduleSection(context, regular, { icon: '🟢', type: 'schedule.types.regular' }),
      scheduleSection(context, anarchySeries, { icon: '🟠', type: 'schedule.types.series' }),
      scheduleSection(context, anarchyOpen, { icon: '🤝', type: 'schedule.types.open' }),
      scheduleSection(context, xMatch, { icon: '❎', type: 'schedule.types.xmatch' }),
    ]
    referenceSchedule = regular
  }

  return createNotification({
    id: 'schedules',
    source: {
      name: context.t('notification.schedules.source'),
      iconUrl: publicationManifest.branding.icons.schedules.url,
    },
    title: context.t('notification.schedules.title'),
    subtitle: scheduleSubtitle(context, referenceSchedule),
    image: notificationImage(artifact, context.t('screenshot.headers.schedules')),
    sections,
    action: { label: context.t('notification.schedules.action'), url: artifact.notificationImage.url },
    accentColor: context.schedules.isSplatfestActive ? 0xec4899 : 0x39c5bb,
  })
}

const focusedScheduleDefinitions = Object.freeze({
  'schedules-regular': Object.freeze({
    title: 'schedule.types.regular',
    accentColor: 0x22c55e,
    schedules: Object.freeze([
      Object.freeze({ key: 'regular', label: 'Regular', icon: '🟢', type: 'schedule.types.regular' }),
    ]),
  }),
  'schedules-anarchy': Object.freeze({
    title: 'schedule.types.anarchy',
    accentColor: 0xf97316,
    schedules: Object.freeze([
      Object.freeze({ key: 'anarchySeries', label: 'Anarchy Series', icon: '🏅', type: 'schedule.types.series' }),
      Object.freeze({ key: 'anarchyOpen', label: 'Anarchy Open', icon: '🤝', type: 'schedule.types.open' }),
    ]),
  }),
  'schedules-x': Object.freeze({
    title: 'schedule.types.xmatch',
    accentColor: 0x06b6d4,
    schedules: Object.freeze([
      Object.freeze({ key: 'xMatch', label: 'X Battle', icon: '❎', type: 'schedule.types.xmatch' }),
    ]),
  }),
})

function composeFocusedSchedules(name, context, publicationManifest) {
  const definition = focusedScheduleDefinitions[name]
  const artifact = getPublishedArtifact(publicationManifest, name)
  const schedules = definition.schedules.map(({ key, label, ...sectionDefinition }) => ({
    schedule: requireContent(context.schedules[key], `${label} schedule`, hasBattleScheduleContent),
    sectionDefinition,
  }))
  const title = context.t(definition.title)

  return createNotification({
    id: name,
    source: {
      name: context.t('notification.schedules.source'),
      iconUrl: publicationManifest.branding.icons.schedules.url,
    },
    title,
    subtitle: scheduleSubtitle(context, schedules[0].schedule),
    image: notificationImage(artifact, title),
    sections: schedules.map(({ schedule, sectionDefinition }) =>
      scheduleSection(context, schedule, sectionDefinition)
    ),
    action: {
      label: context.t('notification.schedules.focusedAction', { mode: title }),
      url: artifact.notificationImage.url,
    },
    accentColor: definition.accentColor,
  })
}

function plainText(value) {
  return value
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function composeChallenge(context, publicationManifest) {
  const artifact = getPublishedArtifact(publicationManifest, 'challenges')
  const challenge = requireContent(context.challenge, 'challenge schedule', hasChallengeContent)
  const event = requireValue(challenge.settings.leagueMatchEvent, 'challenge event')
  const title = context.t(`splatnet.events.${event.id}.name`, event.name)
  const description = plainText(context.t(`splatnet.events.${event.id}.desc`, event.desc))
  const periods = challenge.timePeriods
    .filter(({ endTime }) => Date.parse(endTime) > context.now)
    .map(({ startTime, endTime }) =>
      `${context.d(startTime, 'dateTimeShortWeekday')} - ${context.d(endTime, 'time')}`
    )
  const activePeriod = challenge.timePeriods.find(
    ({ startTime, endTime }) => Date.parse(startTime) <= context.now && Date.parse(endTime) > context.now
  )
  const nextPeriod = activePeriod || challenge.timePeriods.find(({ startTime }) => Date.parse(startTime) > context.now)
  const periodStatus = activePeriod ? context.t('events.now_open') : context.t('events.available')

  return createNotification({
    id: 'challenges',
    source: {
      name: context.t('events.title'),
      iconUrl: publicationManifest.branding.icons.challenges.url,
    },
    title,
    ...(nextPeriod
      ? {
          subtitle: `${periodStatus} · ${context.d(nextPeriod.startTime, 'dateTimeShortWeekday')} - ${context.d(nextPeriod.endTime, 'time')}`,
        }
      : {}),
    image: notificationImage(artifact, context.t('events.title')),
    sections: [
      {
        title: `🎯 ${localizedRuleName(context, challenge.settings.vsRule)}`,
        text: stageNames(context, challenge),
      },
      ...(description
        ? [{ title: `📜 ${context.t('notification.challenges.details')}`, text: description }]
        : []),
      { title: `🕒 ${periodStatus}`, listItems: periods },
    ],
    action: { label: context.t('notification.challenges.action'), url: artifact.notificationImage.url },
    accentColor: 0xa855f7,
  })
}

function composeSalmonRun(context, publicationManifest) {
  const artifact = getPublishedArtifact(publicationManifest, 'salmon-run')
  const schedule = requireContent(
    context.schedules.salmonRun,
    'salmon run schedule',
    hasSalmonRunScheduleContent
  )
  const hasMysteryWeapon = schedule.settings.weapons.some((weapon) => weapon.name === 'Random')
  const weaponNames = schedule.settings.weapons.map((weapon) =>
    context.t(`splatnet.weapons.${weapon.__splatoon3ink_id}.name`, weapon.name)
  )
  const boss = schedule.settings.boss
  const sourceName = schedule.isBigRun ? context.t('salmonrun.bigrun') : context.t('notification.salmonRun.source')

  return createNotification({
    id: 'salmon-run',
    source: {
      name: sourceName,
      iconUrl: publicationManifest.branding.icons.salmonRun.url,
    },
    title: localizedStageName(context, schedule.settings.coopStage),
    subtitle: `${context.d(schedule.startTime, 'dateTimeShortWeekday')} - ${context.d(schedule.endTime, 'dateTimeShort')}`,
    image: notificationImage(artifact, context.t('screenshot.headers.salmonRun')),
    sections: [
      {
        title: hasMysteryWeapon
          ? context.t('notification.salmonRun.randomWeapons')
          : `🐻 ${context.t('salmonrun.weapons')}`,
        listItems: hasMysteryWeapon ? [] : weaponNames,
      },
    ],
    facts: boss
      ? [{ label: '👑', value: context.t(`splatnet.bosses.${boss.id}.name`, boss.name) }]
      : [],
    action: { label: context.t('notification.salmonRun.action'), url: artifact.notificationImage.url },
    accentColor: schedule.isBigRun ? 0xa855f7 : 0xf97316,
  })
}

function composeDailyDropGear(context, publicationManifest) {
  const artifact = getPublishedArtifact(publicationManifest, 'gear-dailydrop')
  const brand = context.gear.dailyDropBrand
  const gears = context.gear.dailyDropGear
  if (!hasDailyDropGearContent(brand, gears)) {
    throw new Error('Notification data is unavailable: daily drop gear')
  }

  return createNotification({
    id: 'gear-dailydrop',
    source: {
      name: context.t('screenshot.headers.dailyDropGear'),
      iconUrl: publicationManifest.branding.icons.gear.url,
    },
    title: context.t('notification.dailyDropGear.title', {
      brand: context.t(`splatnet.brands.${brand.brand.id}.name`, brand.brand.name),
    }),
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
  const gears = requireContent(context.gear.regularGear, 'regular gear', hasRegularGearContent)
  const gear = gears.at(-1)

  return createNotification({
    id: 'gear-regular',
    source: {
      name: context.t('screenshot.headers.regularGear'),
      iconUrl: publicationManifest.branding.icons.gear.url,
    },
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

function composeSalmonRunGear(context, publicationManifest) {
  const artifact = getPublishedArtifact(publicationManifest, 'gear-salmon-run')
  const gear = requireContent(
    context.gear.salmonRun,
    'Salmon Run monthly gear',
    hasSalmonRunGearContent
  )
  const title = context.t(`splatnet.gear.${gear.__splatoon3ink_id}.name`, gear.name)

  return createNotification({
    id: 'gear-salmon-run',
    source: {
      name: `${context.t('salmonrun.title')} · ${context.t('gear.title')}`,
      iconUrl: publicationManifest.branding.icons.gear.url,
    },
    title,
    subtitle: context.t('notification.salmonRunGear.title'),
    image: notificationImage(artifact, `${context.t('salmonrun.title')} · ${context.t('gear.title')}`),
    facts: [{
      label: getGearTypeIcon(gear.__typename) || '🎁',
      value: context.t('notification.salmonRunGear.hint'),
    }],
    action: { label: context.t('notification.salmonRunGear.action'), url: artifact.notificationImage.url },
    accentColor: 0xf97316,
  })
}

function localizedFestivalTitle(context, festival) {
  return context.t(`splatnet.festivals.${festival.__splatoon3ink_id}.title`, festival.title)
}

function localizedTeamName(context, festival, team, index) {
  return context.t(
    `splatnet.festivals.${festival.__splatoon3ink_id}.teams.${index}.teamName`,
    team.teamName
  )
}

function festivalAccentColor(festival) {
  const winningTeam = festival.status === STATUS_PAST
    ? festival.teams.find((candidate) => candidate.result?.isWinner)
    : null
  const team = winningTeam || festival.teams[0]
  const color = team?.color
  if (!color) {
    return 0xec4899
  }
  const red = Math.round(color.r * 255)
  const green = Math.round(color.g * 255)
  const blue = Math.round(color.b * 255)
  return (red << 16) + (green << 8) + blue
}

function festivalResultSummary(result) {
  return [
    result.voteRatio == null ? null : `🗳️ ${(result.voteRatio * 100).toFixed(2)}%`,
    result.totalPoint == null ? null : `🏁 ${result.totalPoint}p`,
  ].filter(Boolean).join(' · ') || '—'
}

function composeSplatfest(context, publicationManifest, definition) {
  const artifact = getPublishedArtifact(publicationManifest, definition.screenshot)
  const festival = requireContent(
    context.splatfests[definition.region],
    `${definition.region} Splatfest`,
    hasSplatfestContent
  )
  const showResults = festival.status === STATUS_PAST && festival.hasResults
  const winnerIndex = showResults
    ? festival.teams.findIndex((team) => team.result?.isWinner)
    : -1
  const winner = winnerIndex >= 0
    ? localizedTeamName(context, festival, festival.teams[winnerIndex], winnerIndex)
    : null
  const facts = festival.teams.map((team, index) => {
    const teamName = localizedTeamName(context, festival, team, index)
    const result = showResults ? team.result : null
    if (!result) {
      return { label: ['①', '②', '③'][index] || '●', value: teamName }
    }
    return {
      label: `${result.isWinner ? '🏆 ' : ''}${teamName}`,
      value: festivalResultSummary(result),
    }
  })
  const statusLabel = festival.status === 'active'
    ? context.t('festival.active')
    : festival.status === 'upcoming'
      ? context.t('festival.upcoming')
      : context.t('festival.past')
  const statusIcon = { active: '🟢', upcoming: '⏳', past: '📊' }[festival.status] || '🎉'

  return createNotification({
    id: definition.name,
    source: {
      name: `${statusIcon} ${statusLabel} · ${definition.region}`,
      iconUrl: publicationManifest.branding.icons.splatfest.url,
    },
    title: localizedFestivalTitle(context, festival),
    subtitle: `${context.d(festival.startTime, 'dateTimeShortWeekday')} - ${context.d(festival.endTime, 'dateTimeShortWeekday')}`,
    image: notificationImage(artifact, `${context.t('festival.title')} · ${definition.region}`),
    sections: winner
      ? [{ title: `🏆 ${context.t('festival.results.won', { team: winner })}` }]
      : [],
    facts,
    action: {
      label: context.t('notification.splatfest.regionalAction', { region: definition.region }),
      url: artifact.notificationImage.url,
    },
    accentColor: festivalAccentColor(festival),
  })
}

const composers = Object.freeze({
  schedules: composeSchedules,
  challenges: composeChallenge,
  'salmon-run': composeSalmonRun,
  'gear-dailydrop': composeDailyDropGear,
  'gear-regular': composeRegularGear,
  'gear-salmon-run': composeSalmonRunGear,
})

export function composeNotification(name, context, { publicationManifest } = {}) {
  const definition = getNotificationDefinition(name)
  const publication = validatePublicationManifest(publicationManifest)
  const composer = composers[name]

  if (composer) {
    return composer(context, publication)
  }
  if (focusedScheduleDefinitions[name]) {
    return composeFocusedSchedules(name, context, publication)
  }
  if (definition.region) {
    return composeSplatfest(context, publication, definition)
  }

  throw new Error(`No notification composer for ${name}`)
}
