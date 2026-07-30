export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function escapeMarkdown(value) {
  return String(value).replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1')
}

export function compactText(value, maximumLength) {
  const text = String(value)
  if (text.length <= maximumLength) {
    return text
  }

  return `${text.slice(0, maximumLength - 1)}…`
}

export function notificationPlainText(notification) {
  return [
    notification.title,
    notification.subtitle,
    ...notification.sections.flatMap((section) => [section.title, section.text]),
    ...notification.facts.map((fact) => `${fact.label} ${fact.value}`),
    notification.action.url,
  ]
    .filter(Boolean)
    .join('\n')
}
