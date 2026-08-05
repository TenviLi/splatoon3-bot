import {
  hasBattleScheduleContent,
  hasSplatfestContent,
} from '../../src/common/contentAvailability.mjs'
import { getSplatfestRegion, splatfestRegions } from '../../src/common/splatfestRegions.mjs'
import {
  recentSplatfestWindowMs,
  selectRelevantSplatfest,
  STATUS_ACTIVE,
} from '../../src/common/splatfestSelection.mjs'
import { getScreenshotDefinition } from './RunPlan.mjs'

const regionDisplayNames = Object.freeze({
  NA: 'North America',
  EU: 'Europe',
  JP: 'Japan',
  AP: 'Asia-Pacific',
})
const recentSplatfestWindowHours = recentSplatfestWindowMs / (60 * 60 * 1000)

function formatTimestamp(value) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : String(value || 'missing')
}

function formatElapsedTime(milliseconds) {
  const totalHours = Math.max(0, Math.floor(milliseconds / (60 * 60 * 1000)))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  const parts = []

  if (days > 0) {
    parts.push(`${days} ${days === 1 ? 'day' : 'days'}`)
  }
  if (hours > 0 || parts.length === 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`)
  }

  return parts.join(' ')
}

function findLatestSplatfest(festivals) {
  return festivals
    .filter((festival) => Number.isFinite(Date.parse(festival?.endTime)))
    .sort((left, right) => Date.parse(right.endTime) - Date.parse(left.endTime))[0] ?? null
}

function createIssue(definition, dataSnapshot, context, records, latest, properties) {
  return Object.freeze({
    screenshotId: definition.name,
    region: definition.region,
    regionDisplayName: regionDisplayNames[definition.region],
    recordCount: records.length,
    latest,
    ...context,
    snapshotCreatedAt: dataSnapshot.manifest?.createdAt,
    snapshotSource: dataSnapshot.manifest?.source,
    ...properties,
  })
}

function inspectSplatfestScreenshot(definition, dataSnapshot, context) {
  const regionDefinition = getSplatfestRegion(definition.region)
  const festivals = dataSnapshot.values?.festivals?.[regionDefinition.dataKey]?.data?.festRecords?.nodes
  const records = Array.isArray(festivals) ? festivals : []
  const latest = findLatestSplatfest(records)
  let selected

  try {
    selected = selectRelevantSplatfest(records, context.renderTime)
  } catch (error) {
    return createIssue(definition, dataSnapshot, context, records, latest, {
      outcome: 'error',
      reason: `the ${definition.region} Splatfest records could not be evaluated: ${error.message}`,
      nextAction: `inspect the ${regionDefinition.dataKey} records in data/festivals.json and retry after the upstream Data Snapshot is corrected`,
    })
  }

  if (selected && hasSplatfestContent(selected)) {
    return null
  }

  if (selected) {
    return createIssue(definition, dataSnapshot, context, records, latest, {
      outcome: 'error',
      reason: `the selected ${definition.region} Splatfest record ${selected.__splatoon3ink_id || '(missing ID)'} does not contain all fields required by the screenshot`,
      nextAction: `inspect the ${regionDefinition.dataKey} records in data/festivals.json and retry after the upstream Data Snapshot is complete`,
    })
  }

  if (latest && Date.parse(latest.endTime) <= context.renderTime) {
    const elapsed = context.renderTime - Date.parse(latest.endTime)
    return createIssue(definition, dataSnapshot, context, records, latest, {
      outcome: 'skipped',
      reason: `the latest ${definition.region} Splatfest ended ${formatElapsedTime(elapsed)} ago, outside the ${recentSplatfestWindowHours}-hour completed-result window`,
      nextAction: `no action is required; ${definition.name} will be eligible again when ${definition.region} has an active, upcoming, or recently completed Splatfest`,
    })
  }

  if (records.length === 0) {
    return createIssue(definition, dataSnapshot, context, records, latest, {
      outcome: 'error',
      reason: `the Data Snapshot contains no Splatfest records for ${definition.region}`,
      nextAction: `retry after the upstream Data Snapshot publishes ${definition.region} Splatfest data`,
    })
  }

  return createIssue(definition, dataSnapshot, context, records, latest, {
    outcome: 'error',
    reason: `none of the ${definition.region} records has a valid active, upcoming, or recently completed event window`,
    nextAction: `inspect the ${regionDefinition.dataKey} records in data/festivals.json and retry after the upstream Data Snapshot is corrected`,
  })
}

function normalizeBattleSchedule(node, settings) {
  if (!settings) {
    return null
  }

  return {
    ...node,
    settings: {
      ...settings,
      vsStages: (settings.vsStages || []).map((stage) => ({
        ...stage,
        thumbnailImage: stage.thumbnailImage || stage.image,
      })),
    },
  }
}

function hasActiveBattleSchedule(nodes, renderTime, selectSettings) {
  return (nodes || []).some(
    (node) =>
      Date.parse(node.startTime) <= renderTime &&
      Date.parse(node.endTime) > renderTime &&
      hasBattleScheduleContent(normalizeBattleSchedule(node, selectSettings(node)))
  )
}

function createTimeWindowSkip(definition, dataSnapshot, context, content, nextAction) {
  return Object.freeze({
    screenshotId: definition.name,
    content,
    region: '—',
    outcome: 'skipped',
    reason: `the restored Data Snapshot has no ${content} content valid at ${new Date(context.renderTime).toISOString()}`,
    nextAction,
    ...context,
    snapshotCreatedAt: dataSnapshot.manifest?.createdAt,
    snapshotSource: dataSnapshot.manifest?.source,
  })
}

function isSplatfestActive(dataSnapshot, renderTime) {
  return splatfestRegions.some(({ dataKey }) => {
    const records = dataSnapshot.values?.festivals?.[dataKey]?.data?.festRecords?.nodes || []
    return selectRelevantSplatfest(records, renderTime)?.status === STATUS_ACTIVE
  })
}

function inspectTimeDependentScreenshot(definition, dataSnapshot, context) {
  if (context.snapshotAcquisition !== 'fallback') {
    return null
  }
  const schedules = dataSnapshot.values?.schedules?.data
  const gear = dataSnapshot.values?.gear?.data?.gesotown
  const coop = dataSnapshot.values?.coop?.data?.coopResult
  const activeBattle = (nodes, selectSettings) =>
    hasActiveBattleSchedule(nodes, context.renderTime, selectSettings)
  const regularAvailable = () =>
    activeBattle(schedules?.regularSchedules?.nodes, (node) => node.regularMatchSetting)
  const anarchySeriesAvailable = () =>
    activeBattle(schedules?.bankaraSchedules?.nodes, (node) =>
      node.bankaraMatchSettings?.find(({ bankaraMode }) => bankaraMode === 'CHALLENGE')
    )
  const anarchyOpenAvailable = () =>
    activeBattle(schedules?.bankaraSchedules?.nodes, (node) =>
      node.bankaraMatchSettings?.find(({ bankaraMode }) => bankaraMode === 'OPEN')
    )
  const xAvailable = () =>
    activeBattle(schedules?.xSchedules?.nodes, (node) => node.xMatchSetting)
  const splatfestOpenAvailable = () =>
    activeBattle(schedules?.festSchedules?.nodes, (node) =>
      node.festMatchSettings?.find(({ festMode }) => festMode === 'REGULAR')
    )
  const splatfestProAvailable = () =>
    activeBattle(schedules?.festSchedules?.nodes, (node) =>
      node.festMatchSettings?.find(({ festMode }) => festMode === 'CHALLENGE')
    )
  let available = true
  let content = definition.label

  switch (definition.name) {
    case 'schedules': {
      const splatfestActive = isSplatfestActive(dataSnapshot, context.renderTime)
      available = splatfestActive
        ? splatfestOpenAvailable() && splatfestProAvailable()
        : regularAvailable() && anarchySeriesAvailable() && anarchyOpenAvailable() && xAvailable()
      content = splatfestActive
        ? 'Splatfest Open and Pro schedules'
        : 'Regular, Anarchy, and X Battle schedules'
      break
    }
    case 'schedules-regular':
      available = regularAvailable()
      content = 'Regular Battle schedule'
      break
    case 'schedules-anarchy':
      available = anarchySeriesAvailable() && anarchyOpenAvailable()
      content = 'Anarchy Battle schedule'
      break
    case 'schedules-x':
      available = xAvailable()
      content = 'X Battle schedule'
      break
    case 'challenges':
      available = (schedules?.eventSchedules?.nodes || []).some((event) =>
        (event.timePeriods || []).some(({ endTime }) => Date.parse(endTime) > context.renderTime)
      )
      content = 'upcoming Challenge'
      break
    case 'salmon-run':
      available = [
        ...(schedules?.coopGroupingSchedule?.regularSchedules?.nodes || []),
        ...(schedules?.coopGroupingSchedule?.bigRunSchedules?.nodes || []),
      ].some(({ startTime, endTime }) =>
        Date.parse(startTime) <= context.renderTime && Date.parse(endTime) > context.renderTime
      )
      content = 'active Salmon Run rotation'
      break
    case 'gear-dailydrop':
      available =
        Date.parse(gear?.pickupBrand?.saleEndTime) > context.renderTime &&
        (gear?.pickupBrand?.brandGears || []).some(
          ({ saleEndTime }) => Date.parse(saleEndTime) > context.renderTime
        )
      content = 'active Daily Drop sale'
      break
    case 'gear-regular':
      available = (gear?.limitedGears || []).some(
        ({ saleEndTime }) => Date.parse(saleEndTime) > context.renderTime
      )
      content = 'active gear sale'
      break
    case 'gear-salmon-run':
      available = Boolean(coop?.monthlyGear)
      content = 'monthly Salmon Run gear'
      break
    default:
      return null
  }

  return available
    ? null
    : createTimeWindowSkip(
        definition,
        dataSnapshot,
        context,
        content,
        'no action is required; a fresh Snapshot will make this Screenshot ID eligible when current content is available'
      )
}

function inspectScreenshot(definition, dataSnapshot, context) {
  if (definition.region) {
    return inspectSplatfestScreenshot(definition, dataSnapshot, context)
  }
  return inspectTimeDependentScreenshot(definition, dataSnapshot, context)
}

function formatIssueDetails(issue) {
  const lines = [
    `- Screenshot ID: ${issue.screenshotId}`,
    '- Content: Splatfest',
    `- Region: ${issue.region} (${issue.regionDisplayName}; independent of BOT_LOCALE)`,
    `- BOT_LOCALE: ${issue.locale} (changes screenshot text only)`,
    `- Render time: ${new Date(issue.renderTime).toISOString()}`,
    `- Time zone: ${issue.timeZone}`,
    `- Data Snapshot: ${formatTimestamp(issue.snapshotCreatedAt)} from ${issue.snapshotSource || 'unknown source'}`,
    `- Region records: ${issue.recordCount}`,
    `- Selection policy: active, upcoming, or completed less than ${recentSplatfestWindowHours} hours ago`,
    `- Reason: ${issue.reason}`,
  ]

  if (issue.latest) {
    lines.push(
      `- Latest record: "${issue.latest.title || '(missing title)'}" (${issue.latest.__splatoon3ink_id || 'missing ID'}), ${formatTimestamp(issue.latest.startTime)} to ${formatTimestamp(issue.latest.endTime)}`
    )
  }

  lines.push(`- Next action: ${issue.nextAction}. Changing BOT_LOCALE will not affect availability.`)
  return lines.join('\n')
}

export function formatContentSkip(issue) {
  if (!issue.region || issue.region === '—') {
    return `Skipped ${issue.screenshotId}: ${issue.reason}.\n- Screenshot ID: ${issue.screenshotId}\n- Content: ${issue.content}\n- Render time: ${new Date(issue.renderTime).toISOString()}\n- Data Snapshot: ${formatTimestamp(issue.snapshotCreatedAt)} from ${issue.snapshotSource || 'unknown source'}\n- Next action: ${issue.nextAction}.`
  }
  return `Skipped ${issue.screenshotId}: no current ${issue.region} Splatfest is inside the publication window.\n${formatIssueDetails(issue)}`
}

export class RunContentPreflightError extends Error {
  constructor(issues) {
    const count = issues.length
    super(
      `Bot Run content preflight found invalid source data for ${count} selected ${count === 1 ? 'Screenshot' : 'Screenshots'}.\n\n${issues.map((issue) => formatIssueDetails(issue)).join('\n\n')}`
    )
    this.name = 'RunContentPreflightError'
    Object.defineProperty(this, 'issues', {
      value: Object.freeze([...issues]),
      enumerable: false,
    })
  }
}

export function resolveRunContentAvailability(
  screenshotNames,
  dataSnapshot,
  { renderTime = Date.now(), locale, timeZone, snapshotAcquisition = 'fresh' }
) {
  const context = Object.freeze({ renderTime, locale, timeZone, snapshotAcquisition })
  const issues = new Map()

  for (const name of screenshotNames) {
    const issue = inspectScreenshot(getScreenshotDefinition(name), dataSnapshot, context)
    if (issue) {
      issues.set(name, issue)
    }
  }

  const errors = [...issues.values()].filter(({ outcome }) => outcome === 'error')
  if (errors.length > 0) {
    throw new RunContentPreflightError(errors)
  }

  return Object.freeze({
    availableSelection: Object.freeze(screenshotNames.filter((name) => !issues.has(name))),
    skipped: Object.freeze([...issues.values()]),
  })
}
