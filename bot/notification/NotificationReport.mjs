export function formatNotificationStepSummary({ report, failed = false } = {}) {
  const lines = ['## Notification Delivery']

  if (!report) {
    lines.push(
      failed
        ? '- failed before Channel delivery; inspect the step log'
        : '- No notification delivery report was produced'
    )
    return `${lines.join('\n')}\n`
  }

  if (report.channelResults.length === 0) {
    lines.push('- No configured notification channels; delivery skipped')
    return `${lines.join('\n')}\n`
  }

  if (report.sharedError) {
    lines.push('- shared preparation failed; inspect the step log')
  }

  for (const channelResult of report.channelResults) {
    if (channelResult.status === 'skipped') {
      lines.push(`- ${channelResult.channelName}: skipped; no Target selects this Run Profile`)
      continue
    }

    if (channelResult.status === 'blocked') {
      lines.push(`- ${channelResult.channelName}: blocked before delivery`)
      continue
    }

    const delivered = channelResult.results.filter(({ status }) => status === 'fulfilled').length
    const failedDeliveries = channelResult.results.filter(({ status }) => status === 'rejected').length
    if (channelResult.status === 'rejected' && channelResult.results.length === 0) {
      lines.push(`- ${channelResult.channelName}: rejected before delivery; inspect the step log`)
      continue
    }

    lines.push(
      `- ${channelResult.channelName}: ${channelResult.status} (${delivered} delivered, ${failedDeliveries} failed)`
    )
  }

  return `${lines.join('\n')}\n`
}
