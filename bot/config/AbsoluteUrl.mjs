import { z } from 'zod'

const localHostnames = new Set(['localhost', '127.0.0.1', '[::1]', 'host.docker.internal'])

export function absoluteUrlSchema({ label, protocols = ['https:'], allowLocalHttp = false }) {
  const protocolLabel =
    protocols.includes('http:') && protocols.includes('https:')
      ? 'HTTP(S)'
      : protocols.map((protocol) => protocol.replace(/:$/, '').toUpperCase()).join('/')
  return z
    .string()
    .trim()
    .superRefine((value, context) => {
      let url
      try {
        url = new URL(value)
      } catch {
        context.addIssue({ code: 'custom', message: `${label} must be an absolute ${protocolLabel} URL` })
        return
      }

      if (!protocols.includes(url.protocol)) {
        context.addIssue({ code: 'custom', message: `${label} must be an absolute ${protocolLabel} URL` })
      }
      if (url.protocol === 'http:' && (!allowLocalHttp || !localHostnames.has(url.hostname))) {
        context.addIssue({ code: 'custom', message: `${label} must use HTTPS unless it is local` })
      }
      if (url.username || url.password || url.search || url.hash) {
        context.addIssue({
          code: 'custom',
          message: `${label} must not include credentials, a query, or a fragment`,
        })
      }
    })
}
