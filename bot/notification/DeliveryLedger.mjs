import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { redactSensitiveText } from '../security/Redaction.mjs'

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    )
  }
  return value
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

function targetFingerprint(target) {
  const {
    screenshotIds: _screenshotIds,
    mode: _mode,
    alerts: _alerts,
    name: _name,
    ...destination
  } = target
  return digest(destination)
}

export function createStableDeliveryId({ channel, target, mode, notifications, runKey, stateKey }) {
  if (!stateKey && !runKey) {
    throw new Error('Periodic Delivery IDs require a Bot Run identity')
  }
  return digest({
    version: 1,
    channel: channel.name,
    target: target.name,
    targetFingerprint: targetFingerprint(target),
    mode,
    ...(stateKey
      ? { deliveryKind: 'event', stateKey }
      : { deliveryKind: 'periodic', runKey, notifications }),
  })
}

export function createMemoryDeliveryLedgerStore(initialRecords = []) {
  const records = new Map(initialRecords.map((record) => [record.id, structuredClone(record)]))
  return Object.freeze({
    async read(deliveryId) {
      const record = records.get(deliveryId)
      return record ? structuredClone(record) : null
    },
    async write(record) {
      records.set(record.id, structuredClone(record))
      return structuredClone(record)
    },
    list() {
      return [...records.values()].map((record) => structuredClone(record))
    },
    async close() {},
  })
}

export function createFileDeliveryLedgerStore(
  directory = path.join(process.cwd(), '.bot-cache', 'delivery-ledger')
) {
  const absoluteDirectory = path.resolve(directory)
  const filename = (deliveryId) => {
    if (!/^[a-f0-9]{64}$/.test(deliveryId)) {
      throw new Error(`Invalid Stable Delivery ID: ${deliveryId}`)
    }
    return path.join(absoluteDirectory, `${deliveryId}.json`)
  }
  return Object.freeze({
    async read(deliveryId) {
      try {
        const record = JSON.parse(await fs.readFile(filename(deliveryId), 'utf8'))
        if (record.version !== 1 || record.id !== deliveryId) {
          throw new Error('record identity does not match its filename')
        }
        return record
      } catch (error) {
        if (error.code === 'ENOENT') {
          return null
        }
        throw new Error(`Failed to read Delivery Ledger record ${deliveryId}: ${error.message}`, { cause: error })
      }
    },
    async write(record) {
      const body = `${JSON.stringify(record, null, 2)}\n`
      const destination = filename(record.id)
      const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`
      try {
        await fs.mkdir(absoluteDirectory, { recursive: true })
        await fs.writeFile(temporary, body, { flag: 'wx' })
        await fs.rename(temporary, destination)
      } catch (error) {
        throw new Error(`Failed to write Delivery Ledger record ${record.id}: ${error.message}`, { cause: error })
      } finally {
        await fs.rm(temporary, { force: true })
      }
      return record
    },
    async close() {},
  })
}

export function createDeliveryLedgerRecord({
  deliveryId,
  channel,
  target,
  operation,
  previous,
  status,
  platformRequestId,
  error,
  now = new Date(),
  attemptIncrement = 1,
}) {
  if (!Number.isInteger(attemptIncrement) || attemptIncrement < 0) {
    throw new Error('Delivery Ledger attempt increment must be a non-negative integer')
  }
  return Object.freeze({
    version: 1,
    id: deliveryId,
    channel: channel.name,
    target: target.name,
    mode: operation.mode,
    requestedMode: operation.requestedMode,
    notificationIds: Object.freeze(operation.notifications.map(({ id }) => id)),
    status,
    attempts: (previous?.attempts || 0) + attemptIncrement,
    createdAt: previous?.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
    ...(platformRequestId ? { platformRequestId: String(platformRequestId) } : {}),
    ...(error
      ? {
          error: Object.freeze({
            message: redactSensitiveText(error.message, target),
            retryable: error.retryable !== false,
          }),
        }
      : {}),
  })
}
