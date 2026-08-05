import { validatePublicationManifest } from '../publish/PublicationManifest.mjs'
import { resolveRunPlan } from '../run/RunPlan.mjs'
import { createBotContext } from './BotContext.mjs'
import { composeNotification } from './NotificationComposer.mjs'
import { composeEventAlerts } from './EventAlert.mjs'
import {
  createDeliveryLedgerRecord,
  createMemoryDeliveryLedgerStore,
  createStableDeliveryId,
} from './DeliveryLedger.mjs'
import {
  prepareConfiguredNotificationChannels,
  prepareNotificationChannelConfiguration,
} from './NotificationConfiguration.mjs'
import { redactSensitiveError } from '../security/Redaction.mjs'

function deliveryResultBase(channel, target, operation, deliveryId) {
  const notificationIds = operation.notifications.map(({ id }) => id)
  return {
    deliveryId,
    channel: channel.name,
    target: target.name,
    mode: operation.mode,
    requestedMode: operation.requestedMode,
    ...(operation.fallbackReason ? { fallbackReason: operation.fallbackReason } : {}),
    notification: notificationIds.join(','),
    notifications: Object.freeze(notificationIds),
  }
}

async function deliverTargetNotifications(channel, target, operations, options) {
  const results = []

  for (const operation of operations) {
    const deliveryId = createStableDeliveryId({
      channel,
      target,
      mode: operation.mode,
      notifications: operation.notifications,
      runKey: operation.runKey,
      stateKey: operation.stateKey,
    })
    const base = deliveryResultBase(channel, target, operation, deliveryId)
    let previous
    let deliveryAccepted = false
    let requestAttempts = 0
    try {
      previous = await options.ledgerStore.read(deliveryId)
      if (previous?.status === 'fulfilled') {
        results.push(
          Object.freeze({
            ...base,
            status: 'preserved',
            attempts: previous.attempts,
            ...(previous.platformRequestId
              ? { platformRequestId: previous.platformRequestId }
              : {}),
          })
        )
        continue
      }
      if (['attempting', 'uncertain'].includes(previous?.status)) {
        const unresolvedError = new Error(
          `Delivery ${deliveryId} has an unresolved previous attempt; refusing to risk a duplicate message`
        )
        unresolvedError.retryable = false
        unresolvedError.action = 'Check the destination message history. If the message did not arrive, delete the private Delivery Ledger cache and rerun; if it did arrive, do not force a resend.'
        throw unresolvedError
      }

      const attempting = createDeliveryLedgerRecord({
        deliveryId,
        channel,
        target,
        operation,
        previous,
        status: 'attempting',
      })
      await options.ledgerStore.write(attempting)
      previous = attempting
      const response = await channel.deliver(operation, target, {
        ...options,
        ...channel.createDeliveryOptions(deliveryId),
        onAttempt: () => {
          requestAttempts += 1
        },
      })
      deliveryAccepted = true
      const platformRequestId = channel.extractReceipt(response)
      const fulfilled = createDeliveryLedgerRecord({
        deliveryId,
        channel,
        target,
        operation,
        previous: attempting,
        status: 'fulfilled',
        platformRequestId,
        attemptIncrement: Math.max(0, requestAttempts - 1),
      })
      await options.ledgerStore.write(fulfilled)
      results.push(
        Object.freeze({
          ...base,
          status: 'fulfilled',
          attempts: fulfilled.attempts,
          ...(platformRequestId ? { platformRequestId: String(platformRequestId) } : {}),
          response,
        })
      )
    } catch (error) {
      const isUncertain = deliveryAccepted || (
        error.deliveryOutcome === 'uncertain' &&
        channel.capabilities.retry.idempotency === 'none'
      )
      if (isUncertain && !error.action) {
        error.action = 'Check the destination message history. If the message did not arrive, delete the private Delivery Ledger cache and rerun; if it did arrive, do not force a resend.'
      }
      const redactedError = redactSensitiveError(error, target)
      let ledgerError
      if (
        !['attempting', 'uncertain'].includes(previous?.status) ||
        !error.message.includes('unresolved previous attempt')
      ) {
        try {
          const rejected = createDeliveryLedgerRecord({
            deliveryId,
            channel,
            target,
            operation,
            previous,
            status: isUncertain ? 'uncertain' : 'rejected',
            error,
            attemptIncrement: previous?.status === 'attempting'
              ? Math.max(0, requestAttempts - 1)
              : Math.max(1, requestAttempts),
          })
          await options.ledgerStore.write(rejected)
          previous = rejected
        } catch (writeError) {
          ledgerError = writeError
        }
      }
      results.push(
        Object.freeze({
          ...base,
          status: 'rejected',
          attempts: previous?.attempts || 0,
          error: ledgerError
            ? new AggregateError(
                [redactedError, redactSensitiveError(ledgerError, target)],
                'Delivery and Delivery Ledger update failed'
              )
            : redactedError,
        })
      )
    }
  }

  return results
}

async function composeRunNotifications(plan, { publicationManifest, snapshotDirectory, now, timeZone }) {
  const publication = validatePublicationManifest(publicationManifest)
  if (publication.selection.join(',') !== plan.selection.join(',')) {
    throw new Error(
      `Publication manifest selection ${publication.selection.join(',')} does not match ${plan.selection.join(',')}`
    )
  }
  const context = await createBotContext({ snapshotDirectory, now, timeZone, locale: publication.locale })
  if (context.snapshotManifestSha256 !== publication.snapshotManifestSha256) {
    throw new Error('Archived Data Snapshot Manifest does not match Publication Manifest')
  }
  return Object.freeze({
    assetBaseUrl: publication.assetBaseUrl,
    periodicRunKey: Object.freeze({
      renderTime: publication.renderTime,
      snapshotManifestSha256: publication.snapshotManifestSha256,
      selection: publication.selection,
    }),
    context,
    notifications: new Map(
      plan.notifications.map((notificationId) => [
        notificationId,
        composeNotification(notificationId, context, { publicationManifest: publication }),
      ])
    ),
  })
}

function createNotificationDeliveryReport(channelResults, sharedError) {
  return Object.freeze({
    channelResults: Object.freeze(channelResults),
    targetResults: Object.freeze(channelResults.flatMap(({ targetResults = [] }) => targetResults)),
    deliveryResults: Object.freeze(channelResults.flatMap(({ results }) => results)),
    ...(sharedError ? { sharedError } : {}),
  })
}

function createTargetResults(channelPreparation, deliveryResults = [], { blocked = false } = {}) {
  return Object.freeze(
    (channelPreparation.targetRoutes || []).map(({ target, notificationIds, status }) => {
      if (status === 'skipped') {
        return Object.freeze({
          channel: channelPreparation.channelName,
          target: target.name,
          status: 'skipped',
          reason: 'Target screenshotIds do not intersect this Run Selection',
        })
      }
      if (blocked) {
        return Object.freeze({
          channel: channelPreparation.channelName,
          target: target.name,
          status: 'blocked',
          reason: 'Shared Notification preparation failed before Target delivery',
        })
      }

      const results = deliveryResults.filter((result) => result.target === target.name)
      if (results.length === 0) {
        return Object.freeze({
          channel: channelPreparation.channelName,
          target: target.name,
          status: 'skipped',
          reason: target.alerts?.includePeriodic === false
            ? 'No new Event Alert state matched this alerts-only Target'
            : `No delivery was produced for ${notificationIds.join(', ')}`,
        })
      }
      const rejected = results.filter(({ status: resultStatus }) => resultStatus === 'rejected').length
      const preserved = results.filter(({ status: resultStatus }) => resultStatus === 'preserved').length
      const targetStatus = rejected === results.length
        ? 'rejected'
        : rejected > 0
          ? 'partial'
          : preserved === results.length
            ? 'preserved'
            : 'fulfilled'
      return Object.freeze({
        channel: channelPreparation.channelName,
        target: target.name,
        status: targetStatus,
      })
    })
  )
}

function emptyChannelResult(channelPreparation) {
  return Object.freeze({
    channelName: channelPreparation.channelName,
    status: channelPreparation.status,
    results: Object.freeze([]),
    targetResults: createTargetResults(channelPreparation),
    ...(channelPreparation.error ? { error: channelPreparation.error } : {}),
  })
}

async function deliverPreparedNotificationChannel(preparedChannel, notificationRun, options) {
  const { channel, deliveries } = preparedChannel
  const targetResults = await Promise.all(
    deliveries.map(({ target, notificationIds, operations }) =>
      deliverTargetNotifications(
        channel,
        target,
        [
          ...(target.alerts?.includePeriodic === false ? [] : operations).map((operation) => ({
            ...operation,
            runKey: notificationRun.periodicRunKey,
            notifications: operation.notificationIds.map((notificationId) =>
              notificationRun.notifications.get(notificationId)
            ),
          })),
          ...composeEventAlerts({
            context: notificationRun.context,
            notifications: notificationRun.notifications,
            target,
            notificationIds,
          }).map(({ eventKey, notification }) => ({
            mode: 'individual',
            requestedMode: 'individual',
            notificationIds: [notification.id],
            notifications: [notification],
            stateKey: eventKey,
          })),
        ],
        { ...options, assetBaseUrl: notificationRun.assetBaseUrl }
      )
    )
  )
  const results = targetResults.flat()
  const failures = results.filter((result) => result.status === 'rejected')

  if (failures.length > 0) {
    const error = new AggregateError(
      failures.map((failure) => failure.error),
      `${failures.length} ${channel.name} notification deliveries failed`
    )
    error.results = results
    throw error
  }

  return results
}

export async function deliverNotificationChannel({
  selection,
  channelName,
  rawConfig,
  publicationManifest,
  snapshotDirectory,
  now = Date.now(),
  timeZone,
  fetchImpl = fetch,
  ledgerStore = createMemoryDeliveryLedgerStore(),
}) {
  const plan = resolveRunPlan(selection)
  const preparedChannel = prepareNotificationChannelConfiguration({ selection, channelName, rawConfig })
  const notificationRun = await composeRunNotifications(plan, {
    publicationManifest,
    snapshotDirectory,
    now,
    timeZone,
  })
  return deliverPreparedNotificationChannel(preparedChannel, notificationRun, { fetchImpl, ledgerStore })
}

export async function deliverConfiguredNotificationChannels({
  selection,
  channelName,
  environment = process.env,
  publicationManifest,
  snapshotDirectory,
  now = Date.now(),
  timeZone,
  fetchImpl = fetch,
  ledgerStore = createMemoryDeliveryLedgerStore(),
}) {
  const configuration = prepareConfiguredNotificationChannels({ selection, channelName, environment })
  if (configuration.channels.length === 0) {
    return createNotificationDeliveryReport([])
  }

  const { plan } = configuration
  const channelPreparations = configuration.channels
  const hasDeliverableChannel = channelPreparations.some(({ status }) => status === 'ready')
  let notificationRun
  if (hasDeliverableChannel) {
    try {
      notificationRun = await composeRunNotifications(plan, {
        publicationManifest,
        snapshotDirectory,
        now,
        timeZone,
      })
    } catch (error) {
      const blockedChannelResults = channelPreparations.map((channelPreparation) =>
        channelPreparation.status !== 'ready'
          ? emptyChannelResult(channelPreparation)
          : Object.freeze({
              channelName: channelPreparation.channelName,
              status: 'blocked',
              results: Object.freeze([]),
              targetResults: createTargetResults(channelPreparation, [], { blocked: true }),
            })
      )
      const report = createNotificationDeliveryReport(blockedChannelResults, error)
      error.report = report
      error.results = report.deliveryResults
      throw error
    }
  }
  const channelResults = await Promise.all(
    channelPreparations.map(async (channelPreparation) => {
      if (channelPreparation.status !== 'ready') {
        return emptyChannelResult(channelPreparation)
      }

      try {
        const results = await deliverPreparedNotificationChannel(
          channelPreparation,
          notificationRun,
          { fetchImpl, ledgerStore }
        )
        return Object.freeze({
          channelName: channelPreparation.channelName,
          status: 'fulfilled',
          results,
          targetResults: createTargetResults(channelPreparation, results),
        })
      } catch (error) {
        const results = error.results || []
        return Object.freeze({
          channelName: channelPreparation.channelName,
          status: 'rejected',
          results,
          targetResults: createTargetResults(channelPreparation, results),
          error,
        })
      }
    })
  )
  const report = createNotificationDeliveryReport(channelResults)
  const failures = channelResults.filter(({ status }) => status === 'rejected')

  if (failures.length > 0) {
    const error = new AggregateError(
      failures.map((failure) => failure.error),
      `${failures.length} notification channels failed`
    )
    error.report = report
    error.results = report.deliveryResults
    throw error
  }

  return report
}
