import { parseDocument } from 'yaml'

export function parseYamlEnvironment(rawValue, { variableName, schema }) {
  if (!rawValue?.trim()) {
    throw new Error(`${variableName} is required`)
  }

  let document
  try {
    document = parseDocument(rawValue, {
      merge: false,
      prettyErrors: false,
      strict: true,
      uniqueKeys: true,
    })
  } catch (error) {
    throw new Error(`Invalid YAML in ${variableName}`, { cause: error })
  }

  if (document.errors.length > 0) {
    throw new Error(`Invalid YAML in ${variableName}`, { cause: document.errors[0] })
  }

  let value
  try {
    value = document.toJS({ maxAliasCount: 50 })
  } catch (error) {
    throw new Error(`Invalid YAML in ${variableName}`, { cause: error })
  }

  try {
    return schema.parse(value)
  } catch (error) {
    const detail = error.issues?.[0]?.message
    throw new Error(`Invalid configuration in ${variableName}${detail ? `: ${detail}` : ''}`, { cause: error })
  }
}
