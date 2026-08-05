import crypto from 'node:crypto'
import { z } from 'zod'
import { jsonRequest, requireJsonSuccess } from '../HttpTransport.mjs'
import { compactText, escapeMarkdown } from '../format.mjs'

export const dingTalkTargetSchema = z.object({
  name: z.string().min(1),
  webhookUrl: z.url(),
  secret: z.string().min(1).optional(),
}).strict()

const maximumMarkdownLength = 12_000

function markdownText(value, maximumLength) {
  return escapeMarkdown(compactText(value, maximumLength))
}

function signedWebhookUrl(target) {
  const url = new URL(target.webhookUrl)
  if (!target.secret) {
    return url
  }

  const timestamp = Date.now()
  const stringToSign = `${timestamp}\n${target.secret}`
  const sign = crypto.createHmac('sha256', target.secret).update(stringToSign).digest('base64')
  url.searchParams.set('timestamp', String(timestamp))
  url.searchParams.set('sign', sign)
  return url
}

function fitMarkdownBlocks(blocks, actionLabel) {
  const includedBlocks = []
  const overflowNotice = `> … ${markdownText(actionLabel, 120)} ↗`

  for (const block of blocks) {
    const candidate = [...includedBlocks, block].join('\n\n')
    if (candidate.length <= maximumMarkdownLength) {
      includedBlocks.push(block)
      continue
    }

    const withOverflowNotice = [...includedBlocks, overflowNotice].join('\n\n')
    if (withOverflowNotice.length <= maximumMarkdownLength) {
      includedBlocks.push(overflowNotice)
    }
    break
  }

  return includedBlocks.join('\n\n')
}

function createMarkdown(notification) {
  const blocks = [
    `### ${markdownText(notification.title, 200)}`,
    [
      notification.subtitle ? markdownText(notification.subtitle, 300) : null,
      `🦑 ${markdownText(notification.source.name, 160)}`,
    ]
      .filter(Boolean)
      .map((line) => `> ${line}`)
      .join('\n'),
    `![${markdownText(notification.image.alt, 180)}](${notification.image.url})`,
    ...notification.sections.slice(0, 8).map((section) =>
      [
        `#### ${markdownText(section.title, 120)}`,
        section.text ? markdownText(section.text, 600) : null,
        ...section.listItems.slice(0, 8).map((item) => `- ${markdownText(item, 120)}`),
      ]
        .filter(Boolean)
        .join('\n')
    ),
    ...notification.facts
      .slice(0, 12)
      .map((fact) => `- **${markdownText(fact.label, 80)}** ${markdownText(fact.value, 240)}`),
  ].filter(Boolean)

  return fitMarkdownBlocks(blocks, notification.action.label)
}

export async function deliverDingTalk(notification, target, options = {}) {
  const payload = {
    msgtype: 'actionCard',
    actionCard: {
      title: compactText(notification.title, 200),
      text: createMarkdown(notification),
      hideAvatar: '0',
      btnOrientation: '0',
      singleTitle: compactText(`🖼️ ${notification.action.label}`, 80),
      singleURL: notification.action.url,
    },
  }
  const result = await jsonRequest(
    {
      url: signedWebhookUrl(target),
      fetchImpl: options.fetchImpl,
      attempts: options.attempts,
      retryableStatuses: options.retryableStatuses,
      onAttempt: options.onAttempt,
      label: `DingTalk target ${target.name}`,
    },
    payload
  )

  return requireJsonSuccess(result, (body) => body.errcode === 0, `DingTalk target ${target.name}`)
}

export async function deliverDingTalkDigest(notifications, target, options = {}) {
  const maximumItems = options.capabilities?.messageBudget.feedItemsPerMessage || 10
  if (notifications.length > maximumItems) {
    throw new Error(`DingTalk Digest delivery exceeds the ${maximumItems}-item FeedCard limit`)
  }
  const payload = {
    msgtype: 'feedCard',
    feedCard: {
      links: notifications.map((notification) => ({
        title: compactText(
          [notification.source.name, notification.title, notification.subtitle].filter(Boolean).join(' · '),
          200
        ),
        messageURL: notification.action.url,
        picURL: notification.image.url,
      })),
    },
  }
  const result = await jsonRequest(
    {
      url: signedWebhookUrl(target),
      fetchImpl: options.fetchImpl,
      attempts: options.attempts,
      retryableStatuses: options.retryableStatuses,
      onAttempt: options.onAttempt,
      label: `DingTalk digest target ${target.name}`,
    },
    payload
  )
  return requireJsonSuccess(result, (body) => body.errcode === 0, `DingTalk digest target ${target.name}`)
}
