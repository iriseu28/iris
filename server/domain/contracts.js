import { createDomainError } from './errors.js'

export const INTERPRETATION_CATEGORIES = [
  'tasks',
  'deadlines',
  'events',
  'reminders',
  'routines',
  'notes',
  'ideas',
  'non_negotiables',
  'questions',
]

export const MAX_BRAIN_DUMP_LENGTH = 20000

const MAX_ITEMS_PER_CATEGORY = 100
const MAX_DAYS = 90
const MAX_SUBTASKS = 50
const MAX_SUBTASK_DEPTH = 3
const MAX_TEXT_LENGTH = 2000
const MAX_REASON_LENGTH = 1000
const MAX_SHORT_TEXT_LENGTH = 200
const TEXT_FIELDS = ['description', 'task', 'item', 'action', 'title', 'name']

function fail(message, statusCode, publicMessage) {
  throw createDomainError(message, statusCode, publicMessage)
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertPlainObject(value, path, statusCode, publicMessage) {
  if (!isPlainObject(value)) {
    fail(`${path} must be an object`, statusCode, publicMessage)
  }
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isValidTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function validateOptionalString(source, key, path, target, maxLength, statusCode, publicMessage) {
  if (!(key in source)) return
  if (typeof source[key] !== 'string' || source[key].length > maxLength) {
    fail(`${path}.${key} must be a string of at most ${maxLength} characters`, statusCode, publicMessage)
  }
  target[key] = source[key]
}

function validateOptionalDate(source, key, path, target, statusCode, publicMessage) {
  if (!(key in source)) return
  if (source[key] === '') {
    target[key] = ''
    return
  }
  if (!isValidDate(source[key])) {
    fail(`${path}.${key} must be a valid YYYY-MM-DD date`, statusCode, publicMessage)
  }
  target[key] = source[key]
}

function validateOptionalTime(source, key, path, target, statusCode, publicMessage) {
  if (!(key in source)) return
  if (!isValidTime(source[key]) && source[key] !== '') {
    fail(`${path}.${key} must be a valid HH:mm time`, statusCode, publicMessage)
  }
  target[key] = source[key]
}

function sanitizeItem(item, path, {
  statusCode,
  publicMessage,
  requireText = true,
  allowSubtasks = false,
  depth = 0,
} = {}) {
  assertPlainObject(item, path, statusCode, publicMessage)

  const target = {}
  validateOptionalString(item, 'id', path, target, MAX_SHORT_TEXT_LENGTH, statusCode, publicMessage)

  for (const key of TEXT_FIELDS) {
    validateOptionalString(item, key, path, target, MAX_TEXT_LENGTH, statusCode, publicMessage)
  }

  const hasText = TEXT_FIELDS.some((key) => typeof target[key] === 'string' && target[key].trim())
  if (requireText && !hasText) {
    fail(`${path} must contain a non-empty text field`, statusCode, publicMessage)
  }

  validateOptionalDate(item, 'date', path, target, statusCode, publicMessage)
  validateOptionalDate(item, 'due_date', path, target, statusCode, publicMessage)
  validateOptionalString(item, 'due', path, target, MAX_SHORT_TEXT_LENGTH, statusCode, publicMessage)
  validateOptionalTime(item, 'time', path, target, statusCode, publicMessage)
  validateOptionalString(item, 'displayRelative', path, target, MAX_SHORT_TEXT_LENGTH, statusCode, publicMessage)
  validateOptionalString(item, 'type', path, target, MAX_SHORT_TEXT_LENGTH, statusCode, publicMessage)
  validateOptionalString(item, 'source', path, target, MAX_REASON_LENGTH, statusCode, publicMessage)
  validateOptionalString(item, 'reason', path, target, MAX_REASON_LENGTH, statusCode, publicMessage)

  if ('uncertain' in item) {
    if (typeof item.uncertain !== 'boolean' && typeof item.uncertain !== 'string') {
      fail(`${path}.uncertain must be a boolean or string`, statusCode, publicMessage)
    }
    if (typeof item.uncertain === 'string' && item.uncertain.length > MAX_SHORT_TEXT_LENGTH) {
      fail(`${path}.uncertain is too long`, statusCode, publicMessage)
    }
    target.uncertain = item.uncertain
  }

  if ('subtasks' in item) {
    if (!allowSubtasks || !Array.isArray(item.subtasks) || item.subtasks.length > MAX_SUBTASKS) {
      fail(`${path}.subtasks is invalid`, statusCode, publicMessage)
    }
    if (depth >= MAX_SUBTASK_DEPTH) {
      fail(`${path}.subtasks is nested too deeply`, statusCode, publicMessage)
    }
    target.subtasks = item.subtasks.map((subtask, index) => sanitizeItem(subtask, `${path}.subtasks[${index}]`, {
      statusCode,
      publicMessage,
      allowSubtasks: true,
      depth: depth + 1,
    }))
  }

  return target
}

function validateArray(value, path, statusCode, publicMessage, maxLength = MAX_ITEMS_PER_CATEGORY) {
  if (!Array.isArray(value) || value.length > maxLength) {
    fail(`${path} must be an array with at most ${maxLength} items`, statusCode, publicMessage)
  }
}

function validateDateTimeContext(currentDate, currentTime, statusCode, publicMessage) {
  if (currentDate !== undefined && !isValidDate(currentDate)) {
    fail('currentDate must be a valid YYYY-MM-DD date', statusCode, publicMessage)
  }
  if (currentTime !== undefined && !isValidTime(currentTime)) {
    fail('currentTime must be a valid HH:mm time', statusCode, publicMessage)
  }
}

export function validateInterpretation(candidate, { statusCode = 502 } = {}) {
  const publicMessage = statusCode === 400
    ? 'Iris received an invalid interpretation.'
    : 'Iris received an invalid AI interpretation. Please try again.'

  assertPlainObject(candidate, 'interpretation', statusCode, publicMessage)

  const unknownCategories = Object.keys(candidate).filter((key) => !INTERPRETATION_CATEGORIES.includes(key))
  if (unknownCategories.length > 0) {
    fail('interpretation contains an unknown category', statusCode, publicMessage)
  }

  const result = {}
  for (const category of INTERPRETATION_CATEGORIES) {
    if (!(category in candidate)) {
      fail(`interpretation.${category} is missing`, statusCode, publicMessage)
    }
    validateArray(candidate[category], `interpretation.${category}`, statusCode, publicMessage)
    result[category] = candidate[category].map((item, index) => sanitizeItem(item, `interpretation.${category}[${index}]`, {
      statusCode,
      publicMessage,
      allowSubtasks: category === 'tasks',
    }))
  }

  return result
}

export function validateInterpretRequest(body) {
  const publicMessage = 'Iris received an invalid brain dump request.'
  assertPlainObject(body, 'request', 400, publicMessage)

  if (typeof body.brainDump !== 'string' || !body.brainDump.trim()) {
    fail('brainDump must be a non-empty string', 400, publicMessage)
  }
  if (body.brainDump.length > MAX_BRAIN_DUMP_LENGTH) {
    fail('brainDump exceeds the maximum length', 400, 'That brain dump is too long. Please shorten it and try again.')
  }

  validateDateTimeContext(body.currentDate, body.currentTime, 400, publicMessage)
  return {
    brainDump: body.brainDump.trim(),
    currentDate: body.currentDate,
    currentTime: body.currentTime,
  }
}

export function validatePlan(candidate, { allowMissingAnchorDate = false, statusCode = 502 } = {}) {
  const publicMessage = statusCode === 400
    ? 'Iris received an invalid interpretation.'
    : 'Iris received an invalid AI plan. Please try again.'

  assertPlainObject(candidate, 'plan', statusCode, publicMessage)
  validateArray(candidate.days, 'plan.days', statusCode, publicMessage, MAX_DAYS)
  if (candidate.days.length === 0) {
    fail('plan.days cannot be empty', statusCode, publicMessage)
  }

  const seenDates = new Set()
  const days = candidate.days.map((day, dayIndex) => {
    const path = `plan.days[${dayIndex}]`
    assertPlainObject(day, path, statusCode, publicMessage)
    if (!isValidDate(day.date)) {
      fail(`${path}.date must be a valid YYYY-MM-DD date`, statusCode, publicMessage)
    }
    if (seenDates.has(day.date)) {
      fail(`${path}.date is duplicated`, statusCode, publicMessage)
    }
    seenDates.add(day.date)

    const result = { date: day.date }
    validateOptionalString(day, 'id', path, result, MAX_SHORT_TEXT_LENGTH, statusCode, publicMessage)
    validateOptionalString(day, 'label', path, result, MAX_SHORT_TEXT_LENGTH, statusCode, publicMessage)
    validateOptionalString(day, 'focus', path, result, MAX_TEXT_LENGTH, statusCode, publicMessage)

    for (const field of ['tasks', 'anchors', 'protected_time']) {
      if (day[field] !== undefined) {
        validateArray(day[field], `${path}.${field}`, statusCode, publicMessage)
      }
    }

    result.tasks = (day.tasks || []).map((task, index) => sanitizeItem(task, `${path}.tasks[${index}]`, {
      statusCode,
      publicMessage,
      allowSubtasks: true,
    }))

    result.anchors = (day.anchors || []).map((anchor, index) => {
      const anchorResult = sanitizeItem(anchor, `${path}.anchors[${index}]`, {
        statusCode,
        publicMessage,
      })
      if (!allowMissingAnchorDate && !anchorResult.date) {
        fail(`${path}.anchors[${index}].date is missing`, statusCode, publicMessage)
      }
      return anchorResult
    })

    result.protected_time = (day.protected_time || []).map((item, index) => sanitizeItem(item, `${path}.protected_time[${index}]`, {
      statusCode,
      publicMessage,
    }))

    return result
  })

  return { days }
}

export function validatePlanRequest(body) {
  const publicMessage = 'Iris received an invalid planning request.'
  assertPlainObject(body, 'request', 400, publicMessage)
  validateDateTimeContext(body.currentDate, body.currentTime, 400, publicMessage)

  if (!('interpretation' in body)) {
    fail('interpretation is missing', 400, publicMessage)
  }

  return {
    interpretation: validateInterpretation(body.interpretation, { statusCode: 400 }),
    currentDate: body.currentDate,
    currentTime: body.currentTime,
  }
}