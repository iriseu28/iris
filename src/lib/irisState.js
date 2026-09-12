export const IRIS_STORAGE_KEY = 'iris-state-v1'

export const CATEGORY_KEYS = [
  'tasks',
  'deadlines',
  'events',
  'reminders',
  'routines',
  'notes',
  'ideas',
  'non_negotiables',
]

export const INTERPRETATION_KEYS = [...CATEGORY_KEYS, 'questions']
export const PLANNING_PRIORITIES = ['urgent', 'important', 'normal']
const MAX_ESTIMATED_MINUTES = 1440

export function createId(prefix = 'iris') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isEntity(value) {
  return typeof value === 'string' || (value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeEntity(item, prefix) {
  const entity = typeof item === 'string' ? { description: item } : { ...(item || {}) }
  return {
    ...entity,
    id: entity.id || createId(prefix),
    subtasks: Array.isArray(entity.subtasks)
      ? entity.subtasks.map((subtask) => normalizeEntity(subtask, 'subtask'))
      : entity.subtasks,
  }
}

export function normalizeInterpretation(candidate) {
  if (!candidate || typeof candidate !== 'object') return null
  return Object.fromEntries(
    INTERPRETATION_KEYS.map((category) => [
      category,
      Array.isArray(candidate[category])
        ? candidate[category]
          .filter(isEntity)
          .map((item) => normalizeEntity(item, category.slice(0, -1) || 'item'))
        : [],
    ])
  )
}

export function updateInterpretationItem(interpretation, category, itemId, patch) {
  if (!interpretation || !Array.isArray(interpretation[category])) return interpretation
  return {
    ...interpretation,
    [category]: interpretation[category].map((item) => item.id === itemId ? { ...item, ...patch } : item),
  }
}

export function removeInterpretationItem(interpretation, category, itemId) {
  if (!interpretation || !Array.isArray(interpretation[category])) return interpretation
  return {
    ...interpretation,
    [category]: interpretation[category].filter((item) => item.id !== itemId),
  }
}

export function moveInterpretationItem(interpretation, fromCategory, toCategory, itemId) {
  if (!interpretation || fromCategory === toCategory) return interpretation
  const item = interpretation[fromCategory]?.find((entry) => entry.id === itemId)
  if (!item || !Array.isArray(interpretation[toCategory])) return interpretation
  return {
    ...interpretation,
    [fromCategory]: interpretation[fromCategory].filter((entry) => entry.id !== itemId),
    [toCategory]: [...interpretation[toCategory], item],
  }
}

export function mergeReviewedInterpretation(reviewed, refreshed) {
  const current = normalizeInterpretation(reviewed)
  const next = normalizeInterpretation(refreshed)
  if (!current) return next
  if (!next) return current

  const reviewedItems = INTERPRETATION_KEYS.flatMap((category) => current[category].map((item) => [item.id, item]))
  const reviewedById = new Map(reviewedItems)

  return Object.fromEntries(INTERPRETATION_KEYS.map((category) => {
    if (category === 'questions') return [category, next.questions]
    const refreshedItems = next[category].filter((item) => !reviewedById.has(item.id))
    return [category, [...current[category], ...refreshedItems]]
  }))
}

export function buildPlanningRequest(interpretation, { currentDate, currentTime }) {
  return { interpretation, currentDate, currentTime }
}

export function isValidDateValue(value) {
  if (value === '') return true
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function isValidTimeValue(value) {
  return value === '' || (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value))
}

export function normalizePlan(candidate) {
  if (!candidate || !Array.isArray(candidate.days) || candidate.days.length === 0) {
    throw new Error('Iris returned a plan in an unexpected format. Please try again.')
  }

  return {
    ...candidate,
    days: candidate.days.map((day) => {
      if (!day || typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
        throw new Error('Iris returned a plan with an invalid day. Please try again.')
      }

      for (const field of ['tasks', 'anchors', 'protected_time']) {
        if (day[field] !== undefined && !Array.isArray(day[field])) {
          throw new Error('Iris returned a plan with invalid day details. Please try again.')
        }
      }

      return {
        ...day,
        id: day.id || createId('day'),
        focus: typeof day.focus === 'string' ? day.focus : '',
        tasks: (day.tasks || []).map((task) => {
          const normalized = normalizeEntity(task, 'task')
          const sourceId = typeof normalized.source_id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(normalized.source_id)
            ? normalized.source_id
            : null
          const sourceCategory = INTERPRETATION_KEYS.includes(normalized.source_category)
            ? normalized.source_category
            : null
          return {
            ...normalized,
            priority: PLANNING_PRIORITIES.includes(normalized.priority) ? normalized.priority : null,
            estimated_minutes: Number.isInteger(normalized.estimated_minutes) && normalized.estimated_minutes >= 0 && normalized.estimated_minutes <= MAX_ESTIMATED_MINUTES
              ? normalized.estimated_minutes
              : null,
            source_id: sourceId,
            source_category: sourceId ? sourceCategory : null,
            date: task?.date || day.date,
          }
        }),
        anchors: (day.anchors || []).map((anchor) => normalizeEntity(anchor, 'anchor')),
        protected_time: (day.protected_time || []).map((item) => normalizeEntity(item, 'protected')),
      }
    }),
  }
}

function isPersistedState(value) {
  return value && typeof value === 'object' && value.version === 1
}

export function loadIrisState() {
  const empty = { brainDump: '', interpretation: null, plan: null, completedTaskIds: [] }
  if (typeof window === 'undefined') return empty

  try {
    const parsed = JSON.parse(window.localStorage.getItem(IRIS_STORAGE_KEY) || 'null')
    if (!isPersistedState(parsed)) return empty
    const plan = parsed.plan ? normalizePlan(parsed.plan) : null
    const taskIds = new Set(plan?.days.flatMap((day) => day.tasks.map((task) => task.id)) || [])
    return {
      brainDump: typeof parsed.brainDump === 'string' ? parsed.brainDump : '',
      interpretation: parsed.interpretation ? normalizeInterpretation(parsed.interpretation) : null,
      plan,
      completedTaskIds: Array.isArray(parsed.completedTaskIds)
        ? parsed.completedTaskIds.filter((id) => taskIds.has(id))
        : [],
    }
  } catch {
    return empty
  }
}

export function persistIrisState(state) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(IRIS_STORAGE_KEY, JSON.stringify({ version: 1, ...state }))
  } catch {
    // Storage can be unavailable or full. The live state remains usable.
  }
}
