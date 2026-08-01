import { build } from 'vite'
import { resolveScreenshotAttribution } from '../config/ScreenshotAttribution.mjs'
import { resolveBotTimeZone } from '../config/BotTimeZone.mjs'
import { downloadDataSnapshot, loadDataSnapshot } from '../data/DataSnapshot.mjs'
import { renderScreenshotArtifacts } from '../screenshot/ScreenshotRunner.mjs'
import { getRunPlan } from './RunPlan.mjs'
import { writeRunManifest } from './RunManifest.mjs'

const [profileName] = process.argv.slice(2)

if (!profileName) {
  throw new Error('Usage: node bot/run/prepare.mjs <run-profile>')
}

const plan = getRunPlan(profileName)
const preparationTime = Date.now()
const timeZone = resolveBotTimeZone()
const screenshotAttribution = resolveScreenshotAttribution()
const useExistingDataSnapshot = process.env.BOT_USE_EXISTING_DATA_SNAPSHOT === 'true'
if (!useExistingDataSnapshot) {
  await downloadDataSnapshot({ createdAt: new Date(preparationTime) })
}
const dataSnapshot = await loadDataSnapshot()
if (!dataSnapshot.manifest || !dataSnapshot.manifestSha256) {
  throw new Error('A validated Data Snapshot Manifest is required to prepare a Bot Run')
}
const snapshot = dataSnapshot.manifest
const renderTime = useExistingDataSnapshot ? Date.parse(snapshot.createdAt) : preparationTime
await build()
const artifacts = await renderScreenshotArtifacts(plan.screenshots, {
  renderTime,
  timeZone,
  screenshotAttribution,
})
const manifest = await writeRunManifest({
  version: 3,
  profile: plan.name,
  renderTime,
  timeZone,
  screenshotAttribution,
  snapshot: {
    createdAt: snapshot.createdAt,
    source: snapshot.source,
    manifestSha256: dataSnapshot.manifestSha256,
  },
  artifacts: artifacts.map(({ name, filename, bytes, sha256, browserVersion }) => ({
    name,
    filename,
    bytes,
    sha256,
    browserVersion,
  })),
})

console.log(`Prepared ${manifest.profile} with ${manifest.artifacts.length} screenshot artifacts`)
