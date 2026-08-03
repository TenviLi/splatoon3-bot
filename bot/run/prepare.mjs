import fs from 'node:fs/promises'
import { build } from 'vite'
import { resolveBotLocale } from '../config/BotLocale.mjs'
import { resolveScreenshotAttribution } from '../config/ScreenshotAttribution.mjs'
import { resolveScreenshotResolution } from '../config/ScreenshotResolution.mjs'
import { resolveBotTimeZone } from '../config/BotTimeZone.mjs'
import { downloadDataSnapshot, loadDataSnapshot } from '../data/DataSnapshot.mjs'
import { renderScreenshotArtifacts } from '../screenshot/ScreenshotRunner.mjs'
import {
  formatContentSkip,
  resolveRunContentAvailability,
} from './RunContentPreflight.mjs'
import { defaultRunManifestFilename, writeRunManifest } from './RunManifest.mjs'
import { resolveRunPlan } from './RunPlan.mjs'

const [selection] = process.argv.slice(2)

if (!selection) {
  throw new Error('Usage: node bot/run/prepare.mjs <screenshot-ids>')
}

async function writePreparationOutputs(plan) {
  if (!process.env.GITHUB_OUTPUT) {
    return
  }

  const outputs = plan
    ? [
        `selection=${plan.selection.join(',')}`,
        `artifact_name=${plan.artifactName}`,
        'has_content=true',
      ]
    : ['selection=', 'artifact_name=no-content', 'has_content=false']
  await fs.appendFile(process.env.GITHUB_OUTPUT, `${outputs.join('\n')}\n`)
}

async function writeContentSummary(availability) {
  if (!process.env.GITHUB_STEP_SUMMARY || availability.skipped.length === 0) {
    return
  }

  const rows = availability.skipped.map(
    ({ screenshotId, region, reason }) =>
      `| \`${screenshotId}\` | Skipped | ${region} | ${reason.replaceAll('|', '\\|')} |`
  )
  try {
    await fs.appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## Content preflight\n\nTime-dependent content can be unavailable between events. It is skipped without failing the run; other eligible IDs continue, and an empty effective selection becomes a successful no-op.\n\n| Screenshot ID | Result | Region | Reason |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n\n`
    )
  } catch (error) {
    console.error(`[prepare] Could not write the GitHub Step Summary: ${error.message}`)
  }
}

const requestedPlan = resolveRunPlan(selection)
const preparationTime = Date.now()
const timeZone = resolveBotTimeZone()
const locale = resolveBotLocale()
const resolution = resolveScreenshotResolution()
const screenshotAttribution = resolveScreenshotAttribution()
const useExistingDataSnapshot = process.env.BOT_USE_EXISTING_DATA_SNAPSHOT === 'true'
console.log(`[prepare] Requested Run Selection: ${requestedPlan.selection.join(', ')}`)
if (!useExistingDataSnapshot) {
  console.log('[prepare] Downloading a fresh Data Snapshot from splatoon3.ink')
  await downloadDataSnapshot({ createdAt: new Date(preparationTime) })
}
const dataSnapshot = await loadDataSnapshot()
if (!dataSnapshot.manifest || !dataSnapshot.manifestSha256) {
  throw new Error('A validated Data Snapshot Manifest is required to prepare a Bot Run')
}
const snapshot = dataSnapshot.manifest
const renderTime = useExistingDataSnapshot ? Date.parse(snapshot.createdAt) : preparationTime
console.log(`[prepare] Data Snapshot: ${snapshot.createdAt} from ${snapshot.source}`)
console.log(
  `[prepare] Render context: locale=${locale}, timeZone=${timeZone}, resolution=${resolution.name}`
)
console.log('[prepare] Checking selected Screenshot content')
const availability = resolveRunContentAvailability(requestedPlan.screenshots, dataSnapshot, {
  renderTime,
  locale,
  timeZone,
})
for (const skipped of availability.skipped) {
  console.log(`[prepare] ${formatContentSkip(skipped)}`)
}
await writeContentSummary(availability)

const plan = availability.availableSelection.length > 0
  ? resolveRunPlan(availability.availableSelection)
  : null
await writePreparationOutputs(plan)

if (!plan) {
  await fs.rm(defaultRunManifestFilename, { force: true })
  console.log('[prepare] Effective Run Selection: none')
  console.log('[prepare] No selected Screenshot content is currently available; build, upload, and notification are skipped successfully')
} else {
  console.log(`[prepare] Effective Run Selection: ${plan.selection.join(', ')}`)
  console.log('[prepare] Content preflight: ready')
  console.log('[prepare] Building screenshot application')
  await build()
  console.log('[prepare] Rendering screenshot artifacts')
  const artifacts = await renderScreenshotArtifacts(plan.screenshots, {
    renderTime,
    timeZone,
    locale,
    screenshotResolution: resolution.name,
    screenshotAttribution,
  })
  const manifest = await writeRunManifest({
    version: 6,
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
}
