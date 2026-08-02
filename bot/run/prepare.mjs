import { build } from 'vite'
import { resolveBotLocale } from '../config/BotLocale.mjs'
import { resolveScreenshotAttribution } from '../config/ScreenshotAttribution.mjs'
import { resolveScreenshotResolution } from '../config/ScreenshotResolution.mjs'
import { resolveBotTimeZone } from '../config/BotTimeZone.mjs'
import { downloadDataSnapshot, loadDataSnapshot } from '../data/DataSnapshot.mjs'
import { renderScreenshotArtifacts } from '../screenshot/ScreenshotRunner.mjs'
import { resolveRunPlan } from './RunPlan.mjs'
import { writeRunManifest } from './RunManifest.mjs'

const [selection] = process.argv.slice(2)

if (!selection) {
  throw new Error('Usage: node bot/run/prepare.mjs <run-selection>')
}

const plan = resolveRunPlan(selection)
const preparationTime = Date.now()
const timeZone = resolveBotTimeZone()
const locale = resolveBotLocale()
const resolution = resolveScreenshotResolution()
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
  locale,
  screenshotResolution: resolution.name,
  screenshotAttribution,
})
const manifest = await writeRunManifest({
  version: 5,
  selection: plan.selection,
  renderTime,
  timeZone,
  locale,
  resolution: resolution.name,
  screenshotAttribution,
  snapshot: {
    createdAt: snapshot.createdAt,
    source: snapshot.source,
    manifestSha256: dataSnapshot.manifestSha256,
  },
  artifacts: artifacts.map(({ name, filename, bytes, sha256, browserVersion, width, height }) => ({
    name,
    filename,
    bytes,
    sha256,
    browserVersion,
    width,
    height,
  })),
})

console.log(`Prepared ${plan.label} with ${manifest.artifacts.length} screenshot artifacts`)
