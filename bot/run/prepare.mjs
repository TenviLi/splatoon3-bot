import { build } from 'vite'
import { downloadDataSnapshot } from '../data/DataSnapshot.mjs'
import { renderScreenshotArtifacts } from '../screenshot/ScreenshotRunner.mjs'
import { getRunPlan } from './RunPlan.mjs'
import { writeRunManifest } from './RunManifest.mjs'

const [profileName] = process.argv.slice(2)

if (!profileName) {
  throw new Error('Usage: node bot/run/prepare.mjs <run-profile>')
}

const plan = getRunPlan(profileName)
const renderTime = Date.now()
const snapshot = await downloadDataSnapshot({ createdAt: new Date(renderTime) })
await build()
const artifacts = await renderScreenshotArtifacts(plan.screenshots, { renderTime })
const manifest = await writeRunManifest({
  version: 1,
  profile: plan.name,
  renderTime,
  snapshot: {
    createdAt: snapshot.createdAt,
    source: snapshot.source,
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
