import { publishToS3 } from './S3Publisher.mjs'

const [profileName] = process.argv.slice(2)

if (!profileName) {
  throw new Error('Usage: node bot/publish/index.mjs <run-profile>')
}

const manifest = await publishToS3({ profileName })
for (const artifact of manifest.artifacts) {
  console.log(
    `${artifact.name}: published ${artifact.notificationImage.key}, ${artifact.compactImage.key}, and ${artifact.originalImage.key}`
  )
}
