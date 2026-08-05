const transientFailurePatterns = Object.freeze([
  /\b(?:EAI_AGAIN|ECONNRESET|ETIMEDOUT)\b/iu,
  /\bTimeoutError\b|operation was aborted due to timeout/iu,
  /connection reset by peer/iu,
  /network is unreachable/iu,
  /no route to host/iu,
  /temporary failure in name resolution/iu,
  /TLS handshake timeout/iu,
  /unexpected EOF/iu,
  /RWLayer of container .* unexpectedly nil/iu,
])

export function isTransientActFailure(error) {
  return transientFailurePatterns.some((pattern) => pattern.test(error?.output || ''))
}
