import { z } from 'zod'
import { jsonRequest } from '../HttpTransport.mjs'
import { compactText } from '../format.mjs'

export const discordTargetSchema = z.object({
  name: z.string().min(1),
  webhookUrl: z.url(),
  username: z.string().min(1).optional(),
  avatarUrl: z.url().optional(),
}).strict()

export async function deliverDiscord(notification, target, options = {}) {
  const url = new URL(target.webhookUrl)
  url.searchParams.set('wait', 'true')
  const fields = [
    ...notification.sections.map((section) => ({
      name: compactText(section.title, 256),
      value: compactText(section.text || '—', 1024),
      inline: false,
    })),
    ...notification.facts.map((fact) => ({
      name: compactText(fact.label, 256),
      value: compactText(fact.value, 1024),
      inline: true,
    })),
  ].slice(0, 25)
  const payload = {
    ...(target.username ? { username: target.username } : {}),
    ...(target.avatarUrl ? { avatar_url: target.avatarUrl } : {}),
    embeds: [
      {
        author: { name: notification.source.name, icon_url: notification.source.iconUrl },
        title: compactText(notification.title, 256),
        ...(notification.subtitle ? { description: compactText(notification.subtitle, 4096) } : {}),
        url: notification.action.url,
        color: notification.accentColor,
        image: { url: notification.image.url },
        fields,
        footer: { text: notification.action.label },
      },
    ],
  }

  return jsonRequest({ url, fetchImpl: options.fetchImpl, label: `Discord target ${target.name}` }, payload)
}
