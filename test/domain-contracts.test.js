import assert from 'node:assert/strict'
import test from 'node:test'
import { parseAiJson } from '../server/domain/parseAiJson.js'
import {
  MAX_BRAIN_DUMP_LENGTH,
  INTERPRETATION_CATEGORIES,
  validateInterpretRequest,
  validateInterpretation,
  validatePlan,
  validatePlanRequest,
} from '../server/domain/contracts.js'
import {
  buildPlanningRequest,
  isValidDateValue,
  isValidTimeValue,
  mergeReviewedInterpretation,
  moveInterpretationItem,
  normalizeInterpretation,
  removeInterpretationItem,
  updateInterpretationItem,
} from '../src/lib/irisState.js'

function validItem(text = 'Review the material') {
  return { description: text }
}

function validInterpretation() {
  return Object.fromEntries(INTERPRETATION_CATEGORIES.map((category) => [
    category,
    category === 'tasks' ? [validItem()] : [],
  ]))
}

function validPlan() {
  return {
    days: [{
      date: '2026-09-07',
      label: 'today',
      focus: 'Review one manageable section',
      tasks: [validItem()],
      anchors: [{
        type: 'deadline',
        title: 'Physics test',
        date: '2026-09-09',
        time: '',
      }],
      protected_time: [{ description: 'An hour to rest' }],
    }],
  }
}

function assertSafeFailure(callback, statusCode) {
  assert.throws(callback, (error) => {
    assert.equal(error.statusCode, statusCode)
    assert.equal(typeof error.publicMessage, 'string')
    assert.equal(error.publicMessage.includes('password'), false)
    return true
  })
}

test('accepts a valid interpretation and preserves the existing categories', () => {
  const result = validateInterpretation(validInterpretation())
  assert.deepEqual(Object.keys(result), INTERPRETATION_CATEGORIES)
  assert.equal(result.tasks[0].description, 'Review the material')
})

test('rejects missing, non-array, unknown, and malformed interpretation data', () => {
  const missing = validInterpretation()
  delete missing.questions
  assertSafeFailure(() => validateInterpretation(missing), 502)

  const nonArray = validInterpretation()
  nonArray.tasks = {}
  assertSafeFailure(() => validateInterpretation(nonArray), 502)

  const unknown = { ...validInterpretation(), someday: [] }
  assertSafeFailure(() => validateInterpretation(unknown), 502)

  const nonObjectItem = validInterpretation()
  nonObjectItem.tasks = ['Review the material']
  assertSafeFailure(() => validateInterpretation(nonObjectItem), 502)

  const missingText = validInterpretation()
  missingText.tasks = [{ date: '2026-09-07' }]
  assertSafeFailure(() => validateInterpretation(missingText), 502)
})

test('rejects invalid interpretation dates, times, nested data, and oversized arrays', () => {
  const invalidDate = validInterpretation()
  invalidDate.deadlines = [{ description: 'Submit work', date: '2026-02-30' }]
  assertSafeFailure(() => validateInterpretation(invalidDate), 502)

  const invalidTime = validInterpretation()
  invalidTime.events = [{ description: 'Class', time: '25:90' }]
  assertSafeFailure(() => validateInterpretation(invalidTime), 502)

  const invalidNested = validInterpretation()
  invalidNested.tasks = [{ description: 'Parent', subtasks: [{ description: 'Child', subtasks: [null] }] }]
  assertSafeFailure(() => validateInterpretation(invalidNested), 502)

  const tooMany = validInterpretation()
  tooMany.notes = Array.from({ length: 101 }, (_, index) => validItem(`Note ${index}`))
  assertSafeFailure(() => validateInterpretation(tooMany), 502)
})

test('accepts a valid plan and rejects malformed nested plan structures', () => {
  const result = validatePlan(validPlan())
  assert.equal(result.days[0].tasks[0].description, 'Review the material')

  const missingDays = {}
  assertSafeFailure(() => validatePlan(missingDays), 502)

  const invalidDate = validPlan()
  invalidDate.days[0].date = '2026-02-30'
  assertSafeFailure(() => validatePlan(invalidDate), 502)

  const malformedTask = validPlan()
  malformedTask.days[0].tasks = [{ source: 'Physics test' }]
  assertSafeFailure(() => validatePlan(malformedTask), 502)

  const malformedAnchor = validPlan()
  malformedAnchor.days[0].anchors = [{ title: 'Physics test' }]
  assertSafeFailure(() => validatePlan(malformedAnchor), 502)

  const malformedProtectedTime = validPlan()
  malformedProtectedTime.days[0].protected_time = [{ description: 42 }]
  assertSafeFailure(() => validatePlan(malformedProtectedTime), 502)
})

test('validates interpretation requests and planning request payloads', () => {
  assert.equal(validateInterpretRequest({ brainDump: '  I have a test.  ' }).brainDump, 'I have a test.')
  assertSafeFailure(() => validateInterpretRequest({ brainDump: '' }), 400)
  assertSafeFailure(() => validateInterpretRequest({ brainDump: 42 }), 400)
  assertSafeFailure(() => validateInterpretRequest({ brainDump: 'x'.repeat(MAX_BRAIN_DUMP_LENGTH + 1) }), 400)
  assertSafeFailure(() => validatePlanRequest({ interpretation: { tasks: [] } }), 400)
  assertSafeFailure(() => validatePlanRequest({ interpretation: validInterpretation(), currentDate: 'today' }), 400)
})

test('malformed model JSON fails with a safe 502 error', () => {
  assertSafeFailure(() => parseAiJson('not json and not an object'), 502)
  assertSafeFailure(() => parseAiJson('```json\n{"broken"\n```'), 502)
  assertSafeFailure(() => parseAiJson(null), 502)
})

test('reviewed interpretation corrections are preserved in the planning payload', () => {
  const reviewed = normalizeInterpretation({
    tasks: [{ id: 'task-1', description: 'Corrected text', date: '2026-09-10' }],
    deadlines: [],
    events: [],
    reminders: [],
    routines: [],
    notes: [],
    ideas: [],
    non_negotiables: [],
    questions: [],
  })
  const moved = moveInterpretationItem(reviewed, 'tasks', 'deadlines', 'task-1')
  const corrected = updateInterpretationItem(moved, 'deadlines', 'task-1', {
    description: 'Corrected again',
    date: '2026-09-11',
  })
  const withoutDeletedItem = removeInterpretationItem(corrected, 'tasks', 'missing-item')
  const payload = buildPlanningRequest(withoutDeletedItem, {
    currentDate: '2026-09-09',
    currentTime: '10:30',
  })

  assert.equal(payload.interpretation.tasks.some((item) => item.id === 'task-1'), false)
  assert.deepEqual(payload.interpretation.deadlines, [{
    id: 'task-1',
    description: 'Corrected again',
    date: '2026-09-11',
    subtasks: undefined,
  }])
})

test('deleted interpretation items stay absent from planning payloads', () => {
  const interpretation = normalizeInterpretation({
    ...validInterpretation(),
    tasks: [{ id: 'delete-me', description: 'Remove this' }],
  })
  const deleted = removeInterpretationItem(interpretation, 'tasks', 'delete-me')
  const payload = buildPlanningRequest(deleted, { currentDate: '2026-09-09', currentTime: '10:30' })

  assert.deepEqual(payload.interpretation.tasks, [])
})

test('client date and time edits accept valid values and reject invalid values', () => {
  assert.equal(isValidDateValue('2026-09-11'), true)
  assert.equal(isValidDateValue(''), true)
  assert.equal(isValidDateValue('2026-02-30'), false)
  assert.equal(isValidDateValue('tomorrow'), false)
  assert.equal(isValidTimeValue('09:30'), true)
  assert.equal(isValidTimeValue(''), true)
  assert.equal(isValidTimeValue('25:90'), false)
  assert.equal(isValidTimeValue('morning'), false)
})

test('clarification data is normalized without corrupting interpretation state', () => {
  const normalized = normalizeInterpretation({
    ...validInterpretation(),
    questions: [null, 42, { description: 'Which class is this for?' }],
  })

  assert.deepEqual(normalized.questions.map((question) => question.description), ['Which class is this for?'])
  assert.deepEqual(normalized.ideas, [])
})

test('clarification refresh preserves reviewed items while accepting new interpretation items', () => {
  const reviewed = normalizeInterpretation({
    ...validInterpretation(),
    tasks: [{ id: 'reviewed-task', description: 'User-approved task', date: '2026-09-12' }],
  })
  const refreshed = normalizeInterpretation({
    ...validInterpretation(),
    tasks: [
      { id: 'reviewed-task', description: 'AI changed this incorrectly', date: '2026-09-13' },
      { id: 'new-task', description: 'New clarification task' },
    ],
    questions: [{ id: 'follow-up', description: 'One more detail?' }],
  })
  const merged = mergeReviewedInterpretation(reviewed, refreshed)

  assert.deepEqual(merged.tasks, [
    { id: 'reviewed-task', description: 'User-approved task', date: '2026-09-12', subtasks: undefined },
    { id: 'new-task', description: 'New clarification task', subtasks: undefined },
  ])
  assert.equal(merged.questions[0].description, 'One more detail?')
})