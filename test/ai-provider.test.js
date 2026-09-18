import assert from 'node:assert/strict'
import test from 'node:test'
import { createAiProvider } from '../server/services/aiProvider.js'
import { INTERPRETATION_RESPONSE_FORMAT, normalizeInterpretationStructuredOutput } from '../server/services/interpretationResponseFormat.js'
import { parseAiJson } from '../server/domain/parseAiJson.js'
import { validateInterpretation } from '../server/domain/contracts.js'

function validInterpretation() {
  return {
    tasks: [{ description: 'Review the material', date: null, time: null, subtasks: null }],
    deadlines: [],
    events: [],
    reminders: [],
    routines: [],
    notes: [],
    ideas: [],
    non_negotiables: [],
    questions: [],
  }
}

test('interpretation requests send the strict Groq JSON Schema response format', async () => {
  const originalFetch = globalThis.fetch
  let request
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body)
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validInterpretation()) } }] }), { status: 200 })
  }

  try {
    const provider = createAiProvider({ GROQ_API_KEY: 'test-key', GROQ_MODEL: 'openai/gpt-oss-120b' })
    await provider.interpret([{ role: 'user', content: 'test' }])
    assert.deepEqual(request.response_format, INTERPRETATION_RESPONSE_FORMAT)
    assert.equal(request.response_format.type, 'json_schema')
    assert.equal(request.response_format.json_schema.strict, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('schema-shaped interpretation output is accepted after structured-output normalization', () => {
  const parsed = normalizeInterpretationStructuredOutput(parseAiJson(JSON.stringify(validInterpretation())))
  const validated = validateInterpretation(parsed)
  assert.equal(validated.tasks[0].description, 'Review the material')
  assert.deepEqual(validated.deadlines, [])
})

test('structured output still passes through domain validation', () => {
  const invalid = validInterpretation()
  invalid.tasks = [{ description: null, title: null }]
  assert.throws(() => validateInterpretation(normalizeInterpretationStructuredOutput(invalid)), (error) => error.statusCode === 502)
})

test('interpretation schema closes objects and requires all current categories', () => {
  const { schema } = INTERPRETATION_RESPONSE_FORMAT.json_schema
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(schema.required, ['tasks', 'deadlines', 'events', 'reminders', 'routines', 'notes', 'ideas', 'non_negotiables', 'questions'])
  const item = schema.properties.tasks.items
  assert.deepEqual(item, { $ref: '#/$defs/interpretation_item' })
  assert.equal(schema.$defs.interpretation_item.additionalProperties, false)
  assert.deepEqual(schema.$defs.interpretation_item.required, Object.keys(schema.$defs.interpretation_item.properties))
})

test('strict interpretation request stays below the conservative project size budget', () => {
  const request = {
    model: 'openai/gpt-oss-120b',
    messages: [{ role: 'system', content: 'interpret' }, { role: 'user', content: 'test' }],
    temperature: 0.2,
    response_format: INTERPRETATION_RESPONSE_FORMAT,
  }
  const requestBytes = new TextEncoder().encode(JSON.stringify(request)).byteLength
  const conservativeBudgetBytes = 256 * 1024
  assert.ok(requestBytes < conservativeBudgetBytes, `request schema is ${requestBytes} bytes; expected under ${conservativeBudgetBytes}`)
})
