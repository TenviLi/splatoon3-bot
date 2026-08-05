import {
  readBotRunReport,
  withDiagnostic,
  writeBotRunReport,
} from './BotRunReport.mjs'

const summary = String(process.env.BOT_RUN_WARNING_SUMMARY || '').trim()
const action = String(process.env.BOT_RUN_WARNING_ACTION || '').trim()
const phase = String(process.env.BOT_RUN_WARNING_PHASE || '').trim()

if (!phase) {
  throw new Error('BOT_RUN_WARNING_PHASE is required')
}

if (!summary) {
  throw new Error('BOT_RUN_WARNING_SUMMARY is required')
}

const report = await readBotRunReport()
await writeBotRunReport(
  withDiagnostic(report, {
    phase,
    severity: 'warning',
    summary,
    ...(action ? { action } : {}),
  })
)

console.warn(`[report] ${summary}`)
