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

function nullableString() {
  return { anyOf: [{ type: 'string' }, { type: 'null' }] }
}

const itemProperties = {
  id: nullableString(),
  description: nullableString(),
  task: nullableString(),
  item: nullableString(),
  action: nullableString(),
  title: nullableString(),
  name: nullableString(),
  date: nullableString(),
  due_date: nullableString(),
  due: nullableString(),
  time: nullableString(),
  displayRelative: nullableString(),
  type: nullableString(),
  source: nullableString(),
  reason: nullableString(),
  uncertain: {
    anyOf: [{ type: 'boolean' }, { type: 'string' }, { type: 'null' }],
  },
  subtasks: {
    anyOf: [
      { type: 'array', items: { $ref: '#/$defs/interpretation_item' } },
      { type: 'null' },
    ],
  },
}

const interpretationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(CATEGORIES.map((category) => [
    category,
    { type: 'array', items: { $ref: '#/$defs/interpretation_item' } },
  ])),
  required: CATEGORIES,
  $defs: {
    interpretation_item: {
      type: 'object',
      additionalProperties: false,
      properties: itemProperties,
      required: Object.keys(itemProperties),
    },
  },
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

export { CATEGORIES, interpretationSchema }
