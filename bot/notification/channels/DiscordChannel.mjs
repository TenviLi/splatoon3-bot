import { z } from 'zod'
import { jsonRequest } from '../HttpTransport.mjs'
import { compactText } from '../format.mjs'

export const discordTargetSchema = z.object({
  name: z.string().min(1),
  webhookUrl: z.url(),
  username: z.string().min(1).optional(),
  avatarUrl: z.url().optional(),
}).strict()

function sectionValue(section) {
  return [section.text, ...section.listItems.map((item) => `• ${item}`)].filter(Boolean).join('\n') || '—'
}

function createEmbed(notification) {
  const title = compactText(notification.title, 256)
  const description = notification.subtitle ? compactText(notification.subtitle, 1024) : undefined
  const sourceName = compactText(notification.source.name, 256)
  const footerText = `🦑 ${sourceName}`
  let remainingLength =
    6000 - title.length - (description?.length || 0) - sourceName.length - footerText.length
  const fields = []
  const candidates = [
    ...notification.sections.map((section) => ({ name: section.title, value: sectionValue(section), inline: false })),
    ...notification.facts.map((fact) => ({ name: fact.label, value: fact.value, inline: true })),
  ]

  for (const candidate of candidates.slice(0, 25)) {
    const name = compactText(candidate.name, Math.min(256, Math.max(1, remainingLength - 1)))
    remainingLength -= name.length
    if (remainingLength <= 0) {
      break
    }

    const value = compactText(candidate.value || '—', Math.min(1024, remainingLength))
    fields.push({ name, value, inline: candidate.inline })
    remainingLength -= value.length
    if (remainingLength <= 0) {
      break
    }
  }

  return {
    author: { name: sourceName, icon_url: notification.source.iconUrl },
    title,
    ...(description ? { description } : {}),
    url: notification.action.url,
    color: notification.accentColor,
    thumbnail: { url: notification.source.iconUrl },
    image: { url: notification.image.url },
    fields,
    footer: { text: footerText },
  }
}

export async function deliverDiscord(notification, target, options = {}) {
  const url = new URL(target.webhookUrl)
  url.searchParams.set('wait', 'true')
  const payload = {
    ...(target.username ? { username: target.username } : {}),
    ...(target.avatarUrl ? { avatar_url: target.avatarUrl } : {}),
    allowed_mentions: { parse: [] },
    embeds: [createEmbed(notification)],
  }

  return jsonRequest({ url, fetchImpl: options.fetchImpl, label: `Discord target ${target.name}` }, payload)
}
