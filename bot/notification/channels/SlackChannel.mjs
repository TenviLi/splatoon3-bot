import { z } from 'zod'
import { jsonRequest, requireTextSuccess } from '../HttpTransport.mjs'
import { compactText, notificationPlainText } from '../format.mjs'

const allowedWebhookHosts = new Set(['hooks.slack.com', 'hooks.slack-gov.com'])
const maximumMrkdwnTextLength = 3_000

export const slackTargetSchema = z.object({
  name: z.string().min(1),
  webhookUrl: z.url().superRefine((value, context) => {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      !allowedWebhookHosts.has(url.hostname) ||
      url.port ||
      !/^\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(url.pathname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Slack webhookUrl must be an official HTTPS Incoming Webhook URL',
      })
    }
  }),
}).strict()

function escapeMrkdwnCharacter(character) {
  return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character] || character
}

function mrkdwnText(value, maximumLength) {
  const characters = Array.from(String(value))
  let result = ''
  let resultLength = 0

  for (const [index, character] of characters.entries()) {
    const escapedCharacter = escapeMrkdwnCharacter(character)
    const escapedLength = Array.from(escapedCharacter).length
    const ellipsisLength = index < characters.length - 1 ? 1 : 0
    if (resultLength + escapedLength + ellipsisLength > maximumLength) {
      return `${result}…`
    }
    result += escapedCharacter
    resultLength += escapedLength
  }

  return result
}

function mrkdwnLinkUrl(value) {
  return new URL(value).toString().replaceAll('|', '%7C').replaceAll('<', '%3C').replaceAll('>', '%3E')
}

function sectionText(section) {
  const rawText = [
    `*${compactText(section.title, 200)}*`,
    section.text ? compactText(section.text, 1200) : null,
    ...section.listItems.slice(0, 8).map((item) => `• ${compactText(item, 200)}`),
  ].filter(Boolean).join('\n')
  return mrkdwnText(rawText, maximumMrkdwnTextLength)
}

function actionText(action) {
  const url = mrkdwnLinkUrl(action.url)
  const prefix = `*<${url}|`
  const suffix = ' ↗>*'
  const labelBudget = maximumMrkdwnTextLength - Array.from(`${prefix}${suffix}`).length
  if (labelBudget < 1) {
    throw new Error(`Slack action URL exceeds the ${maximumMrkdwnTextLength} character mrkdwn limit`)
  }

  return `${prefix}${mrkdwnText(action.label, Math.min(200, labelBudget))}${suffix}`
}

function createBlocks(notification) {
  const contextText = mrkdwnText(
    [
      `*${compactText(notification.source.name, 200)}*`,
      notification.subtitle ? compactText(notification.subtitle, 300) : null,
    ].filter(Boolean).join('  ·  '),
    maximumMrkdwnTextLength
  )
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: compactText(notification.title, 150), emoji: true },
    },
    {
      type: 'context',
      elements: [
        { type: 'image', image_url: notification.source.iconUrl, alt_text: compactText(notification.source.name, 200) },
        { type: 'mrkdwn', text: contextText, verbatim: true },
      ],
    },
    {
      type: 'image',
      image_url: notification.image.url,
      alt_text: compactText(notification.image.alt, 2000),
      title: { type: 'plain_text', text: compactText(notification.image.alt, 2000), emoji: true },
    },
  ]

  if (notification.sections.length > 0 || notification.facts.length > 0) {
    blocks.push({ type: 'divider' })
  }
  blocks.push(
    ...notification.sections.slice(0, 8).map((section) => ({
      type: 'section',
      text: { type: 'mrkdwn', text: sectionText(section), verbatim: true },
    }))
  )
  if (notification.facts.length > 0) {
    blocks.push({
      type: 'section',
      fields: notification.facts.slice(0, 10).map((fact) => ({
        type: 'mrkdwn',
        text: mrkdwnText(`*${compactText(fact.label, 100)}*\n${compactText(fact.value, 500)}`, 2_000),
        verbatim: true,
      })),
    })
  }
  blocks.push(
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: actionText(notification.action),
        verbatim: true,
      },
    }
  )

  return blocks
}

export async function deliverSlack(notification, target, options = {}) {
  const messageBudget = options.capabilities?.messageBudget || {}
  const payload = {
    text: mrkdwnText(notificationPlainText(notification), messageBudget.fallbackCharacters || 4_000),
    blocks: createBlocks(notification).slice(0, messageBudget.blocks || 50),
    unfurl_links: false,
    unfurl_media: false,
  }

  const result = await jsonRequest(
    {
      url: target.webhookUrl,
      fetchImpl: options.fetchImpl,
      waitImpl: options.waitImpl,
      attempts: options.attempts,
      retryableStatuses: options.retryableStatuses,
      onAttempt: options.onAttempt,
      label: `Slack target ${target.name}`,
    },
    payload
  )

  return requireTextSuccess(result, (text) => text === 'ok', `Slack target ${target.name}`)
}

function createDigestBlocks(notifications, maximumBlocks = 50) {
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `🦑 Splatoon 3 · ${notifications.length}`, emoji: true },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: mrkdwnText(notifications.map(({ source }) => source.name).join('  ·  '), maximumMrkdwnTextLength),
          verbatim: true,
        },
      ],
    },
  ]

  for (const [index, notification] of notifications.entries()) {
    if (index > 0) {
      blocks.push({ type: 'divider' })
    }
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          actionText({ label: notification.title, url: notification.action.url }),
          notification.subtitle ? mrkdwnText(notification.subtitle, 300) : null,
          notification.sections[0]?.text
            ? mrkdwnText(notification.sections[0].text, 800)
            : null,
        ].filter(Boolean).join('\n'),
        verbatim: true,
      },
      accessory: {
        type: 'image',
        image_url: notification.image.url,
        alt_text: compactText(notification.image.alt, 2_000),
      },
    })
  }

  return blocks.slice(0, maximumBlocks)
}

export async function deliverSlackDigest(notifications, target, options = {}) {
  const messageBudget = options.capabilities?.messageBudget || {}
  const payload = {
    text: mrkdwnText(
      notifications.map((notification) => notificationPlainText(notification)).join('\n\n'),
      messageBudget.fallbackCharacters || 4_000
    ),
    blocks: createDigestBlocks(notifications, messageBudget.blocks || 50),
    unfurl_links: false,
    unfurl_media: false,
  }
  const result = await jsonRequest(
    {
      url: target.webhookUrl,
      fetchImpl: options.fetchImpl,
      waitImpl: options.waitImpl,
      attempts: options.attempts,
      retryableStatuses: options.retryableStatuses,
      onAttempt: options.onAttempt,
      label: `Slack digest target ${target.name}`,
    },
    payload
  )

  return requireTextSuccess(result, (text) => text === 'ok', `Slack digest target ${target.name}`)
}
