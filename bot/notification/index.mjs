import fs from 'node:fs/promises'
import { deliverConfiguredNotificationChannels } from './NotificationDelivery.mjs'
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
    }
  }
}

async function writeStepSummary(report) {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return
  }

  const lines = ['## Notification Delivery']
  if (report.channelResults.length === 0) {
    lines.push('- No configured notification channels; delivery skipped')
  } else {
    for (const channelResult of report.channelResults) {
      const delivered = channelResult.results.filter(({ status }) => status === 'fulfilled').length
      const failed = channelResult.results.filter(({ status }) => status === 'rejected').length
      lines.push(
        `- ${channelResult.channelName}: ${channelResult.status} (${delivered} delivered, ${failed} failed)`
      )
    }
  }

  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`)
}

try {
  const manifest = await readRunManifest()
  if (manifest.profile !== profileName) {
    throw new Error(`Run manifest profile ${manifest.profile} does not match ${profileName}`)
  }
  const report = await deliverConfiguredNotificationChannels({
    profileName,
    channelName: channelName || undefined,
    now: manifest.renderTime,
  })
  logReport(report)
  await writeStepSummary(report)
} catch (error) {
  if (error.report) {
    logReport(error.report)
    await writeStepSummary(error.report)
  }
  throw error
}
