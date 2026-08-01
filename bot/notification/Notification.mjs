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
const imageVariantSchema = z.object({
  url: z.url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  aspectRatio: z.number().positive(),
})

export const notificationSchema = z.object({
  id: z.string().min(1),
  source: z.object({
    name: z.string().min(1),
    iconUrl: z.url(),
  }),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  image: imageVariantSchema.extend({
    alt: z.string().min(1),
    compact: imageVariantSchema,
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
