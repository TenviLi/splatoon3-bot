import { z } from 'zod'
import { jsonRequest } from '../HttpTransport.mjs'
import { escapeMarkdown } from '../format.mjs'

export const qqTargetSchema = z.object({
  name: z.string().min(1),
  appId: z.string().min(1),
  clientSecret: z.string().min(1),
  targetType: z.enum(['channel', 'group', 'user']),
  targetId: z.string().min(1),
  apiBaseUrl: z.url().optional(),
  tokenUrl: z.url().optional(),
}).strict()

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
    `# ${escapeMarkdown(notification.title)}`,
    notification.subtitle ? escapeMarkdown(notification.subtitle) : null,
    `![${escapeMarkdown(notification.image.alt)} #675px #1200px](${notification.image.url})`,
    ...notification.sections.map(
      (section) => `## ${escapeMarkdown(section.title)}${section.text ? `\n${escapeMarkdown(section.text)}` : ''}`
    ),
    ...notification.facts.map((fact) => `- **${escapeMarkdown(fact.label)}** ${escapeMarkdown(fact.value)}`),
    `[${escapeMarkdown(notification.action.label)}](${notification.action.url})`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function createEndpoint(target) {
  const baseUrl = (target.apiBaseUrl || 'https://api.sgroup.qq.com').replace(/\/$/, '')
  switch (target.targetType) {
    case 'channel':
      return `${baseUrl}/channels/${encodeURIComponent(target.targetId)}/messages`
    case 'group':
      return `${baseUrl}/v2/groups/${encodeURIComponent(target.targetId)}/messages`
    case 'user':
      return `${baseUrl}/v2/users/${encodeURIComponent(target.targetId)}/messages`
  }
}

export async function deliverQQ(notification, target, options = {}) {
  const token = await getAccessToken(target, options)
  const markdown = { content: createMarkdown(notification) }
  const payload = target.targetType === 'channel' ? { markdown } : { msg_type: 2, markdown }

  return jsonRequest(
    {
      url: createEndpoint(target),
      headers: {
        Authorization: `QQBot ${token}`,
        'X-Union-Appid': target.appId,
      },
      fetchImpl: options.fetchImpl,
      label: `QQ target ${target.name}`,
    },
    payload
  )
}
