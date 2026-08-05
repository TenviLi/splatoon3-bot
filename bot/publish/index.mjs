import { publishToS3 } from './S3Publisher.mjs'
import {
  readBotRunReport,
  withFailure,
  withPublication,
  writeBotRunReport,
} from '../run/BotRunReport.mjs'

const [selection] = process.argv.slice(2)

if (!selection) {
  throw new Error('Usage: node bot/publish/index.mjs <screenshot-ids>')
}

const runReport = await readBotRunReport()
let manifest
try {
  manifest = await publishToS3({ selection })
  await writeBotRunReport(withPublication(runReport, manifest))
} catch (error) {
  await writeBotRunReport(
    withFailure(
      runReport,
      'publish',
      error,
      'Check S3 credentials, endpoint compatibility, bucket permissions, and the failed object key, then rerun the publish job.'
    )
  )
  throw error
}
for (const artifact of manifest.artifacts) {
  const platformImageKeys = Object.values(artifact.platformImages).map(({ key }) => key).join(', ')
  console.log(
    `${artifact.name}: published ${artifact.notificationImage.key}, ${platformImageKeys}, and ${artifact.originalImage.key}`
  )
}
