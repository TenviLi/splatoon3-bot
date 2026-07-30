import { z } from 'zod'
import { jsonRequest } from '../HttpTransport.mjs'
import { compactText, escapeMarkdown } from '../format.mjs'

export const qqTargetSchema = z.object({
  name: z.string().min(1),
  appId: z.string().min(1),
  clientSecret: z.string().min(1),
  targetType: z.enum(['channel', 'group', 'user']),
  targetId: z.string().min(1),
  messageFormat: z.enum(['markdown', 'embed']).optional(),
  apiBaseUrl: z.url().optional(),
  tokenUrl: z.url().optional(),
}).strict().superRefine((target, context) => {
  if (target.targetType !== 'channel' && target.messageFormat !== undefined) {
    context.addIssue({
      code: 'custom',
      path: ['messageFormat'],
      message: 'QQ messageFormat is only available for channel targets',
    })
  }
})

const tokenCache = new Map()

async function getAccessToken(target, options) {
  const cacheKey = `${target.appId}:${target.clientSecret}`
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token
  }

  const result = await jsonRequest(
    {
      url: target.tokenUrl || 'https://bots.qq.com/app/getAppAccessToken',
      fetchImpl: options.fetchImpl,
      label: `QQ token for ${target.name}`,
      attempts: 2,
    },
    { appId: target.appId, clientSecret: target.clientSecret }
  )
  const token = result.json?.access_token
  const expiresIn = Number(result.json?.expires_in)
  if (!token || !Number.isFinite(expiresIn)) {
    throw new Error(`QQ token for ${target.name} returned an invalid response: ${result.text.slice(0, 500)}`)
  }

  tokenCache.set(cacheKey, { token, expiresAt: Date.now() + expiresIn * 1000 })
  return token
}

function createMarkdown(notification) {
  return [
    `# ${escapeMarkdown(compactText(notification.title, 200))}`,
    notification.subtitle ? escapeMarkdown(compactText(notification.subtitle, 300)) : null,
    `![${escapeMarkdown(compactText(notification.image.alt, 180))} #1200px #675px](${notification.image.url})`,
    ...notification.sections.slice(0, 8).map(
      (section) =>
        [
          `## ${escapeMarkdown(compactText(section.title, 120))}`,
          section.text ? escapeMarkdown(compactText(section.text, 600)) : null,
          ...section.listItems
            .slice(0, 8)
            .map((item) => `- ${escapeMarkdown(compactText(item, 120))}`),
        ]
          .filter(Boolean)
          .join('\n')
    ),
    ...notification.facts
      .slice(0, 12)
      .map(
        (fact) =>
          `- **${escapeMarkdown(compactText(fact.label, 80))}** ${escapeMarkdown(compactText(fact.value, 240))}`
      ),
    `[${escapeMarkdown(compactText(notification.action.label, 80))}](${notification.action.url})`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function createChannelEmbed(notification) {
  const fields = [
    ...notification.sections.map((section) => ({
      name: compactText(
        [section.title, section.text, ...section.listItems.map((item) => `• ${item}`)]
          .filter(Boolean)
          .join('\n'),
        200
      ),
    })),
    ...notification.facts.map((fact) => ({
      name: compactText(`${fact.label}\n${fact.value}`, 200),
    })),
  ].slice(0, 3)

  return {
    content: `${compactText(notification.action.label, 80)}: ${notification.action.url}`,
    embed: {
      title: compactText(notification.title, 32),
      prompt: compactText(
        [notification.subtitle, notification.source.name].filter(Boolean).join(' · '),
        100
      ),
      thumbnail: { url: notification.image.url },
      fields,
    },
  }
}

const targetStrategies = Object.freeze({
  channel: Object.freeze({
    endpointPath: (targetId) => `/channels/${encodeURIComponent(targetId)}/messages`,
    createPayload: (notification, target) =>
      target.messageFormat === 'markdown'
        ? { markdown: { content: createMarkdown(notification) } }
        : createChannelEmbed(notification),
  }),
  group: Object.freeze({
    endpointPath: (targetId) => `/v2/groups/${encodeURIComponent(targetId)}/messages`,
    createPayload: (notification) => ({ msg_type: 2, markdown: { content: createMarkdown(notification) } }),
  }),
  user: Object.freeze({
    endpointPath: (targetId) => `/v2/users/${encodeURIComponent(targetId)}/messages`,
    createPayload: (notification) => ({ msg_type: 2, markdown: { content: createMarkdown(notification) } }),
  }),
})

export async function deliverQQ(notification, target, options = {}) {
  const token = await getAccessToken(target, options)
  const strategy = targetStrategies[target.targetType]
  const baseUrl = (target.apiBaseUrl || 'https://api.sgroup.qq.com').replace(/\/$/, '')

  return jsonRequest(
    {
      url: `${baseUrl}${strategy.endpointPath(target.targetId)}`,
      headers: {
        Authorization: `QQBot ${token}`,
        'X-Union-Appid': target.appId,
      },
      fetchImpl: options.fetchImpl,
      label: `QQ target ${target.name}`,
    },
    strategy.createPayload(notification, target)
  )
}
