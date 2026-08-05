import crypto from 'node:crypto'
import { z } from 'zod'
import { getNotificationDefinition } from '../run/RunPlan.mjs'
import { defineBotLocaleMap } from '../../src/common/botLocale.mjs'
import { createNotification } from './Notification.mjs'

const identifierListSchema = z.array(z.string().min(1)).min(1)

const eventAlertCopy = defineBotLocaleMap({
  'de-DE': { challenge: 'Challenge beginnt bald', bigRun: 'Big Run', random: 'Zufällige Waffen', start: 'Splatfest gestartet', end: 'Splatfest beendet', results: 'Splatfest-Ergebnisse', gear: 'Ausrüstungs-Watchlist', gearItem: 'Ausrüstung' },
  'en-GB': { challenge: 'Challenge starts soon', bigRun: 'Big Run', random: 'Random weapons', start: 'Splatfest started', end: 'Splatfest ended', results: 'Splatfest results', gear: 'Gear watchlist', gearItem: 'Gear' },
  'en-US': { challenge: 'Challenge starts soon', bigRun: 'Big Run', random: 'Random weapons', start: 'Splatfest started', end: 'Splatfest ended', results: 'Splatfest results', gear: 'Gear watchlist', gearItem: 'Gear' },
  'es-ES': { challenge: 'El desafío comienza pronto', bigRun: 'Big Run', random: 'Armas aleatorias', start: 'Splatfest iniciado', end: 'Splatfest finalizado', results: 'Resultados del Splatfest', gear: 'Seguimiento de equipamiento', gearItem: 'Equipamiento' },
  'es-MX': { challenge: 'El desafío comienza pronto', bigRun: 'Big Run', random: 'Armas aleatorias', start: 'Splatfest iniciado', end: 'Splatfest finalizado', results: 'Resultados del Splatfest', gear: 'Seguimiento de equipamiento', gearItem: 'Equipamiento' },
  'fr-CA': { challenge: 'Le défi commence bientôt', bigRun: 'Big Run', random: 'Armes aléatoires', start: 'Festival commencé', end: 'Festival terminé', results: 'Résultats du festival', gear: "Liste de suivi d'équipement", gearItem: 'Équipement' },
  'fr-FR': { challenge: 'Le défi commence bientôt', bigRun: 'Big Run', random: 'Armes aléatoires', start: 'Festival commencé', end: 'Festival terminé', results: 'Résultats du festival', gear: "Liste de suivi d'équipement", gearItem: 'Équipement' },
  'it-IT': { challenge: 'La sfida inizia a breve', bigRun: 'Big Run', random: 'Armi casuali', start: 'Splatfest iniziato', end: 'Splatfest terminato', results: 'Risultati dello Splatfest', gear: 'Lista equipaggiamento', gearItem: 'Equipaggiamento' },
  'ja-JP': { challenge: 'イベントマッチ開始間近', bigRun: 'ビッグラン', random: 'ランダムブキ', start: 'フェス開始', end: 'フェス終了', results: 'フェス結果', gear: 'ギアウォッチリスト', gearItem: 'ギア' },
  'ko-KR': { challenge: '이벤트 매치 시작 임박', bigRun: '빅 런', random: '랜덤 무기', start: '페스티벌 시작', end: '페스티벌 종료', results: '페스티벌 결과', gear: '기어 관심 목록', gearItem: '기어' },
  'nl-NL': { challenge: 'Challenge begint binnenkort', bigRun: 'Big Run', random: 'Willekeurige wapens', start: 'Splatfest begonnen', end: 'Splatfest afgelopen', results: 'Splatfest-resultaten', gear: 'Uitrustingsvolglijst', gearItem: 'Uitrusting' },
  'ru-RU': { challenge: 'Испытание скоро начнётся', bigRun: 'Биг-ран', random: 'Случайное оружие', start: 'Сплатфест начался', end: 'Сплатфест завершён', results: 'Результаты Сплатфеста', gear: 'Отслеживание снаряжения', gearItem: 'Снаряжение' },
  'zh-CN': { challenge: '活动比赛即将开始', bigRun: '大型跑', random: '随机武器', start: '祭典开始', end: '祭典结束', results: '祭典结果', gear: '装备关注清单', gearItem: '装备' },
  'zh-TW': { challenge: '活動比賽即將開始', bigRun: '大型跑', random: '隨機武器', start: '祭典開始', end: '祭典結束', results: '祭典結果', gear: '裝備關注清單', gearItem: '裝備' },
}, 'Event Alert copy')

function localizedCopy(context) {
  return eventAlertCopy[context.locale || 'en-US']
}

function relativeMinutes(context, minutes) {
  return new Intl.RelativeTimeFormat(context.locale || 'en-US', { numeric: 'always' }).format(minutes, 'minute')
}

export const eventAlertConfigurationSchema = z.object({
  includePeriodic: z.boolean().default(true),
  challengeReminderMinutes: z
    .array(z.number().int().positive().max(7 * 24 * 60))
    .min(1)
    .superRefine((values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: 'custom', message: 'Challenge reminder minutes must be unique' })
      }
    })
    .optional(),
  bigRun: z.boolean().default(false),
  randomWeapons: z.boolean().default(false),
  splatfest: z.boolean().default(false),
  gearWatchlist: z.object({
    gearIds: identifierListSchema.optional(),
    primaryPowerIds: identifierListSchema.optional(),
  }).strict().superRefine((watchlist, context) => {
    if (!watchlist.gearIds && !watchlist.primaryPowerIds) {
      context.addIssue({ code: 'custom', message: 'Gear watchlist requires gearIds or primaryPowerIds' })
    }
  }).optional(),
}).strict().superRefine((configuration, context) => {
  if (
    !configuration.challengeReminderMinutes &&
    !configuration.bigRun &&
    !configuration.randomWeapons &&
    !configuration.splatfest &&
    !configuration.gearWatchlist
  ) {
    context.addIssue({ code: 'custom', message: 'Event Alerts configuration must enable at least one alert' })
  }
})

function stateDigest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function alertFromNotification(base, { id, icon, title, subtitle, section, facts }) {
  return createNotification({
    ...base,
    id,
    sourceScreenshotId: base.sourceScreenshotId || base.id,
    source: { ...base.source, name: `${icon} ${base.source.name}` },
    title: `${icon} ${title || base.title}`,
    ...(subtitle === undefined
      ? (base.subtitle ? { subtitle: base.subtitle } : {})
      : (subtitle ? { subtitle } : {})),
    sections: section ? [section, ...base.sections] : base.sections,
    facts: facts || base.facts,
  })
}

function challengeAlert(context, base, thresholds) {
  const challenge = context.challenge
  if (!challenge) return null
  const period = challenge.timePeriods
    ?.filter(({ startTime }) => Date.parse(startTime) > context.now)
    .sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime))[0]
  if (!period) return null

  const minutesUntilStart = Math.ceil((Date.parse(period.startTime) - context.now) / 60_000)
  const threshold = [...thresholds].sort((left, right) => left - right)
    .find((minutes) => minutesUntilStart <= minutes)
  if (!threshold) return null
  const eventId = challenge.settings?.leagueMatchEvent?.id || challenge.__splatoon3ink_id || 'challenge'
  const copy = localizedCopy(context)
  return Object.freeze({
    eventKey: `challenge-reminder:${eventId}:${period.startTime}:${threshold}`,
    notification: alertFromNotification(base, {
      id: `event:challenge-reminder:${eventId}:${threshold}`,
      icon: '⏰',
      subtitle: `${relativeMinutes(context, minutesUntilStart)} · ${base.subtitle || ''}`.replace(/ · $/u, ''),
      section: { title: copy.challenge, text: base.title, listItems: [] },
    }),
  })
}

function salmonRunAlerts(context, base, configuration) {
  const schedule = context.schedules.salmonRun
  if (!schedule) return []
  const alerts = []
  const copy = localizedCopy(context)
  const rotationId = `${schedule.startTime}:${schedule.endTime}`
  if (configuration.bigRun && schedule.isBigRun) {
    alerts.push(Object.freeze({
      eventKey: `big-run:${rotationId}`,
      notification: alertFromNotification(base, {
        id: `event:big-run:${schedule.startTime}`,
        icon: '🚨',
        section: { title: copy.bigRun, text: base.title, listItems: [] },
      }),
    }))
  }
  if (
    configuration.randomWeapons &&
    schedule.settings?.weapons?.some(({ name }) => name === 'Random')
  ) {
    alerts.push(Object.freeze({
      eventKey: `random-weapons:${rotationId}`,
      notification: alertFromNotification(base, {
        id: `event:random-weapons:${schedule.startTime}`,
        icon: '🎲',
        section: { title: copy.random, text: base.title, listItems: [] },
      }),
    }))
  }
  return alerts
}

function splatfestAlerts(context, base, screenshotId) {
  const { region } = getNotificationDefinition(screenshotId)
  const festival = context.splatfests[region]
  if (!festival) return []
  const phases = festival.status === 'active'
    ? ['start']
    : festival.status === 'past'
      ? ['end', ...(festival.hasResults ? ['results'] : [])]
      : []
  const festivalId = festival.__splatoon3ink_id || `${festival.startTime}:${festival.endTime}`
  const copy = localizedCopy(context)
  return phases.map((phase) => {
    const resultState = phase === 'results'
      ? stateDigest(
          festival.teams
            .map(({ id, result }) => ({ id, result: result || null }))
            .sort((left, right) => String(left.id).localeCompare(String(right.id)))
        )
      : phase
    const icon = { start: '🎉', end: '🏁', results: '🏆' }[phase]
    return Object.freeze({
      eventKey: `splatfest:${region}:${festivalId}:${phase}:${resultState}`,
      notification: alertFromNotification(base, {
        id: `event:splatfest-${phase}:${region}:${festivalId}`,
        icon,
        section: { title: `${region} · ${copy[phase]}`, text: base.title, listItems: [] },
      }),
    })
  })
}

function gearIdentity(entry) {
  const gear = entry?.gear || entry
  return {
    entry,
    gear,
    gearId: gear?.__splatoon3ink_id || gear?.id,
    primaryPowerId: gear?.primaryGearPower?.__splatoon3ink_id || gear?.primaryGearPower?.id,
    saleEndTime: entry?.saleEndTime,
  }
}

function matchesGearWatchlist(identity, watchlist) {
  return (
    (identity.gearId && watchlist.gearIds?.includes(identity.gearId)) ||
    (identity.primaryPowerId && watchlist.primaryPowerIds?.includes(identity.primaryPowerId))
  )
}

function gearAlerts(context, notifications, selectedIds, watchlist) {
  const sources = [
    ['gear-dailydrop', context.gear.dailyDropGear],
    ['gear-regular', context.gear.regularGear],
    ['gear-salmon-run', context.gear.salmonRun ? [context.gear.salmonRun] : []],
  ]
  return sources.flatMap(([screenshotId, entries]) => {
    if (!selectedIds.has(screenshotId) || !notifications.has(screenshotId)) return []
    const matches = entries.map(gearIdentity).filter((identity) => matchesGearWatchlist(identity, watchlist))
    if (matches.length === 0) return []
    const base = notifications.get(screenshotId)
    const state = matches
      .map(({ gearId, primaryPowerId, saleEndTime }) => ({ gearId, primaryPowerId, saleEndTime }))
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right))
      )
    return [Object.freeze({
      eventKey: `gear-watchlist:${screenshotId}:${stateDigest(state)}`,
      notification: alertFromNotification(base, {
        id: `event:gear-watchlist:${screenshotId}:${stateDigest(state)}`,
        icon: '🔎',
        section: {
          title: localizedCopy(context).gear,
          text: matches
            .map(({ gear }) => gear?.name || gear?.__splatoon3ink_id || localizedCopy(context).gearItem)
            .join(' · '),
          listItems: [],
        },
      }),
    })]
  })
}

export function composeEventAlerts({ context, notifications, target, notificationIds }) {
  const configuration = target.alerts
  if (!configuration) return Object.freeze([])
  const selectedIds = new Set(notificationIds)
  const alerts = []

  if (configuration.challengeReminderMinutes && selectedIds.has('challenges')) {
    const alert = challengeAlert(
      context,
      notifications.get('challenges'),
      configuration.challengeReminderMinutes
    )
    if (alert) alerts.push(alert)
  }
  if (selectedIds.has('salmon-run') && (configuration.bigRun || configuration.randomWeapons)) {
    alerts.push(...salmonRunAlerts(context, notifications.get('salmon-run'), configuration))
  }
  if (configuration.splatfest) {
    for (const screenshotId of notificationIds.filter((id) => id.startsWith('splatfest-'))) {
      alerts.push(...splatfestAlerts(context, notifications.get(screenshotId), screenshotId))
    }
  }
  if (configuration.gearWatchlist) {
    alerts.push(...gearAlerts(context, notifications, selectedIds, configuration.gearWatchlist))
  }

  return Object.freeze(alerts)
}
