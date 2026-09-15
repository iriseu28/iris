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
export const TIMER_BLOCK_TYPES = ['work', 'break', 'transition', 'next-task']
export const TIMER_STATUSES = ['idle', 'running', 'paused', 'ready', 'stopped', 'completed']
const MAX_ESTIMATED_MINUTES = 1440
const MIN_TIMER_MINUTES = 1
const MAX_TIMER_MINUTES = 180
const MAX_TIMER_BLOCKS = 24

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

export function getNextUsefulTask(plan, completedTaskIds = [], currentDate) {
  if (!plan || !Array.isArray(plan.days)) return null
  const completed = new Set(Array.isArray(completedTaskIds) ? completedTaskIds : [])
  const incomplete = (day) => (Array.isArray(day?.tasks) ? day.tasks : []).find((task) => task && !completed.has(task.id)) || null
  const today = plan.days.find((day) => day?.date === currentDate)
  return incomplete(today) || plan.days.reduce((selected, day) => selected || incomplete(day), null)
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

function timerError(message) {
  return new Error(`Invalid timer sequence: ${message}`)
}

function normalizeTimerBlock(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) throw timerError('malformed block')
  if (typeof block.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(block.id)) throw timerError('block id is invalid')
  if (typeof block.label !== 'string' || !block.label.trim() || block.label.length > 200) throw timerError('block label is invalid')
  if (!TIMER_BLOCK_TYPES.includes(block.type)) throw timerError('block type is invalid')
  if (!Number.isInteger(block.duration_minutes) || block.duration_minutes < MIN_TIMER_MINUTES || block.duration_minutes > MAX_TIMER_MINUTES) throw timerError('duration is invalid')
  if (block.source_task_id !== undefined && block.source_task_id !== null && (typeof block.source_task_id !== 'string' || block.source_task_id.length > 200)) throw timerError('source task id is invalid')
  return {
    id: block.id,
    label: block.label.trim(),
    type: block.type,
    duration_minutes: block.duration_minutes,
    source_task_id: block.source_task_id || null,
    completed: block.completed === true,
    skipped: block.skipped === true,
  }
}

export function createTimerSequence(blocks, now = Date.now()) {
  if (!Array.isArray(blocks) || blocks.length === 0 || blocks.length > MAX_TIMER_BLOCKS) throw timerError('sequence length is invalid')
  const normalizedBlocks = blocks.map(normalizeTimerBlock)
  const ids = new Set()
  normalizedBlocks.forEach((block) => {
    if (ids.has(block.id)) throw timerError('block ids must be unique')
    ids.add(block.id)
  })
  return {
    id: createId('sequence'),
    blocks: normalizedBlocks,
    currentIndex: 0,
    status: 'idle',
    remaining_seconds: normalizedBlocks[0].duration_minutes * 60,
    started_at: null,
    ends_at: null,
    updated_at: now,
  }
}

export function normalizeTimerSequence(candidate, now = Date.now()) {
  if (!candidate || typeof candidate !== 'object' || !Array.isArray(candidate.blocks)) return null
  try {
    const sequence = createTimerSequence(candidate.blocks, now)
    const currentIndex = Number.isInteger(candidate.currentIndex) ? candidate.currentIndex : 0
    if (currentIndex < 0 || currentIndex >= sequence.blocks.length) return null
    if (!TIMER_STATUSES.includes(candidate.status)) return null
    const remaining = Number.isFinite(candidate.remaining_seconds)
      ? Math.max(0, Math.min(candidate.blocks[currentIndex].duration_minutes * 60, Math.floor(candidate.remaining_seconds)))
      : candidate.blocks[currentIndex].duration_minutes * 60
    return {
      ...sequence,
      id: typeof candidate.id === 'string' ? candidate.id : sequence.id,
      currentIndex,
      status: candidate.status,
      remaining_seconds: remaining,
      started_at: Number.isFinite(candidate.started_at) ? candidate.started_at : null,
      ends_at: Number.isFinite(candidate.ends_at) ? candidate.ends_at : null,
      updated_at: now,
    }
  } catch {
    return null
  }
}

function withTimerUpdate(sequence, patch, now) {
  return { ...sequence, ...patch, updated_at: now }
}

function advanceTimerSequence(sequence, now, completedState) {
  const blocks = sequence.blocks.map((block, index) => index === sequence.currentIndex ? { ...block, ...completedState } : block)
  const hasNext = sequence.currentIndex < blocks.length - 1
  return withTimerUpdate(sequence, {
    blocks,
    currentIndex: sequence.currentIndex,
    status: hasNext ? 'ready' : 'completed',
    remaining_seconds: 0,
    started_at: null,
    ends_at: null,
  }, now)
}

export function startTimer(sequence, now = Date.now()) {
  if (!sequence || !['idle', 'paused', 'ready'].includes(sequence.status)) return sequence
  const block = sequence.blocks?.[sequence.currentIndex]
  if (!block || block.completed || block.skipped) return sequence
  const remaining = Math.max(1, sequence.remaining_seconds || block.duration_minutes * 60)
  return withTimerUpdate(sequence, {
    status: 'running',
    started_at: sequence.started_at || now,
    ends_at: now + remaining * 1000,
    remaining_seconds: remaining,
  }, now)
}

export function pauseTimer(sequence, now = Date.now()) {
  if (!sequence || sequence.status !== 'running') return sequence
  const remaining = Math.max(0, Math.ceil((sequence.ends_at - now) / 1000))
  return withTimerUpdate(sequence, { status: 'paused', remaining_seconds: remaining, ends_at: null }, now)
}

export function resumeTimer(sequence, now = Date.now()) {
  return startTimer(sequence, now)
}

export function extendTimer(sequence, minutes = 5, now = Date.now()) {
  if (!sequence || !Number.isInteger(minutes) || minutes < 1 || minutes > 60) return sequence
  const block = sequence.blocks?.[sequence.currentIndex]
  if (!block) return sequence
  const duration = Math.min(MAX_TIMER_MINUTES, block.duration_minutes + minutes)
  const addedSeconds = (duration - block.duration_minutes) * 60
  const blocks = sequence.blocks.map((entry, index) => index === sequence.currentIndex ? { ...entry, duration_minutes: duration, completed: false, skipped: false } : entry)
  const endsAt = sequence.status === 'running' ? (sequence.ends_at || now) + addedSeconds * 1000 : null
  return withTimerUpdate(sequence, {
    blocks,
    status: sequence.status === 'ready' ? 'running' : sequence.status,
    remaining_seconds: sequence.remaining_seconds + addedSeconds,
    ends_at: endsAt,
    started_at: sequence.status === 'ready' ? now : sequence.started_at,
  }, now)
}

export function completeTimerBlock(sequence, now = Date.now()) {
  if (!sequence || !['running', 'paused'].includes(sequence.status)) return sequence
  return advanceTimerSequence(sequence, now, { completed: true, skipped: false })
}

export function skipTimerBlock(sequence, now = Date.now()) {
  if (!sequence || !['idle', 'paused', 'running', 'ready'].includes(sequence.status)) return sequence
  return advanceTimerSequence(sequence, now, { completed: false, skipped: true })
}

export function startNextTimerBlock(sequence, now = Date.now()) {
  if (!sequence || sequence.status !== 'ready' || sequence.currentIndex >= sequence.blocks.length - 1) return sequence
  return startTimer({
    ...sequence,
    currentIndex: sequence.currentIndex + 1,
    remaining_seconds: sequence.blocks[sequence.currentIndex + 1].duration_minutes * 60,
  }, now)
}

export function recoverTimerSequence(sequence, now = Date.now()) {
  const normalized = normalizeTimerSequence(sequence, now)
  if (!normalized || normalized.status !== 'running' || !Number.isFinite(normalized.ends_at) || normalized.ends_at > now) return normalized
  return completeTimerBlock(normalized, now)
}

export function resetTimerSequence(sequence, now = Date.now()) {
  if (!sequence) return null
  return {
    ...sequence,
    blocks: sequence.blocks.map((block) => ({ ...block, completed: false, skipped: false })),
    currentIndex: 0,
    status: 'idle',
    remaining_seconds: sequence.blocks[0].duration_minutes * 60,
    started_at: null,
    ends_at: null,
    updated_at: now,
  }
}

function isPersistedState(value) {
  return value && typeof value === 'object' && value.version === 1
}

export function loadIrisState() {
  const empty = { brainDump: '', interpretation: null, plan: null, completedTaskIds: [], timerSequence: null }
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
      timerSequence: recoverTimerSequence(parsed.timerSequence),
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
