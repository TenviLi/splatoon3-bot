import { z } from 'zod'

const textBlockSchema = z.object({
  title: z.string().min(1),
  text: z.string().optional(),
  listItems: z.array(z.string().min(1)).default([]),
})
const factSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
})

export const notificationSchema = z.object({
  id: z.string().min(1),
  source: z.object({
    name: z.string().min(1),
    iconUrl: z.url(),
  }),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  image: z.object({
    url: z.url(),
    alt: z.string().min(1),
    aspectRatio: z.number().positive(),
  }),
  sections: z.array(textBlockSchema).default([]),
  facts: z.array(factSchema).default([]),
  action: z.object({
    label: z.string().min(1),
    url: z.url(),
  }),
  accentColor: z.number().int().min(0).max(0xffffff).default(0xff5a36),
})

export function createNotification(value) {
  return Object.freeze(notificationSchema.parse(value))
}
