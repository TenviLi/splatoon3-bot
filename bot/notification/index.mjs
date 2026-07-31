import fs from 'node:fs/promises'
import { deliverConfiguredNotificationChannels } from './NotificationDelivery.mjs'
import { formatNotificationStepSummary } from './NotificationReport.mjs'
import {
  assertPublicationManifestMatchesRun,
  readPublicationManifest,
} from '../publish/PublicationManifest.mjs'
import { readRunManifest } from '../run/RunManifest.mjs'

const [profileName, channelName] = process.argv.slice(2)

if (!profileName) {
  throw new Error('Usage: node bot/notification/index.mjs <run-profile> [notification-channel]')
}

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
      console.log(`${message}: delivered`)
    } else {
      console.error(`${message}: ${result.error.message}`)
    }
  }

  for (const channelResult of report.channelResults) {
    if (channelResult.status === 'rejected' && channelResult.results.length === 0) {
      console.error(`${channelResult.channelName}: ${channelResult.error.message}`)
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

let report
let deliveryError
try {
  const manifest = await readRunManifest()
  if (manifest.profile !== profileName) {
    throw new Error(`Run manifest profile ${manifest.profile} does not match ${profileName}`)
  }
  const publicationManifest = await readPublicationManifest()
  assertPublicationManifestMatchesRun(publicationManifest, manifest)
  report = await deliverConfiguredNotificationChannels({
    profileName,
    channelName: channelName || undefined,
    publicationManifest,
    now: manifest.renderTime,
    timeZone: manifest.timeZone,
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

await writeStepSummary({ report, failed: Boolean(deliveryError) })

if (deliveryError) {
  throw deliveryError
}
