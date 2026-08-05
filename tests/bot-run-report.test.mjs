import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import {
  createFailedPreparationBotRunReport,
  createPreparedBotRunReport,
  formatBotRunStepSummary,
  readBotRunReport,
  withDiagnostic,
  withDelivery,
  withPublication,
  writeBotRunReport,
} from '../bot/run/BotRunReport.mjs'
import { resolveRunPlan } from '../bot/run/RunPlan.mjs'
import { createPublicationManifestFixture } from './support/PublicationManifestFixture.mjs'

const renderTime = Date.parse('2026-07-29T19:00:00Z')
const snapshotManifestSha256 = 'd7c5a5e88d82efed986c8977764d5cab034235badf6896726e840ca0a22f9b50'
const execFileAsync = promisify(execFile)

function preparedReport() {
  const plan = resolveRunPlan('schedules')
  return createPreparedBotRunReport({
    requestedPlan: plan,
    effectivePlan: plan,
    availability: { skipped: [] },
    dataSnapshot: {
      manifest: {
        createdAt: '2026-07-29T18:30:00.000Z',
        source: 'https://splatoon3.ink/data',
      },
      manifestSha256: snapshotManifestSha256,
    },
    acquisition: 'fresh',
    renderTime,
    artifacts: [{
      name: 'schedules',
      filename: '/tmp/screenshots/schedules.png',
      width: 1_200,
      height: 675,
      bytes: 800_000,
      sha256: 'a'.repeat(64),
    }],
  })
}

test('persists a credential-free Bot Run Report across prepare, publish, and notify', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-run-report-'))
  const filename = path.join(directory, 'run-report.json')
  context.after(() => fs.rm(directory, { recursive: true, force: true }))

  const published = withPublication(
    preparedReport(),
    createPublicationManifestFixture('schedules', { resolution: '1200x675' })
  )
  const completed = withDelivery(published, {
    channelResults: [{ channelName: 'discord', status: 'fulfilled', results: [] }],
    deliveryResults: [{
      deliveryId: 'f'.repeat(64),
      channel: 'discord',
      target: 'community',
      mode: 'digest',
      notification: 'schedules',
      notifications: ['schedules'],
      status: 'fulfilled',
      attempts: 1,
      platformRequestId: 'message-1',
    }],
  })

  await writeBotRunReport(completed, filename)
  assert.deepEqual(await readBotRunReport(filename), completed)
  assert.equal(completed.status, 'completed')
  assert.equal(completed.publication.artifacts[0].images[0].width, 1_200)
  assert.equal(completed.delivery.results[0].platformRequestId, 'message-1')
  assert.doesNotMatch(JSON.stringify(completed), /webhook|accessToken|secret/i)

  const summary = formatBotRunStepSummary(completed)
  assert.match(summary, /Bot Run Report/)
  assert.match(summary, /Data Snapshot/)
  assert.match(summary, /\[open image\]\(https:\/\/cdn\.example\.com/)
  assert.match(summary, /discord \/ community/)
  assert.match(summary, /message-1/)
})

test('marks fallback age and partial Delivery Results explicitly', () => {
  const report = preparedReport()
  const fallback = {
    ...report,
    dataSnapshot: {
      ...report.dataSnapshot,
      acquisition: 'fallback',
      ageMilliseconds: 48 * 60 * 60 * 1_000,
      stale: true,
      fallbackReason: 'upstream unavailable',
    },
  }
  const partial = withDelivery(withPublication(
    fallback,
    createPublicationManifestFixture('schedules', { resolution: '1200x675' })
  ), {
    channelResults: [{ channelName: 'wecom', status: 'rejected', results: [] }],
    deliveryResults: [{
      deliveryId: 'e'.repeat(64),
      channel: 'wecom',
      target: 'main',
      mode: 'individual',
      notification: 'schedules',
      notifications: ['schedules'],
      status: 'rejected',
      attempts: 2,
      error: new Error('HTTP 500 from https://example.com/webhook?key=secret'),
    }],
  }, new Error('delivery failed'))

  assert.equal(partial.status, 'failed')
  assert.equal(partial.dataSnapshot.stale, true)
  assert.match(partial.diagnostics.at(-1).summary, /\?\[redacted\]/)
  assert.doesNotMatch(JSON.stringify(partial), /key=secret/)
})

test('records an actionable report when preparation fails before Data Snapshot acquisition', () => {
  const report = createFailedPreparationBotRunReport({
    requestedPlan: resolveRunPlan(['schedules', 'salmon-run']),
    startedAt: renderTime,
    error: new Error('download failed at https://example.com/data?token=secret'),
  })

  assert.equal(report.status, 'failed')
  assert.equal(report.dataSnapshot, undefined)
  assert.deepEqual(report.selection.requested, ['schedules', 'salmon-run'])
  assert.match(report.diagnostics[0].summary, /\?\[redacted\]/)
  assert.match(formatBotRunStepSummary(report), /Unavailable/)
  assert.doesNotMatch(JSON.stringify(report), /token=secret/)
})

test('prepare records an actionable report when no Screenshot ID is selected', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-empty-run-'))
  context.after(() => fs.rm(directory, { recursive: true, force: true }))
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('RUN_'))
  )

  await assert.rejects(
    execFileAsync(process.execPath, [path.join(process.cwd(), 'bot/run/prepare.mjs')], {
      cwd: directory,
      env: environment,
    }),
    /Select at least one Screenshot ID/
  )

  const report = await readBotRunReport(path.join(directory, 'screenshots/run-report.json'))
  assert.equal(report.status, 'failed')
  assert.equal(report.dataSnapshot, undefined)
  assert.deepEqual(report.selection.requested, ['(missing Screenshot IDs)'])
  assert.match(report.diagnostics[0].summary, /Select at least one Screenshot ID/)
})

test('records shared notification preparation failures with a recovery action', () => {
  const sharedError = new Error('composition failed at https://example.com/data?token=private-value')
  const report = withDelivery(
    withPublication(preparedReport(), createPublicationManifestFixture('schedules')),
    {
      channelResults: [{ channelName: 'wecom', status: 'blocked', results: [] }],
      targetResults: [{
        channel: 'wecom',
        target: 'main',
        status: 'blocked',
        reason: 'Shared Notification preparation failed before Target delivery',
      }],
      deliveryResults: [],
      sharedError,
    },
    sharedError
  )

  assert.equal(report.status, 'failed')
  assert.match(report.diagnostics.at(-1).summary, /composition failed/)
  assert.match(report.diagnostics.at(-1).action, /Data Snapshot|Publication Manifest/)
  assert.doesNotMatch(JSON.stringify(report), /private-value/)
})

test('appends a non-fatal operational warning without changing run status', () => {
  const report = withDiagnostic(preparedReport(), {
    phase: 'prepare',
    severity: 'warning',
    summary: 'Cache save failed with sessionToken=temporary-value',
    action: 'Inspect the Actions cache service and rerun later.',
  })

  assert.equal(report.status, 'prepared')
  assert.match(report.diagnostics.at(-1).summary, /\[redacted credential\]/)
  assert.match(report.diagnostics.at(-1).action, /cache service/)
  assert.doesNotMatch(JSON.stringify(report), /temporary-value/)
})
