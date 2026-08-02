import { publishToS3 } from './S3Publisher.mjs'

const [selection] = process.argv.slice(2)

if (!selection) {
  throw new Error('Usage: node bot/publish/index.mjs <run-selection>')
}

const manifest = await publishToS3({ selection })
for (const artifact of manifest.artifacts) {
  const platformImageKeys = Object.values(artifact.platformImages).map(({ key }) => key).join(', ')
  console.log(
    `${artifact.name}: published ${artifact.notificationImage.key}, ${platformImageKeys}, and ${artifact.originalImage.key}`
  )
}
