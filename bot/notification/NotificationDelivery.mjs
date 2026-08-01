import { validatePublicationManifest } from '../publish/PublicationManifest.mjs'
import { getRunPlan } from '../run/RunPlan.mjs'
import { createBotContext } from './BotContext.mjs'
import { composeNotification } from './NotificationComposer.mjs'
import {
  prepareConfiguredNotificationChannels,
  prepareNotificationChannelConfiguration,
} from './NotificationConfiguration.mjs'

async function deliverTargetNotifications(channel, target, notifications, options) {
  const results = []

  for (const notification of notifications) {
    try {
      const response = await channel.deliver(notification, target, options)
      results.push(
        Object.freeze({
          channel: channel.name,
          target: target.name,
          notification: notification.id,
          status: 'fulfilled',
          response,
        })
      )
    } catch (error) {
      results.push(
        Object.freeze({
          channel: channel.name,
          target: target.name,
          notification: notification.id,
          status: 'rejected',
          error,
        })
      )
    }
  }

  return results
}

async function composeRunNotifications(plan, { publicationManifest, snapshotDirectory, now, timeZone }) {
  const publication = validatePublicationManifest(publicationManifest)
  if (publication.profile !== plan.name) {
    throw new Error(`Publication manifest profile ${publication.profile} does not match ${plan.name}`)
  }
  const context = await createBotContext({ snapshotDirectory, now, timeZone })
  if (context.snapshotManifestSha256 !== publication.snapshotManifestSha256) {
    throw new Error('Archived Data Snapshot Manifest does not match Publication Manifest')
  }
  return Object.freeze({
    assetBaseUrl: publication.assetBaseUrl,
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
    deliveryResults: Object.freeze(channelResults.flatMap(({ results }) => results)),
    ...(sharedError ? { sharedError } : {}),
  })
}

function emptyChannelResult(channelPreparation) {
  return Object.freeze({
    channelName: channelPreparation.channelName,
    status: channelPreparation.status,
    results: Object.freeze([]),
    ...(channelPreparation.error ? { error: channelPreparation.error } : {}),
  })
}

async function deliverPreparedNotificationChannel(preparedChannel, notificationRun, fetchImpl) {
  const { channel, deliveries } = preparedChannel
  const targetResults = await Promise.all(
    deliveries.map(({ target, notificationIds }) =>
      deliverTargetNotifications(
        channel,
        target,
        notificationIds.map((notificationId) => notificationRun.notifications.get(notificationId)),
        { fetchImpl, assetBaseUrl: notificationRun.assetBaseUrl }
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
  profileName,
  channelName,
  rawConfig,
  publicationManifest,
  snapshotDirectory,
  now = Date.now(),
  timeZone,
  fetchImpl = fetch,
}) {
  const plan = getRunPlan(profileName)
  const preparedChannel = prepareNotificationChannelConfiguration({ profileName, channelName, rawConfig })
  const notificationRun = await composeRunNotifications(plan, {
    publicationManifest,
    snapshotDirectory,
    now,
    timeZone,
  })
  return deliverPreparedNotificationChannel(preparedChannel, notificationRun, fetchImpl)
}

export async function deliverConfiguredNotificationChannels({
  profileName,
  channelName,
  environment = process.env,
  publicationManifest,
  snapshotDirectory,
  now = Date.now(),
  timeZone,
  fetchImpl = fetch,
}) {
  const configuration = prepareConfiguredNotificationChannels({ profileName, channelName, environment })
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
          fetchImpl
        )
        return Object.freeze({ channelName: channelPreparation.channelName, status: 'fulfilled', results })
      } catch (error) {
        return Object.freeze({
          channelName: channelPreparation.channelName,
          status: 'rejected',
          results: error.results || [],
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
