import crypto from 'node:crypto'
import { z } from 'zod'
import { jsonRequest } from '../HttpTransport.mjs'
import { compactText, escapeMarkdown } from '../format.mjs'

export const qqTargetSchema = z.object({
  name: z.string().min(1),
  appId: z.string().min(1),
  clientSecret: z.string().min(1),
  targetType: z.enum(['group', 'user']),
  targetId: z.string().min(1),
}).strict()

const tokenCache = new Map()

async function getAccessToken(target, options) {
  const tokenUrl = new URL(options.tokenUrl || 'https://bots.qq.com/app/getAppAccessToken').toString()
  const cacheKey = crypto
    .createHash('sha256')
    .update(JSON.stringify([tokenUrl, target.appId, target.clientSecret]))
    .digest('hex')
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token
  }

  const result = await jsonRequest(
    {
      url: tokenUrl,
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
    `![${escapeMarkdown(compactText(notification.image.alt, 180))} #${notification.image.width}px #${notification.image.height}px](${notification.image.url})`,
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

const targetStrategies = Object.freeze({
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
  const baseUrl = (options.apiBaseUrl || 'https://api.sgroup.qq.com').replace(/\/$/, '')

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
    strategy.createPayload(notification)
  )
}
