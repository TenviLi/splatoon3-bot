import { z } from 'zod'
import { parseYamlEnvironment } from '../config/YamlEnvironment.mjs'
import { getNotificationDefinition, getRunPlan } from '../run/RunPlan.mjs'
import { getChannelAdapter, resolveConfiguredNotificationChannels } from './channels/index.mjs'

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

function targetConfigurationSchema(channel) {
  const targetSchema = channel.targetSchema.extend({
    notifications: notificationSelectionSchema.optional(),
  })

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
}

function parseTargets(rawConfig, channel) {
  return parseYamlEnvironment(rawConfig, {
    variableName: channel.configurationEnvironmentVariable,
    schema: targetConfigurationSchema(channel),
  })
}

function selectTargetNotificationIds(target, notificationIds) {
  if (!target.notifications) {
    return notificationIds
  }

  const selectedNotificationIds = new Set(target.notifications)
  return notificationIds.filter((notificationId) => selectedNotificationIds.has(notificationId))
}

function prepareChannel(plan, channel, rawConfig) {
  const targets = parseTargets(rawConfig, channel)
  const deliveries = targets
    .map((target) => ({
      target,
      notificationIds: Object.freeze(selectTargetNotificationIds(target, plan.notifications)),
    }))
    .filter(({ notificationIds }) => notificationIds.length > 0)

  return Object.freeze({
    channel,
    channelName: channel.name,
    status: deliveries.length > 0 ? 'ready' : 'skipped',
    targetCount: targets.length,
    deliveries: Object.freeze(deliveries),
  })
}

function requireSelectedChannelDeliveries(preparedChannel, profileName) {
  if (preparedChannel.status === 'skipped') {
    throw new Error(
      `No ${preparedChannel.channelName} Notification Targets select ${profileName} Notifications`
    )
  }
  return preparedChannel
}

export function prepareNotificationChannelConfiguration({ profileName, channelName, rawConfig }) {
  return requireSelectedChannelDeliveries(
    prepareChannel(getRunPlan(profileName), getChannelAdapter(channelName), rawConfig),
    profileName
  )
}

export function prepareConfiguredNotificationChannels({
  profileName,
  channelName,
  environment = process.env,
}) {
  const plan = getRunPlan(profileName)
  const configuredChannels = resolveConfiguredNotificationChannels({ environment, channelName })
  const channels = configuredChannels.map(({ channel, rawConfig }) => {
    try {
      const preparedChannel = prepareChannel(plan, channel, rawConfig)
      return channelName
        ? requireSelectedChannelDeliveries(preparedChannel, profileName)
        : preparedChannel
    } catch (error) {
      return Object.freeze({
        channelName: channel.name,
        status: 'rejected',
        targetCount: 0,
        deliveries: Object.freeze([]),
        error,
      })
    }
  })

  return Object.freeze({ plan, channels: Object.freeze(channels) })
}
