function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

async function readResponseBody(response) {
  const text = await response.text()
  if (!text) {
    return { text: '', json: null }
  }

  try {
    return { text, json: JSON.parse(text) }
  } catch {
    return { text, json: null }
  }
}

export async function request({
  url,
  method = 'POST',
  headers = {},
  body,
  fetchImpl = fetch,
  timeoutMs = 15_000,
  attempts = 2,
  retryableStatuses = [429],
  label = 'notification request',
  isRetryableResponse,
  onAttempt,
  waitImpl = wait,
  networkFailureOutcome = 'uncertain',
}) {
  if (!['rejected', 'uncertain'].includes(networkFailureOutcome)) {
    throw new Error(`Unknown network failure outcome: ${networkFailureOutcome}`)
  }
  const retryableStatusSet = new Set(retryableStatuses)
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      onAttempt?.(attempt)
      const response = await fetchImpl(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })
      const responseBody = await readResponseBody(response)

      if (response.ok) {
        return {
          status: response.status,
          headers: response.headers,
          ...responseBody,
        }
      }

      const error = new Error(`${label} failed with HTTP ${response.status}: ${responseBody.text.slice(0, 500)}`)
      error.deliveryOutcome = 'rejected'
      const retryable =
        retryableStatusSet.has(response.status) || Boolean(isRetryableResponse?.(response, responseBody))
      if (!retryable || attempt === attempts) {
        error.retryable = false
        error.responseHeaders = response.headers
        error.responseBody = responseBody
        error.status = response.status
        throw error
      }

      const retryAfterHeader = response.headers.get('retry-after')
      const retryAfter = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader)
      await waitImpl(Number.isFinite(retryAfter) ? retryAfter * 1000 : 500 * attempt)
    } catch (error) {
      if (error.deliveryOutcome !== 'rejected') {
        error.deliveryOutcome = networkFailureOutcome
        if (networkFailureOutcome === 'uncertain') {
          throw error
        }
      }
      if (attempt === attempts || error.retryable === false) {
        throw error
      }

      await waitImpl(500 * attempt)
    }
  }

  throw new Error(`${label} failed`)
}

export function jsonRequest(options, value) {
  return request({
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: JSON.stringify(value),
  })
}

export function wrapRequestError(error, message) {
  const wrapped = new Error(message, { cause: error })
  for (const property of [
    'action',
    'deliveryOutcome',
    'retryable',
    'status',
    'responseHeaders',
    'responseBody',
    'requestAttempts',
  ]) {
    if (error?.[property] !== undefined) {
      wrapped[property] = error[property]
    }
  }
  return wrapped
}

export function requireJsonSuccess(result, predicate, label) {
  if (!result.json || !predicate(result.json)) {
    const error = new Error(`${label} rejected the notification: ${result.text.slice(0, 500)}`)
    error.deliveryOutcome = 'rejected'
    throw error
  }

  return result.json
}

export function requireTextSuccess(result, predicate, label) {
  if (!predicate(result.text)) {
    const error = new Error(`${label} rejected the notification: ${result.text.slice(0, 500)}`)
    error.deliveryOutcome = 'rejected'
    throw error
  }

  return result.text
}
