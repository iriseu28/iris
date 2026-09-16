const DATE_PATTERN = '^$|^\\d{4}-\\d{2}-\\d{2}$'
const TIME_PATTERN = '^$|^([01]\\d|2[0-3]):[0-5]\\d$'
const CATEGORIES = [
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

function nullableString({ maxLength, pattern } = {}) {
  const stringSchema = { type: 'string' }
  if (maxLength !== undefined) stringSchema.maxLength = maxLength
  if (pattern) stringSchema.pattern = pattern
  return { anyOf: [stringSchema, { type: 'null' }] }
}

function nullableBooleanOrString(maxLength) {
  return {
    anyOf: [
      { type: 'boolean' },
      { type: 'string', maxLength },
      { type: 'null' },
    ],
  }
}

function itemSchema(depth) {
  const properties = {
    id: nullableString({ maxLength: 200 }),
    description: nullableString({ maxLength: 2000 }),
    task: nullableString({ maxLength: 2000 }),
    item: nullableString({ maxLength: 2000 }),
    action: nullableString({ maxLength: 2000 }),
    title: nullableString({ maxLength: 2000 }),
    name: nullableString({ maxLength: 2000 }),
    date: nullableString({ pattern: DATE_PATTERN }),
    due_date: nullableString({ pattern: DATE_PATTERN }),
    due: nullableString({ maxLength: 200 }),
    time: nullableString({ pattern: TIME_PATTERN }),
    displayRelative: nullableString({ maxLength: 200 }),
    type: nullableString({ maxLength: 200 }),
    source: nullableString({ maxLength: 1000 }),
    reason: nullableString({ maxLength: 1000 }),
    uncertain: nullableBooleanOrString(200),
    subtasks: depth > 0
      ? { anyOf: [{ type: 'array', maxItems: 50, items: itemSchema(depth - 1) }, { type: 'null' }] }
      : { anyOf: [{ type: 'array', maxItems: 0, items: {} }, { type: 'null' }] },
  }
  const required = Object.keys(properties)
  const textRequirement = ['description', 'task', 'item', 'action', 'title', 'name'].map((key) => ({
    type: 'object',
    additionalProperties: false,
    properties,
    required: [key],
  }))

  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required,
    anyOf: textRequirement,
  }
}

const interpretationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(CATEGORIES.map((category) => [
    category,
    { type: 'array', maxItems: 100, items: itemSchema(3) },
  ])),
  required: CATEGORIES,
}

export const INTERPRETATION_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'iris_interpretation',
    strict: true,
    schema: interpretationSchema,
  },
}

export function normalizeInterpretationStructuredOutput(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return candidate
  return Object.fromEntries(Object.entries(candidate).map(([key, value]) => [
    key,
    Array.isArray(value)
      ? value.map((item) => item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).filter(([, field]) => field !== null).map(([field, fieldValue]) => [field, Array.isArray(fieldValue) ? fieldValue.map((child) => normalizeInterpretationStructuredOutput(child)) : fieldValue]))
        : value)
      : value,
  ]))
}

export { interpretationSchema }
