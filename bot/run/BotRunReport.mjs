import crypto from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { readManifestFile, writeManifestFile } from '../manifest/ManifestFile.mjs'
import { redactSensitiveText } from '../security/Redaction.mjs'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const diagnosticSchema = z.object({
  phase: z.enum(['prepare', 'publish', 'notify']),
  severity: z.enum(['info', 'warning', 'error']),
  summary: z.string().min(1),
  action: z.string().min(1).optional(),
}).strict()

const botRunReportSchema = z.object({
  version: z.literal(1),
  runId: sha256Schema,
  status: z.enum(['prepared', 'no-content', 'published', 'completed', 'partial', 'failed']),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  dataSnapshot: z.object({
    createdAt: z.string().datetime(),
    source: z.url(),
    manifestSha256: sha256Schema,
    acquisition: z.enum(['fresh', 'fallback', 'fixture']),
    ageMilliseconds: z.number().int().nonnegative(),
    stale: z.boolean(),
    fallbackReason: z.string().min(1).optional(),
  }).strict().optional(),
  selection: z.object({
    requested: z.array(z.string().min(1)).min(1),
    effective: z.array(z.string().min(1)),
    skipped: z.array(z.object({
      screenshotId: z.string().min(1),
      reason: z.string().min(1),
      nextAction: z.string().min(1).optional(),
    }).strict()),
  }).strict(),
  screenshots: z.array(z.object({
    screenshotId: z.string().min(1),
    filename: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    bytes: z.number().int().positive(),
    sha256: sha256Schema,
  }).strict()),
  publication: z.object({
    assetBaseUrl: z.url(),
    artifacts: z.array(z.object({
      screenshotId: z.string().min(1),
      images: z.array(z.object({
        variant: z.string().min(1),
        url: z.url(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        bytes: z.number().int().positive(),
        sha256: sha256Schema,
      }).strict()).min(1),
    }).strict()),
  }).strict().optional(),
  delivery: z.object({
    channels: z.array(z.object({
      channel: z.string().min(1),
      status: z.enum(['fulfilled', 'rejected', 'skipped', 'blocked']),
    }).strict()),
    targets: z.array(z.object({
      channel: z.string().min(1),
      target: z.string().min(1),
      status: z.enum(['fulfilled', 'preserved', 'partial', 'rejected', 'skipped', 'blocked']),
      reason: z.string().min(1).optional(),
    }).strict()),
    results: z.array(z.object({
      deliveryId: sha256Schema,
      channel: z.string().min(1),
      target: z.string().min(1),
      mode: z.enum(['individual', 'digest']),
      requestedMode: z.enum(['individual', 'digest']),
      fallbackReason: z.string().min(1).optional(),
      notificationIds: z.array(z.string().min(1)).min(1),
      status: z.enum(['fulfilled', 'preserved', 'rejected']),
      attempts: z.number().int().nonnegative(),
      platformRequestId: z.string().min(1).optional(),
      error: z.string().min(1).optional(),
    }).strict()),
  }).strict().optional(),
  diagnostics: z.array(diagnosticSchema),
}).strict()

export const defaultBotRunReportFilename = path.join('screenshots', 'run-report.json')

function timestamp(value = Date.now()) {
  return new Date(value).toISOString()
}

function createRunId({ snapshotManifestSha256, renderTime, requested }) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify([snapshotManifestSha256, renderTime, requested]))
    .digest('hex')
}

function snapshotReport(dataSnapshot, acquisition, renderTime, {
  fallbackReason,
  staleAfterMilliseconds = 24 * 60 * 60 * 1_000,
} = {}) {
  if (!dataSnapshot?.manifest || !dataSnapshot.manifestSha256) {
    return undefined
  }
  const createdAt = Date.parse(dataSnapshot.manifest.createdAt)
  const ageMilliseconds = Math.max(0, renderTime - createdAt)
  return {
    createdAt: dataSnapshot.manifest.createdAt,
    source: dataSnapshot.manifest.source,
    manifestSha256: dataSnapshot.manifestSha256,
    acquisition,
    ageMilliseconds,
    stale: ageMilliseconds > staleAfterMilliseconds,
    ...(fallbackReason ? { fallbackReason: redactSensitiveText(fallbackReason) } : {}),
  }
}

export function validateBotRunReport(value) {
  return botRunReportSchema.parse(value)
}

export function createPreparedBotRunReport({
  requestedPlan,
  effectivePlan,
  availability,
  dataSnapshot,
  acquisition,
  renderTime,
  artifacts = [],
  fallbackReason,
  cacheWarning,
  staleAfterMilliseconds = 24 * 60 * 60 * 1_000,
}) {
  const now = timestamp(renderTime)
  return validateBotRunReport({
    version: 1,
    runId: createRunId({
      snapshotManifestSha256: dataSnapshot.manifestSha256,
      renderTime,
      requested: requestedPlan.selection,
    }),
    status: effectivePlan ? 'prepared' : 'no-content',
    startedAt: now,
    updatedAt: now,
    dataSnapshot: snapshotReport(dataSnapshot, acquisition, renderTime, {
      fallbackReason,
      staleAfterMilliseconds,
    }),
    selection: {
      requested: requestedPlan.selection,
      effective: effectivePlan?.selection || [],
      skipped: availability.skipped.map(({ screenshotId, reason, nextAction }) => ({
        screenshotId,
        reason,
        ...(nextAction ? { nextAction } : {}),
      })),
    },
    screenshots: artifacts.map(({ name, filename, width, height, bytes, sha256 }) => ({
      screenshotId: name,
      filename: path.basename(filename),
      width,
      height,
      bytes,
      sha256,
    })),
    diagnostics: [
      ...(acquisition === 'fallback'
        ? [{
            phase: 'prepare',
            severity: 'warning',
            summary: `Fresh Data Snapshot unavailable; using validated fallback from ${dataSnapshot.manifest.createdAt}`,
            action: 'Check splatoon3.ink availability; expired content remains excluded automatically.',
          }]
        : []),
      ...(cacheWarning
        ? [{
            phase: 'prepare',
            severity: 'warning',
            summary: redactSensitiveText(cacheWarning),
            action: 'Inspect the Actions cache step and permissions; this run still uses the validated fresh Data Snapshot.',
          }]
        : []),
      ...availability.skipped.map(({ screenshotId, reason, nextAction }) => ({
        phase: 'prepare',
        severity: 'info',
        summary: `${screenshotId} skipped: ${reason}`,
        ...(nextAction ? { action: nextAction } : {}),
      })),
    ],
  })
}

export function createFailedPreparationBotRunReport({
  requestedPlan,
  requestedScreenshotIds = [],
  effectivePlan,
  availability = { skipped: [] },
  dataSnapshot,
  acquisition,
  fallbackReason,
  startedAt = Date.now(),
  error,
}) {
  const requested = requestedPlan?.selection || requestedScreenshotIds
  const normalizedRequested = requested.length > 0 ? requested : ['(missing Screenshot IDs)']
  return validateBotRunReport({
    version: 1,
    runId: createRunId({
      snapshotManifestSha256: dataSnapshot?.manifestSha256 || 'unavailable',
      renderTime: startedAt,
      requested: normalizedRequested,
    }),
    status: 'failed',
    startedAt: timestamp(startedAt),
    updatedAt: timestamp(),
    ...(dataSnapshot?.manifest && dataSnapshot.manifestSha256
      ? {
          dataSnapshot: snapshotReport(dataSnapshot, acquisition, startedAt, { fallbackReason }),
        }
      : {}),
    selection: {
      requested: normalizedRequested,
      effective: effectivePlan?.selection || [],
      skipped: availability.skipped.map(({ screenshotId, reason, nextAction }) => ({
        screenshotId,
        reason,
        ...(nextAction ? { nextAction } : {}),
      })),
    },
    screenshots: [],
    diagnostics: [{
      phase: 'prepare',
      severity: 'error',
      summary: redactSensitiveText(error.message),
      action: dataSnapshot
        ? 'Inspect content, build, and screenshot diagnostics, then rerun the Bot Run.'
        : 'Check splatoon3.ink availability and the Last-known-good Data Snapshot cache, then rerun the Bot Run.',
    }],
  })
}

export function withPublication(report, publicationManifest) {
  return validateBotRunReport({
    ...report,
    status: 'published',
    updatedAt: timestamp(),
    publication: {
      assetBaseUrl: publicationManifest.assetBaseUrl,
      artifacts: publicationManifest.artifacts.map((artifact) => ({
        screenshotId: artifact.name,
        images: [
          ['notificationImage', artifact.notificationImage],
          ...Object.entries(artifact.platformImages),
          ['originalImage', artifact.originalImage],
        ].map(([variant, image]) => ({
          variant,
          url: image.url,
          width: image.width,
          height: image.height,
          bytes: image.bytes,
          sha256: image.sha256,
        })),
      })),
    },
  })
}

export function withDelivery(report, deliveryReport, error) {
  const results = deliveryReport?.deliveryResults || []
  const failures = results.filter(({ status }) => status === 'rejected')
  const diagnostics = [
    ...report.diagnostics,
    ...failures.map((result) => ({
      phase: 'notify',
      severity: 'error',
      summary: `${result.channel}/${result.target}/${result.notification}: ${redactSensitiveText(result.error?.message || 'delivery failed')}`,
      action: result.error?.action || 'Inspect the target credentials and platform response, then rerun the failed publish job; successful Delivery IDs are preserved.',
    })),
    ...(deliveryReport?.sharedError
      ? [{
          phase: 'notify',
          severity: 'error',
          summary: redactSensitiveText(deliveryReport.sharedError.message),
          action: 'Verify that the archived Data Snapshot and Publication Manifest match this Bot Run, then rerun the publish job.',
        }]
      : []),
    ...(!deliveryReport && error
      ? [{
          phase: 'notify',
          severity: 'error',
          summary: redactSensitiveText(error.message),
          action: 'Inspect configuration preflight and notification preparation logs.',
        }]
      : []),
  ]
  return validateBotRunReport({
    ...report,
    status: error ? (results.some(({ status }) => status !== 'rejected') ? 'partial' : 'failed') : 'completed',
    updatedAt: timestamp(),
    delivery: {
      channels: (deliveryReport?.channelResults || []).map(({ channelName, status }) => ({
        channel: channelName,
        status,
      })),
      targets: (deliveryReport?.targetResults || []).map(({ channel, target, status, reason }) => ({
        channel,
        target,
        status,
        ...(reason ? { reason } : {}),
      })),
      results: results.map((result) => ({
        deliveryId: result.deliveryId,
        channel: result.channel,
        target: result.target,
        mode: result.mode,
        requestedMode: result.requestedMode || result.mode,
        ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
        notificationIds: result.notifications,
        status: result.status,
        attempts: result.attempts,
        ...(result.platformRequestId ? { platformRequestId: result.platformRequestId } : {}),
        ...(result.error ? { error: redactSensitiveText(result.error.message) } : {}),
      })),
    },
    diagnostics,
  })
}

export function withFailure(report, phase, error, action) {
  return validateBotRunReport({
    ...report,
    status: 'failed',
    updatedAt: timestamp(),
    diagnostics: [
      ...report.diagnostics,
      {
        phase,
        severity: 'error',
        summary: redactSensitiveText(error.message),
        ...(action ? { action } : {}),
      },
    ],
  })
}

export function withDiagnostic(report, diagnostic) {
  return validateBotRunReport({
    ...report,
    updatedAt: timestamp(),
    diagnostics: [
      ...report.diagnostics,
      {
        ...diagnostic,
        summary: redactSensitiveText(diagnostic.summary),
        ...(diagnostic.action
          ? { action: redactSensitiveText(diagnostic.action) }
          : {}),
      },
    ],
  })
}

export async function writeBotRunReport(value, filename = defaultBotRunReportFilename) {
  return writeManifestFile({ filename, value, validate: validateBotRunReport })
}

export async function readBotRunReport(filename = defaultBotRunReportFilename) {
  return readManifestFile({ filename, validate: validateBotRunReport })
}

function formatBytes(bytes) {
  if (bytes < 1_000) return `${bytes} B`
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`
  return `${(bytes / 1_000_000).toFixed(2)} MB`
}

function formatAge(milliseconds) {
  const minutes = Math.floor(milliseconds / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return hours < 48 ? `${hours}h ${minutes % 60}m` : `${Math.floor(hours / 24)}d ${hours % 24}h`
}

function tableText(value) {
  return String(value || '—').replaceAll('|', '\\|').replace(/\s+/gu, ' ').trim()
}

export function formatBotRunStepSummary(report) {
  const lines = [
    '## Bot Run Report',
    '',
    `**Status:** ${report.status}  `,
    `**Run ID:** \`${report.runId}\``,
    '',
    '### Data Snapshot',
    '',
    ...(report.dataSnapshot
      ? [
          '| Acquisition | Created at | Age | Freshness | Source |',
          '| --- | --- | ---: | --- | --- |',
          `| ${report.dataSnapshot.acquisition} | ${report.dataSnapshot.createdAt} | ${formatAge(report.dataSnapshot.ageMilliseconds)} | ${report.dataSnapshot.stale ? 'stale' : 'current'} | ${report.dataSnapshot.source} |`,
        ]
      : ['- Unavailable: preparation failed before a validated Data Snapshot could be acquired.']),
    '',
    '### Screenshot IDs',
    '',
    `- Requested: ${report.selection.requested.map((id) => `\`${id}\``).join(', ')}`,
    `- Effective: ${report.selection.effective.length > 0 ? report.selection.effective.map((id) => `\`${id}\``).join(', ') : 'none'}`,
  ]
  if (report.selection.skipped.length > 0) {
    lines.push('', '| Skipped | Reason |', '| --- | --- |')
    for (const skipped of report.selection.skipped) {
      lines.push(`| \`${skipped.screenshotId}\` | ${tableText(skipped.reason)} |`)
    }
  }
  if (report.publication) {
    lines.push(
      '',
      '### Published images',
      '',
      '| Screenshot ID | Primary image | Dimensions | Size |',
      '| --- | --- | ---: | ---: |'
    )
    for (const artifact of report.publication.artifacts) {
      const image = artifact.images.find(({ variant }) => variant === 'notificationImage')
      lines.push(
        `| \`${artifact.screenshotId}\` | [open image](${image.url}) | ${image.width}×${image.height} | ${formatBytes(image.bytes)} |`
      )
    }
  }
  if (report.delivery) {
    lines.push(
      '',
      '### Target routing',
      '',
      '| Channel / Target | Result | Detail |',
      '| --- | --- | --- |'
    )
    if (report.delivery.targets.length === 0) {
      lines.push('| — | No configured Target | — |')
    }
    for (const target of report.delivery.targets) {
      lines.push(
        `| ${tableText(`${target.channel} / ${target.target}`)} | ${target.status} | ${tableText(target.reason)} |`
      )
    }
    lines.push(
      '',
      '### Delivery Ledger',
      '',
      '| Channel / Target | Mode | Notifications | Result | Attempts | Platform request ID |',
      '| --- | --- | --- | --- | ---: | --- |'
    )
    if (report.delivery.results.length === 0) {
      lines.push('| — | — | — | No configured delivery | — | — |')
    }
    for (const result of report.delivery.results) {
      lines.push(
        `| ${tableText(`${result.channel} / ${result.target}`)} | ${result.requestedMode === result.mode ? result.mode : `${result.requestedMode} → ${result.mode}`} | ${result.notificationIds.map((id) => `\`${id}\``).join(', ')} | ${result.status} | ${result.attempts} | ${tableText(result.platformRequestId)} |`
      )
    }
  }
  if (report.diagnostics.length > 0) {
    lines.push('', '### Diagnostics', '')
    for (const diagnostic of report.diagnostics) {
      lines.push(`- **${diagnostic.phase}/${diagnostic.severity}:** ${diagnostic.summary}${diagnostic.action ? ` Next: ${diagnostic.action}` : ''}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}
