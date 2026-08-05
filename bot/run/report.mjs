import fs from 'node:fs/promises'
import { formatBotRunStepSummary, readBotRunReport } from './BotRunReport.mjs'

try {
  const report = await readBotRunReport()
  const summary = formatBotRunStepSummary(report)
  process.stdout.write(summary)
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary)
  }
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log('Bot Run Report is unavailable because the Bot Run artifact was not restored')
  } else {
    throw error
  }
}
