import { publishToUpyun } from './UpyunPublisher.mjs'

const [profileName] = process.argv.slice(2)

if (!profileName) {
  throw new Error('Usage: node bot/publish/index.mjs <run-profile>')
}

const artifacts = await publishToUpyun({ profileName })
for (const artifact of artifacts) {
  console.log(`${artifact.name}: published`)
}
