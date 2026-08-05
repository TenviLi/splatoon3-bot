import fs from 'node:fs/promises'
import {
  formatBotPreflightReport,
  formatBotPreflightStepSummary,
  inspectBotConfiguration,
} from './BotPreflight.mjs'
import { readBotRunReport, withFailure, writeBotRunReport } from '../run/BotRunReport.mjs'

const [selection, channelName] = process.argv.slice(2)

if (!selection) {
  throw new Error('Usage: node bot/config/index.mjs <screenshot-ids> [notification-channel]')
}

const report = inspectBotConfiguration({
  selection,
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
  try {
    const details = report.checks
      .filter(({ status }) => status === 'rejected')
      .map(({ name, error }) => `${name}: ${error.message}`)
      .join('; ')
    await writeBotRunReport(
      withFailure(
        await readBotRunReport(),
        'publish',
        new Error(`Configuration preflight failed: ${details}`),
        'Correct the named Repository Secret or Variable and rerun the publish job.'
      )
    )
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`Failed to update Bot Run Report: ${error.message}`)
    }
  }
  process.exitCode = 1
}
