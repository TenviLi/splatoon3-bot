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
  const characters = Array.from(String(value))
  if (characters.length <= maximumLength) {
    return characters.join('')
  }

  return `${characters.slice(0, maximumLength - 1).join('')}…`
}

export function notificationPlainText(notification) {
  return [
    notification.title,
    notification.subtitle,
    ...notification.sections.flatMap((section) => [section.title, section.text, ...section.listItems]),
    ...notification.facts.map((fact) => `${fact.label} ${fact.value}`),
    notification.action.url,
  ]
    .filter(Boolean)
    .join('\n')
}
