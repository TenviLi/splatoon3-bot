import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'vite'
import { resolveBotLocale } from '../config/BotLocale.mjs'
import { resolveScreenshotAttribution } from '../config/ScreenshotAttribution.mjs'
import { resolveScreenshotResolution } from '../config/ScreenshotResolution.mjs'
import { resolveBotTimeZone } from '../config/BotTimeZone.mjs'
import { acquireDataSnapshot } from '../data/DataSnapshot.mjs'
import { renderScreenshotArtifacts } from '../screenshot/ScreenshotRunner.mjs'
import {
  createFailedPreparationBotRunReport,
  createPreparedBotRunReport,
  writeBotRunReport,
} from './BotRunReport.mjs'
import {
  formatContentSkip,
  resolveRunContentAvailability,
} from './RunContentPreflight.mjs'
import { defaultRunManifestFilename, writeRunManifest } from './RunManifest.mjs'
import { resolveRunPlan, resolveRunPlanFromEnvironment } from './RunPlan.mjs'

const [selection] = process.argv.slice(2)

async function writePreparationOutputs(plan, acquisition) {
  if (!process.env.GITHUB_OUTPUT) {
    return
  }

  const outputs = plan
      ? [
        `selection=${plan.selection.join(',')}`,
        `artifact_name=${plan.artifactName}`,
        'has_content=true',
        `snapshot_acquisition=${acquisition}`,
      ]
    : ['selection=', 'artifact_name=no-content', 'has_content=false', `snapshot_acquisition=${acquisition}`]
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

const preparationTime = Date.now()
const requestedScreenshotIds = String(selection || '').split(',').map((value) => value.trim()).filter(Boolean)
const failureContext = {}

try {
  const requestedPlan = selection
    ? resolveRunPlan(selection)
    : resolveRunPlanFromEnvironment()
  failureContext.requestedPlan = requestedPlan
  const timeZone = resolveBotTimeZone()
  const locale = resolveBotLocale()
  const resolution = resolveScreenshotResolution()
  const screenshotAttribution = resolveScreenshotAttribution()
  const useExistingDataSnapshot = process.env.BOT_USE_EXISTING_DATA_SNAPSHOT === 'true'
  console.log(`[prepare] Requested Run Selection: ${requestedPlan.selection.join(', ')}`)
  console.log(
    useExistingDataSnapshot
      ? '[prepare] Loading the staged fixture Data Snapshot'
      : '[prepare] Downloading a fresh Data Snapshot from splatoon3.ink with Last-known-good fallback'
  )
  const acquisitionResult = await acquireDataSnapshot({
    useExisting: useExistingDataSnapshot,
    createdAt: new Date(preparationTime),
    fallbackDirectory:
      process.env.BOT_LAST_KNOWN_GOOD_DATA_DIRECTORY ||
      path.join(process.cwd(), '.bot-cache', 'last-known-good-data'),
  })
  failureContext.acquisitionResult = acquisitionResult
  const { snapshot: dataSnapshot, acquisition, fallbackReason, cacheWarning } = acquisitionResult
  if (!dataSnapshot.manifest || !dataSnapshot.manifestSha256) {
    throw new Error('A validated Data Snapshot Manifest is required to prepare a Bot Run')
  }
  const snapshot = dataSnapshot.manifest
  const renderTime = useExistingDataSnapshot ? Date.parse(snapshot.createdAt) : preparationTime
  console.log(
    `[prepare] Data Snapshot: ${snapshot.createdAt} from ${snapshot.source} (${acquisition}${fallbackReason ? `; ${fallbackReason}` : ''})`
  )
  if (cacheWarning) {
    console.warn(`[prepare] ${cacheWarning}`)
  }
  console.log(
    `[prepare] Render context: locale=${locale}, timeZone=${timeZone}, resolution=${resolution.name}`
  )
  console.log('[prepare] Checking selected Screenshot content')
  const availability = resolveRunContentAvailability(requestedPlan.screenshots, dataSnapshot, {
    renderTime,
    locale,
    timeZone,
    snapshotAcquisition: acquisition,
  })
  failureContext.availability = availability
  for (const skipped of availability.skipped) {
    console.log(`[prepare] ${formatContentSkip(skipped)}`)
  }
  await writeContentSummary(availability)

  const plan = availability.availableSelection.length > 0
    ? resolveRunPlan(availability.availableSelection)
    : null
  failureContext.effectivePlan = plan
  await writePreparationOutputs(plan, acquisition)
  let reportArtifacts = []

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
    reportArtifacts = manifest.artifacts

    console.log(`Prepared ${plan.label} with ${manifest.artifacts.length} screenshot artifacts`)
  }

  const runReport = await writeBotRunReport(
    createPreparedBotRunReport({
      requestedPlan,
      effectivePlan: plan,
      availability,
      dataSnapshot,
      acquisition,
      renderTime,
      artifacts: reportArtifacts,
      fallbackReason,
      cacheWarning,
    })
  )
  console.log(`[prepare] Bot Run Report: screenshots/run-report.json (${runReport.status})`)
} catch (error) {
  try {
    const acquisitionResult = failureContext.acquisitionResult
    await writeBotRunReport(
      createFailedPreparationBotRunReport({
        requestedPlan: failureContext.requestedPlan,
        requestedScreenshotIds,
        effectivePlan: failureContext.effectivePlan,
        availability: failureContext.availability,
        dataSnapshot: acquisitionResult?.snapshot,
        acquisition: acquisitionResult?.acquisition,
        fallbackReason: acquisitionResult?.fallbackReason,
        startedAt: preparationTime,
        error,
      })
    )
    console.error('[prepare] Failure details were written to screenshots/run-report.json')
  } catch (reportError) {
    console.error(`[prepare] Could not write the failure Bot Run Report: ${reportError.message}`)
  }
  throw error
}
