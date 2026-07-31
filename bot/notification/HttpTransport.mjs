const retryableStatuses = new Set([429, 502, 503, 504])

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
  label = 'notification request',
  isRetryableResponse,
  waitImpl = wait,
}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
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
      const retryable =
        retryableStatuses.has(response.status) || Boolean(isRetryableResponse?.(response, responseBody))
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

export function requireJsonSuccess(result, predicate, label) {
  if (!result.json || !predicate(result.json)) {
    throw new Error(`${label} rejected the notification: ${result.text.slice(0, 500)}`)
  }

  return result.json
}

export function requireTextSuccess(result, predicate, label) {
  if (!predicate(result.text)) {
    throw new Error(`${label} rejected the notification: ${result.text.slice(0, 500)}`)
  }

  return result.text
}
