import fs from 'node:fs/promises'
import { createFileDeliveryLedgerStore } from './DeliveryLedger.mjs'
import {
  readBotRunReport,
  withDelivery,
  writeBotRunReport,
} from '../run/BotRunReport.mjs'
import { deliverConfiguredNotificationChannels } from './NotificationDelivery.mjs'
import { formatNotificationStepSummary } from './NotificationReport.mjs'
import {
  assertPublicationManifestMatchesRun,
  readPublicationManifest,
} from '../publish/PublicationManifest.mjs'
import { readRunManifest } from '../run/RunManifest.mjs'
import { resolveRunPlan } from '../run/RunPlan.mjs'

const [selection, channelName] = process.argv.slice(2)

if (!selection) {
  throw new Error('Usage: node bot/notification/index.mjs <screenshot-ids> [notification-channel]')
}

const plan = resolveRunPlan(selection)

function logReport(report) {
  if (report.channelResults.length === 0) {
    console.log('No notification channel Secrets are configured; skipping delivery')
    return
  }

  if (report.sharedError) {
    console.error(`Shared notification preparation failed: ${report.sharedError.message}`)
  }

  for (const result of report.deliveryResults) {
    const message = `${result.channel}/${result.target}/${result.notification}`
    if (result.status === 'fulfilled') {
      console.log(`${message}: delivered (${result.deliveryId}; attempt ${result.attempts})`)
    } else if (result.status === 'preserved') {
      console.log(`${message}: preserved; Delivery ${result.deliveryId} already succeeded`)
    } else {
      console.error(`${message}: ${result.error.message} (${result.deliveryId}; attempt ${result.attempts})`)
    }
  }

  for (const target of report.targetResults) {
    if (target.status === 'skipped' || target.status === 'blocked') {
      console.log(`${target.channel}/${target.target}: ${target.status}; ${target.reason}`)
    }
  }

  for (const channelResult of report.channelResults) {
    if (channelResult.status === 'rejected' && channelResult.results.length === 0) {
      console.error(`${channelResult.channelName}: ${channelResult.error.message}`)
    } else if (channelResult.status === 'skipped') {
      console.log(`${channelResult.channelName}: skipped; no Target selects the chosen Screenshot IDs`)
    } else if (channelResult.status === 'blocked') {
      console.error(`${channelResult.channelName}: blocked before delivery`)
    }
  }
}

async function writeStepSummary({ report, failed }) {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return
  }

  try {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, formatNotificationStepSummary({ report, failed }))
  } catch (error) {
    console.error(`Failed to write GitHub Step Summary: ${error.message}`)
  }
}

async function finalizeBotRunReport({ deliveryReport, error }) {
  try {
    const runReport = withDelivery(await readBotRunReport(), deliveryReport, error)
    await writeBotRunReport(runReport)
    return runReport
  } catch (reportError) {
    console.error(`Failed to finalize Bot Run Report: ${reportError.message}`)
    if (!error) {
      throw reportError
    }
    return null
  }
}

let report
let deliveryError
let ledgerStore
try {
  const manifest = await readRunManifest()
  if (manifest.selection.join(',') !== plan.selection.join(',')) {
    throw new Error(
      `Run manifest selection ${manifest.selection.join(',')} does not match ${plan.selection.join(',')}`
    )
  }
  const publicationManifest = await readPublicationManifest()
  assertPublicationManifestMatchesRun(publicationManifest, manifest)
  ledgerStore = createFileDeliveryLedgerStore(process.env.BOT_DELIVERY_LEDGER_DIRECTORY)
  report = await deliverConfiguredNotificationChannels({
    selection: plan.selection,
    channelName: channelName || undefined,
    publicationManifest,
    now: manifest.renderTime,
    timeZone: manifest.timeZone,
    ledgerStore,
  })
  logReport(report)
} catch (error) {
  deliveryError = error
  report = error.report
  if (error.report) {
    logReport(error.report)
  } else {
    console.error(`Notification delivery failed before Channel execution: ${error.message}`)
  }
}

try {
  await ledgerStore?.close()
} catch (error) {
  deliveryError ||= error
  console.error(`Failed to close Delivery Ledger storage: ${error.message}`)
}

await writeStepSummary({ report, failed: Boolean(deliveryError) })
await finalizeBotRunReport({ deliveryReport: report, error: deliveryError })

if (deliveryError) {
  throw deliveryError
}
