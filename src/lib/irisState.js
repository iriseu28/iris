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

export function createId(prefix = 'iris') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
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
    Object.entries(candidate).map(([category, items]) => [
      category,
      Array.isArray(items) ? items.map((item) => normalizeEntity(item, category.slice(0, -1) || 'item')) : items,
    ])
  )
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
        tasks: (day.tasks || []).map((task) => ({
          ...normalizeEntity(task, 'task'),
          date: task?.date || day.date,
        })),
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
