import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { PNG } from 'pngjs'
import { inspectRemoteImage } from '../bot/notification/RemoteImageInspector.mjs'

function pngImage(width, height) {
  return PNG.sync.write(new PNG({ width, height }))
}

test('inspects real PNG bytes and dimensions through the public URL', async () => {
  let requestOptions
  const image = pngImage(1024, 576)
  const metadata = await inspectRemoteImage('https://cdn.example.com/screenshot.png', {
    fetchImpl: async (_url, options) => {
      requestOptions = options
      return new Response(image, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    },
  })

  assert.equal(requestOptions.method, 'GET')
  assert.deepEqual(metadata, { format: 'png', width: 1024, height: 576, bytes: image.byteLength })
})

test('inspects JPEG dimensions used by supported WhatsApp templates', async () => {
  const image = await fs.readFile(path.join(process.cwd(), 'src', 'assets', 'img', 'information-bg.jpg'))
  const metadata = await inspectRemoteImage('https://cdn.example.com/screenshot.jpg', {
    fetchImpl: async () =>
      new Response(image, { status: 200, headers: { 'content-type': 'image/jpeg; charset=binary' } }),
  })

  assert.deepEqual(metadata, { format: 'jpeg', width: 754, height: 754, bytes: image.byteLength })
})

test('rejects declared oversized and unsupported remote images', async () => {
  await assert.rejects(
    inspectRemoteImage('https://cdn.example.com/oversized.png', {
      fetchImpl: async () =>
        new Response(pngImage(1024, 576), {
          status: 200,
          headers: {
            'content-length': String(10 * 1024 * 1024 + 1),
            'content-type': 'image/png',
          },
        }),
    }),
    /exceeding the 10485760 byte limit/
  )

  await assert.rejects(
    inspectRemoteImage('https://cdn.example.com/not-an-image', {
      fetchImpl: async () =>
        new Response('not an image', { status: 200, headers: { 'content-type': 'image/png' } }),
    }),
    /not a supported PNG or JPEG/
  )

  const truncatedPng = pngImage(32, 18).subarray(0, 32)
  await assert.rejects(
    inspectRemoteImage('https://cdn.example.com/truncated.png', {
      fetchImpl: async () =>
        new Response(truncatedPng, { status: 200, headers: { 'content-type': 'image/png' } }),
    }),
    /not a supported PNG or JPEG/
  )
})

test('enforces caller byte budgets and the advertised media type', async () => {
  const image = pngImage(1024, 576)

  await assert.rejects(
    inspectRemoteImage('https://cdn.example.com/too-large-for-caller.png', {
      maximumBytes: image.byteLength - 1,
      fetchImpl: async () =>
        new Response(image, {
          status: 200,
          headers: { 'content-length': String(image.byteLength), 'content-type': 'image/png' },
        }),
    }),
    new RegExp(`exceeding the ${image.byteLength - 1} byte limit`)
  )

  await assert.rejects(
    inspectRemoteImage('https://cdn.example.com/mismatched.png', {
      fetchImpl: async () =>
        new Response(image, { status: 200, headers: { 'content-type': 'image/jpeg' } }),
    }),
    /Content-Type does not match its PNG bytes/
  )

  await assert.rejects(
    inspectRemoteImage('https://cdn.example.com/missing-content-type.png', {
      fetchImpl: async () => new Response(image, { status: 200 }),
    }),
    /unsupported Content-Type: missing/
  )
})

test('rejects PNG data with a corrupt chunk checksum', async () => {
  const image = Buffer.from(pngImage(32, 18))
  const imageDataChunk = image.indexOf(Buffer.from('IDAT'))
  assert.notEqual(imageDataChunk, -1)
  image[imageDataChunk + 4] ^= 0xff

  await assert.rejects(
    inspectRemoteImage('https://cdn.example.com/corrupt.png', {
      fetchImpl: async () =>
        new Response(image, { status: 200, headers: { 'content-type': 'image/png' } }),
    }),
    /not a supported PNG or JPEG/
  )
})
