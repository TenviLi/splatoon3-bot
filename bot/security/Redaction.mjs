const publicTargetFields = new Set([
  'alerts',
  'avatarUrl',
  'disableNotification',
  'languageCode',
  'mode',
  'name',
  'notificationDisabled',
  'screenshotIds',
  'targetType',
  'templateName',
  'username',
])

function collectSensitiveStrings(value, key, output) {
  if (publicTargetFields.has(key)) return
  if (typeof value === 'string') {
    if (value.length >= 4) output.add(value)
    return
  }
  if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'bigint') {
    const normalized = String(value)
    output.add(normalized)
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectSensitiveStrings(entry, key, output)
    return
  }
  if (value && typeof value === 'object') {
    for (const [entryKey, entry] of Object.entries(value)) {
      collectSensitiveStrings(entry, entryKey, output)
    }
  }
}

function redactExactValues(text, sensitiveValues) {
  const values = new Set()
  collectSensitiveStrings(sensitiveValues, undefined, values)
  return [...values]
    .sort((left, right) => right.length - left.length)
    .reduce((result, value) => {
      if (/^-?\d+$/u.test(value) && value.length < 4) {
        return result.replace(
          new RegExp(`(?<!\\d)${value.replace('-', '\\-')}(?!\\d)`, 'gu'),
          '[redacted target]'
        )
      }
      return result.replaceAll(value, '[redacted target]')
    }, text)
}

export function redactSensitiveText(value, sensitiveValues) {
  const credentialName = '(?:access[-_ ]?token|bot[-_ ]?token|channel[-_ ]?access[-_ ]?token|session[-_ ]?token|client[-_ ]?secret|secret[-_ ]?access[-_ ]?key|access[-_ ]?key(?:[-_ ]?id)?|password|webhook(?:[-_ ]?url)?|secret)'
  const credentialAssignment = new RegExp(
    `["']?${credentialName}["']?\\s*[:=]\\s*(?:"[^"]*"|'[^']*'|[^\\s,;}]+)`,
    'giu'
  )
  const structurallyRedacted = String(value)
    .replace(/(https?:\/\/[^\s?#]+)\?[^\s]+/giu, '$1?[redacted]')
    .replace(/\bBearer\s+\S+/giu, 'Bearer [redacted]')
    .replace(credentialAssignment, '[redacted credential]')

  return redactExactValues(structurallyRedacted, sensitiveValues)
    .replace(/\s+/gu, ' ')
    .trim()
}

export function redactSensitiveError(error, sensitiveValues) {
  const redacted = new Error(redactSensitiveText(error?.message || error, sensitiveValues))
  redacted.name = error?.name || 'Error'
  for (const property of ['action', 'deliveryOutcome', 'retryable', 'status']) {
    if (error?.[property] !== undefined) {
      redacted[property] = error[property]
    }
  }
  return redacted
}
