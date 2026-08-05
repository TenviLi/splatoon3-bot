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

function createEmbed(notification, messageBudget = {}) {
  const characterBudget = messageBudget.embedCharacters || 6000
  const sourceName = compactText(notification.source.name, Math.min(256, Math.max(1, Math.floor(characterBudget / 4))))
  const footerText = `🦑 ${sourceName}`
  let remainingLength = Math.max(1, characterBudget - sourceName.length - footerText.length)
  const title = compactText(notification.title, Math.min(256, remainingLength))
  remainingLength -= title.length
  const description = notification.subtitle && remainingLength > 0
    ? compactText(notification.subtitle, Math.min(1024, remainingLength))
    : undefined
  remainingLength -= description?.length || 0
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
    embeds: [createEmbed(notification, options.capabilities?.messageBudget)],
  }

  return jsonRequest({
    url,
    fetchImpl: options.fetchImpl,
    attempts: options.attempts,
    retryableStatuses: options.retryableStatuses,
    onAttempt: options.onAttempt,
    label: `Discord target ${target.name}`,
  }, payload)
}

export async function deliverDiscordDigest(notifications, target, options = {}) {
  const maximumEmbeds = options.capabilities?.messageBudget.embedsPerMessage || 10
  if (notifications.length > maximumEmbeds) {
    throw new Error(`Discord Digest delivery exceeds the ${maximumEmbeds}-Embed message limit`)
  }
  const url = new URL(target.webhookUrl)
  url.searchParams.set('wait', 'true')
  const aggregateCharacterBudget = options.capabilities?.messageBudget.embedCharacters || 6000
  const perEmbedCharacterBudget = Math.floor(aggregateCharacterBudget / notifications.length)
  return jsonRequest(
    {
      url,
      fetchImpl: options.fetchImpl,
      attempts: options.attempts,
      retryableStatuses: options.retryableStatuses,
      onAttempt: options.onAttempt,
      label: `Discord digest target ${target.name}`,
    },
    {
      ...(target.username ? { username: target.username } : {}),
      ...(target.avatarUrl ? { avatar_url: target.avatarUrl } : {}),
      allowed_mentions: { parse: [] },
      embeds: notifications.map((notification) =>
        createEmbed(notification, {
          ...options.capabilities?.messageBudget,
          embedCharacters: perEmbedCharacterBudget,
        })
      ),
    }
  )
}
