import path from 'node:path'
import { listScreenshotDefinitions } from '../bot/run/RunPlan.mjs'
import { renderScreenshotArtifacts } from '../bot/screenshot/ScreenshotRunner.mjs'

process.env.SPLATOON_DATA_DIRECTORY = 'tests/fixtures/data'
process.env.SPLATOON_PUBLIC_DIRECTORY = 'tests/fixtures/public'
const { build } = await import('vite')
const buildDirectory = path.join(process.cwd(), '.cache', 'visual-dist')
const outputDirectory = path.join(process.cwd(), 'tests', 'golden', 'screenshots')
const renderTime = Date.parse('2026-07-29T19:00:00Z')

await build({ build: { outDir: buildDirectory, emptyOutDir: true } })
const artifacts = await renderScreenshotArtifacts(
  listScreenshotDefinitions().map((definition) => definition.name),
  { buildDirectory, outputDirectory, renderTime, deviceScaleFactor: 1 }
)

for (const artifact of artifacts) {
  console.log(`${artifact.name}: ${artifact.filename}`)
}
