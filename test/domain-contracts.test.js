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