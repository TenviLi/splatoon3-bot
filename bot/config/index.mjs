import fs from 'node:fs/promises'
import {
  formatBotPreflightReport,
  formatBotPreflightStepSummary,
  inspectBotConfiguration,
} from './BotPreflight.mjs'

const [profileName, channelName] = process.argv.slice(2)

if (!profileName) {
  throw new Error('Usage: node bot/config/index.mjs <run-profile> [notification-channel]')
}

const report = inspectBotConfiguration({
  profileName,
  channelName: channelName || undefined,
})
process.stdout.write(formatBotPreflightReport(report))

if (process.env.GITHUB_STEP_SUMMARY) {
  try {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, formatBotPreflightStepSummary(report))
  } catch (error) {
    console.error(`Failed to write GitHub Step Summary: ${error.message}`)
  }
}

if (!report.valid) {
  process.exitCode = 1
}
