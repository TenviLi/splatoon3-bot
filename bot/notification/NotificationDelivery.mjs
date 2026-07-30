import { z } from 'zod'
import { getNotificationDefinition, getRunPlan } from '../run/RunPlan.mjs'
import { createBotContext } from './BotContext.mjs'
import { composeNotification, normalizeAssetBaseUrl } from './NotificationComposer.mjs'
import { getChannelAdapter, resolveConfiguredNotificationChannels } from './channels/index.mjs'

function parseTargets(rawConfig, channel) {
  if (!rawConfig) {
    throw new Error(`${channel.configurationEnvironmentVariable} is required for ${channel.name}`)
  }

  let value
  try {
    value = JSON.parse(rawConfig)
  } catch (error) {
    throw new Error(`Invalid JSON in ${channel.name} channel configuration`, { cause: error })
  }

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

  return z
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
    .parse(value)
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

async function composeRunNotifications(plan, { assetBaseUrl, snapshotDirectory, now }) {
  const normalizedAssetBaseUrl = normalizeAssetBaseUrl(assetBaseUrl)
  const context = await createBotContext({ snapshotDirectory, now })
  return new Map(
    plan.notifications.map((notificationId) => [
      notificationId,
      composeNotification(notificationId, context, { assetBaseUrl: normalizedAssetBaseUrl }),
    ])
  )
}

function createNotificationDeliveryReport(channelResults, sharedError) {
  return Object.freeze({
    channelResults: Object.freeze(channelResults),
    deliveryResults: Object.freeze(channelResults.flatMap(({ results }) => results)),
    ...(sharedError ? { sharedError } : {}),
  })
}

async function deliverPreparedNotificationChannel(preparedChannel, notifications, fetchImpl) {
  const { channel, deliveries } = preparedChannel
  const targetResults = await Promise.all(
    deliveries.map(({ target, notificationIds }) =>
      deliverTargetNotifications(
        channel,
        target,
        notificationIds.map((notificationId) => notifications.get(notificationId)),
        { fetchImpl }
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
  assetBaseUrl = process.env.UPYUN_DOMAIN,
  snapshotDirectory,
  now = Date.now(),
  fetchImpl = fetch,
}) {
  const plan = getRunPlan(profileName)
  const channel = getChannelAdapter(channelName)
  const preparedChannel = prepareNotificationChannel(plan, channel, rawConfig)
  const notifications = await composeRunNotifications(plan, { assetBaseUrl, snapshotDirectory, now })
  return deliverPreparedNotificationChannel(preparedChannel, notifications, fetchImpl)
}

export async function deliverConfiguredNotificationChannels({
  profileName,
  channelName,
  environment = process.env,
  assetBaseUrl = environment.UPYUN_DOMAIN,
  snapshotDirectory,
  now = Date.now(),
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
  let notifications = new Map()
  if (hasDeliverableChannel) {
    try {
      notifications = await composeRunNotifications(plan, { assetBaseUrl, snapshotDirectory, now })
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
          notifications,
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
