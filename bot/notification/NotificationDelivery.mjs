import { z } from 'zod'
import { parseYamlEnvironment } from '../config/YamlEnvironment.mjs'
import { validatePublicationManifest } from '../publish/PublicationManifest.mjs'
import { getNotificationDefinition, getRunPlan } from '../run/RunPlan.mjs'
import { createBotContext } from './BotContext.mjs'
import { composeNotification } from './NotificationComposer.mjs'
import { getChannelAdapter, resolveConfiguredNotificationChannels } from './channels/index.mjs'

function parseTargets(rawConfig, channel) {
  const notificationSelectionSchema = z
    .array(z.string().min(1))
    .min(1)
    .superRefine((notificationIds, validationContext) => {
      const seenNotificationIds = new Set()
      for (const [index, notificationId] of notificationIds.entries()) {
        if (seenNotificationIds.has(notificationId)) {
          validationContext.addIssue({
            code: 'custom',
            path: [index],
            message: `Duplicate Notification: ${notificationId}`,
          })
        }
        seenNotificationIds.add(notificationId)

        try {
          getNotificationDefinition(notificationId)
        } catch {
          validationContext.addIssue({
            code: 'custom',
            path: [index],
            message: `Unknown Notification: ${notificationId}`,
          })
        }
      }
    })
  const targetSchema = channel.targetSchema.extend({ notifications: notificationSelectionSchema.optional() })

  const targetsSchema = z
    .array(targetSchema)
    .min(1)
    .superRefine((targets, context) => {
      const names = new Set()
      for (const [index, target] of targets.entries()) {
        if (names.has(target.name)) {
          context.addIssue({
            code: 'custom',
            path: [index, 'name'],
            message: `Duplicate Notification Target name: ${target.name}`,
          })
        }
        names.add(target.name)
      }
    })

  return parseYamlEnvironment(rawConfig, {
    variableName: channel.configurationEnvironmentVariable,
    schema: targetsSchema,
  })
}

function selectTargetNotificationIds(target, notificationIds) {
  if (!target.notifications) {
    return notificationIds
  }

  const selectedNotificationIds = new Set(target.notifications)
  return notificationIds.filter((notificationId) => selectedNotificationIds.has(notificationId))
}

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

function prepareNotificationChannel(plan, channel, rawConfig) {
  const targets = parseTargets(rawConfig, channel)
  const deliveries = targets
    .map((target) => ({ target, notificationIds: selectTargetNotificationIds(target, plan.notifications) }))
    .filter(({ notificationIds }) => notificationIds.length > 0)

  if (deliveries.length === 0) {
    throw new Error(`No ${channel.name} Notification Targets select ${plan.name} Notifications`)
  }

  return Object.freeze({ channel, deliveries: Object.freeze(deliveries) })
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
  const channel = getChannelAdapter(channelName)
  const preparedChannel = prepareNotificationChannel(plan, channel, rawConfig)
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
  const configuredChannels = resolveConfiguredNotificationChannels({ environment, channelName })
  if (configuredChannels.length === 0) {
    return createNotificationDeliveryReport([])
  }

  const plan = getRunPlan(profileName)
  const channelPreparations = configuredChannels.map(({ channel, rawConfig }) => {
    try {
      return Object.freeze({
        channelName: channel.name,
        status: 'ready',
        preparedChannel: prepareNotificationChannel(plan, channel, rawConfig),
      })
    } catch (error) {
      return Object.freeze({ channelName: channel.name, status: 'rejected', results: [], error })
    }
  })
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
        channelPreparation.status === 'rejected'
          ? channelPreparation
          : Object.freeze({ channelName: channelPreparation.channelName, status: 'blocked', results: [] })
      )
      const report = createNotificationDeliveryReport(blockedChannelResults, error)
      error.report = report
      error.results = report.deliveryResults
      throw error
    }
  }
  const channelResults = await Promise.all(
    channelPreparations.map(async (channelPreparation) => {
      if (channelPreparation.status === 'rejected') {
        return channelPreparation
      }

      try {
        const results = await deliverPreparedNotificationChannel(
          channelPreparation.preparedChannel,
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
