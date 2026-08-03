import { z } from 'zod'
import { parseYamlEnvironment } from '../config/YamlEnvironment.mjs'
import { getScreenshotDefinition, resolveRunPlan } from '../run/RunPlan.mjs'
import { getChannelAdapter, resolveConfiguredNotificationChannels } from './channels/index.mjs'

const screenshotIdSelectionSchema = z
  .array(z.string().min(1))
  .min(1)
  .superRefine((screenshotIds, validationContext) => {
    const seenScreenshotIds = new Set()
    for (const [index, screenshotId] of screenshotIds.entries()) {
      if (seenScreenshotIds.has(screenshotId)) {
        validationContext.addIssue({
          code: 'custom',
          path: [index],
          message: `Duplicate Screenshot ID: ${screenshotId}`,
        })
      }
      seenScreenshotIds.add(screenshotId)

      try {
        getScreenshotDefinition(screenshotId)
      } catch {
        validationContext.addIssue({
          code: 'custom',
          path: [index],
          message: `Unknown Screenshot ID: ${screenshotId}`,
        })
      }
    }
  })

function targetConfigurationSchema(channel) {
  const targetSchema = channel.targetSchema.extend({
    screenshotIds: screenshotIdSelectionSchema.optional(),
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
  if (!target.screenshotIds) {
    return notificationIds
  }

  const selectedScreenshotIds = new Set(target.screenshotIds)
  return notificationIds.filter((notificationId) => selectedScreenshotIds.has(notificationId))
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

function requireSelectedChannelDeliveries(preparedChannel, plan) {
  if (preparedChannel.status === 'skipped') {
    throw new Error(
      `No ${preparedChannel.channelName} Notification Targets match the selected Screenshot IDs: ${plan.selection.join(', ')}`
    )
  }
  return preparedChannel
}

export function prepareNotificationChannelConfiguration({ selection, channelName, rawConfig }) {
  const plan = resolveRunPlan(selection)
  return requireSelectedChannelDeliveries(
    prepareChannel(plan, getChannelAdapter(channelName), rawConfig),
    plan
  )
}

export function prepareConfiguredNotificationChannels({
  selection,
  channelName,
  environment = process.env,
}) {
  const plan = resolveRunPlan(selection)
  const configuredChannels = resolveConfiguredNotificationChannels({ environment, channelName })
  const channels = configuredChannels.map(({ channel, rawConfig }) => {
    try {
      const preparedChannel = prepareChannel(plan, channel, rawConfig)
      return channelName
        ? requireSelectedChannelDeliveries(preparedChannel, plan)
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
