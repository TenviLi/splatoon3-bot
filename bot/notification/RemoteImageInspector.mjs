const defaultMaximumDownloadBytes = 10 * 1024 * 1024
const metadataCache = new Map()
const pngCrcTable = Object.freeze(
  Array.from({ length: 256 }, (_, value) => {
    let crc = value
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }
    return crc >>> 0
  })
)
const pngBitDepthsByColorType = Object.freeze({
  0: new Set([1, 2, 4, 8, 16]),
  2: new Set([8, 16]),
  3: new Set([1, 2, 4, 8]),
  4: new Set([8, 16]),
  6: new Set([8, 16]),
})

function advertisedImageFormat(response) {
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  const formats = {
    'image/jpeg': 'jpeg',
    'image/png': 'png',
  }
  const format = formats[mediaType]
  if (!format) {
    throw new Error(`Remote image has unsupported Content-Type: ${mediaType || 'missing'}`)
  }

  return format
}

function pngCrc32(buffer, start, end) {
  let crc = 0xffffffff
  for (let index = start; index < end; index += 1) {
    crc = pngCrcTable[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

async function readResponseBytes(response, maximumBytes) {
  const contentLengthHeader = response.headers.get('content-length')
  const contentLength = contentLengthHeader === null ? Number.NaN : Number(contentLengthHeader)
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new Error(`Remote image declares ${contentLength} bytes, exceeding the ${maximumBytes} byte limit`)
  }
  if (!response.body) {
    throw new Error('Remote image response has no body')
  }

  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      bytes += value.byteLength
      if (bytes > maximumBytes) {
        await reader.cancel()
        throw new Error(`Remote image exceeds the ${maximumBytes} byte download limit`)
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }

  return Buffer.concat(chunks, bytes)
}

function inspectPng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (buffer.byteLength < 45 || !buffer.subarray(0, signature.length).equals(signature)) {
    return null
  }

  let dimensions
  let hasImageData = false
  let offset = signature.length
  while (offset + 12 <= buffer.byteLength) {
    const chunkLength = buffer.readUInt32BE(offset)
    const chunkType = buffer.toString('ascii', offset + 4, offset + 8)
    const dataOffset = offset + 8
    const crcOffset = dataOffset + chunkLength
    const nextOffset = dataOffset + chunkLength + 4
    if (nextOffset > buffer.byteLength) {
      return null
    }
    const expectedCrc = buffer.readUInt32BE(crcOffset)
    const actualCrc = pngCrc32(buffer, offset + 4, crcOffset)
    if (actualCrc !== expectedCrc) {
      return null
    }
    if (offset === signature.length) {
      if (chunkType !== 'IHDR' || chunkLength !== 13) {
        return null
      }
      const bitDepth = buffer[dataOffset + 8]
      const colorType = buffer[dataOffset + 9]
      if (
        !pngBitDepthsByColorType[colorType]?.has(bitDepth) ||
        buffer[dataOffset + 10] !== 0 ||
        buffer[dataOffset + 11] !== 0 ||
        ![0, 1].includes(buffer[dataOffset + 12])
      ) {
        return null
      }
      dimensions = {
        width: buffer.readUInt32BE(dataOffset),
        height: buffer.readUInt32BE(dataOffset + 4),
      }
    } else if (chunkType === 'IHDR') {
      return null
    } else if (chunkType === 'IDAT') {
      hasImageData = hasImageData || chunkLength > 0
    } else if (chunkType === 'IEND') {
      if (chunkLength !== 0 || nextOffset !== buffer.byteLength || !dimensions || !hasImageData) {
        return null
      }
      return Object.freeze({ format: 'png', ...dimensions })
    }
    offset = nextOffset
  }

  return null
}

function inspectJpeg(buffer) {
  if (
    buffer.byteLength < 4 ||
    buffer[0] !== 0xff ||
    buffer[1] !== 0xd8 ||
    buffer.at(-2) !== 0xff ||
    buffer.at(-1) !== 0xd9
  ) {
    return null
  }

  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
  let dimensions
  let offset = 2
  while (offset + 4 <= buffer.byteLength) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }

    const marker = buffer[offset + 1]
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }

    const segmentLength = buffer.readUInt16BE(offset + 2)
    if (segmentLength < 2 || offset + segmentLength + 2 > buffer.byteLength) {
      break
    }
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      dimensions = {
        format: 'jpeg',
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
      }
    } else if (marker === 0xda) {
      const scanDataOffset = offset + segmentLength + 2
      if (!dimensions || scanDataOffset >= buffer.byteLength - 2) {
        return null
      }
      const scanData = buffer.subarray(scanDataOffset, -2)
      if (scanData.every((byte) => byte === 0x00 || byte === 0xff)) {
        return null
      }
      return Object.freeze(dimensions)
    }
    offset += segmentLength + 2
  }

  return null
}

async function inspectRemoteImageUncached(url, { fetchImpl, timeoutMs, maximumBytes }) {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'image/png, image/jpeg' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    throw new Error(`Remote image request failed with HTTP ${response.status}`)
  }

  const advertisedFormat = advertisedImageFormat(response)
  const buffer = await readResponseBytes(response, maximumBytes)
  const dimensions = inspectPng(buffer) || inspectJpeg(buffer)
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error('Remote image is not a supported PNG or JPEG')
  }
  if (dimensions.format !== advertisedFormat) {
    throw new Error(`Remote image Content-Type does not match its ${dimensions.format.toUpperCase()} bytes`)
  }

  return Object.freeze({ ...dimensions, bytes: buffer.byteLength })
}

export async function inspectRemoteImage(
  url,
  { fetchImpl = fetch, timeoutMs = 15_000, maximumBytes = defaultMaximumDownloadBytes } = {}
) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new Error('Remote image maximumBytes must be a positive safe integer')
  }

  const cacheKey = fetchImpl === fetch ? `${maximumBytes}:${String(url)}` : null
  if (cacheKey && metadataCache.has(cacheKey)) {
    return metadataCache.get(cacheKey)
  }

  const inspection = inspectRemoteImageUncached(url, { fetchImpl, timeoutMs, maximumBytes })
  if (cacheKey) {
    metadataCache.set(cacheKey, inspection)
    inspection.catch(() => metadataCache.delete(cacheKey))
  }
  return inspection
}
