import { createDomainError } from './errors.js'

const INVALID_RESPONSE_MESSAGE = 'Iris received an unexpected AI response. Please try again.'

export function parseAiJson(content) {
  if (typeof content !== 'string' || !content.trim()) {
    throw createDomainError(INVALID_RESPONSE_MESSAGE, 502, INVALID_RESPONSE_MESSAGE)
  }

  let cleaned = content.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1))
      } catch {
        // Fall through to the safe domain error below.
      }
    }

    throw createDomainError(INVALID_RESPONSE_MESSAGE, 502, INVALID_RESPONSE_MESSAGE)
  }
}