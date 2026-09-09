import { useEffect, useMemo, useState } from 'react'
import InlineEdit from './components/InlineEdit'
import {
  CATEGORY_KEYS,
  buildPlanningRequest,
  isValidDateValue,
  isValidTimeValue,
  loadIrisState,
  mergeReviewedInterpretation,
  moveInterpretationItem,
  normalizeInterpretation,
  normalizePlan,
  persistIrisState,
  removeInterpretationItem,
  updateInterpretationItem,
} from './lib/irisState'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || ''
const CATEGORIES = {
  tasks: ['✓', 'tasks'], deadlines: ['◷', 'deadlines'], events: ['○', 'events'], reminders: ['🔔', 'reminders'],
  routines: ['↻', 'routines'], notes: ['📝', 'notes'], ideas: ['💡', 'ideas'], non_negotiables: ['♡', 'things i’ll protect'],
}

function getText(item) {
  return item?.description || item?.task || item?.item || item?.action || item?.title || item?.name || 'untitled'
}

function getLocalDateTime() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return { currentDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, currentTime: `${pad(now.getHours())}:${pad(now.getMinutes())}` }
}

function formatPlanDate(date) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${date}T00:00:00`))
}

async function postJson(path, body) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new Error('Iris can’t reach its planning service. Start it with “npm run dev:all” and try again.')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data
}

function App() {
  const [restored] = useState(loadIrisState)
  const [brainDump, setBrainDump] = useState(restored.brainDump)
  const [interpretation, setInterpretation] = useState(restored.interpretation)
  const [plan, setPlan] = useState(restored.plan)
  const [completedTaskIds, setCompletedTaskIds] = useState(restored.completedTaskIds)
  const [loading, setLoading] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [error, setError] = useState(null)
  const [clarificationAnswers, setClarificationAnswers] = useState({})
  const [editingQuestion, setEditingQuestion] = useState(null)
  const [clarifying, setClarifying] = useState(false)
  const [dragSource, setDragSource] = useState(null)
  const [dragOverCategory, setDragOverCategory] = useState(null)
  const [pendingMove, setPendingMove] = useState(null)
  const [lastReviewMove, setLastReviewMove] = useState(null)

  useEffect(() => {
    persistIrisState({ brainDump, interpretation, plan, completedTaskIds })
  }, [brainDump, interpretation, plan, completedTaskIds])

  useEffect(() => {
    if (!lastReviewMove) return undefined
    const timeout = window.setTimeout(() => setLastReviewMove(null), 7000)
    return () => window.clearTimeout(timeout)
  }, [lastReviewMove])

  const localNow = getLocalDateTime()
  const today = plan?.days.find((day) => day.date === localNow.currentDate) || plan?.days[0]
  const futureDays = plan?.days.filter((day) => day.id !== today?.id && day.date >= localNow.currentDate) || []
  const allTasks = plan?.days.flatMap((day) => day.tasks) || []
  const completedCount = allTasks.filter((task) => completedTaskIds.includes(task.id)).length
  const progress = allTasks.length ? Math.round((completedCount / allTasks.length) * 100) : 0
  const upcomingAnchors = useMemo(() => {
    const seen = new Set()
    return (plan?.days || []).flatMap((day) => day.anchors.map((anchor) => ({ ...anchor, dayId: day.id, date: anchor.date || day.date }))).filter((anchor) => {
      if (anchor.date < localNow.currentDate || seen.has(anchor.id)) return false
      seen.add(anchor.id)
      return true
    })
  }, [plan, localNow.currentDate])

  async function interpretBrainDump() {
    if (!brainDump.trim()) return
    setLoading(true); setError(null)
    try { setInterpretation(normalizeInterpretation(await postJson('/api/interpret', { brainDump, ...getLocalDateTime() }))) }
    catch (err) { console.error(err); setError(err.message) }
    finally { setLoading(false) }
  }

  async function createPlan() {
    if (!interpretation) return
    setPlanning(true); setError(null)
    try {
      setPlan(normalizePlan(await postJson('/api/plan', buildPlanningRequest(interpretation, getLocalDateTime()))))
      setCompletedTaskIds([])
    } catch (err) { console.error(err); setError(err.message || 'Iris could not create your plan. Please try again.') }
    finally { setPlanning(false) }
  }

  function toggleTask(id) {
    setCompletedTaskIds((current) => current.includes(id) ? current.filter((taskId) => taskId !== id) : [...current, id])
  }

  function updateInterpretationItem(category, itemId, patch) {
    setLastReviewMove(null)
    setInterpretation((current) => updateInterpretationItem(current, category, itemId, patch))
  }

  function deleteInterpretationItem(category, itemId) {
    setLastReviewMove(null)
    setInterpretation((current) => removeInterpretationItem(current, category, itemId))
  }

  function updatePlanDay(dayId, patch) {
    setPlan((current) => ({ ...current, days: current.days.map((day) => day.id === dayId ? { ...day, ...patch } : day) }))
  }

  function updatePlanTask(taskId, patch) {
    setPlan((current) => ({ ...current, days: current.days.map((day) => ({ ...day, tasks: day.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task) })) }))
  }

  function updateSubtask(taskId, subtaskId, patch) {
    setPlan((current) => ({ ...current, days: current.days.map((day) => ({ ...day, tasks: day.tasks.map((task) => task.id === taskId ? { ...task, subtasks: (task.subtasks || []).map((subtask) => subtask.id === subtaskId ? { ...subtask, ...patch } : subtask) } : task) })) }))
  }

  function updatePlanAnchor(dayId, anchorId, patch) {
    setPlan((current) => ({ ...current, days: current.days.map((day) => day.id === dayId ? { ...day, anchors: day.anchors.map((anchor) => anchor.id === anchorId ? { ...anchor, ...patch } : anchor) } : day) }))
  }

  function updateProtectedTime(dayId, itemId, patch) {
    setPlan((current) => ({ ...current, days: current.days.map((day) => day.id === dayId ? { ...day, protected_time: day.protected_time.map((item) => item.id === itemId ? { ...item, ...patch } : item) } : day) }))
  }

  function requestReviewMove(destination) {
    if (!dragSource || dragSource.kind !== 'review') return
    setDragOverCategory(null)
    if (dragSource.category !== destination) setPendingMove({ ...dragSource, destination, fromLabel: CATEGORIES[dragSource.category][1], toLabel: CATEGORIES[destination][1] })
    setDragSource(null)
  }

  function requestKeyboardReviewMove(category, item, destination) {
    if (category === destination) return
    setPendingMove({
      kind: 'review',
      category,
      itemId: item.id,
      title: getText(item),
      destination,
      fromLabel: CATEGORIES[category][1],
      toLabel: CATEGORIES[destination][1],
    })
  }

  function planDayLabel(dayId) {
    const day = plan?.days.find((entry) => entry.id === dayId)
    return day?.label === 'today' ? 'Today' : day?.label || formatPlanDate(day?.date)
  }

  function requestPlanMove(targetDayId, targetIndex) {
    if (!dragSource || dragSource.kind !== 'plan') return
    const destination = plan.days.find((day) => day.id === targetDayId)
    const destinationIndex = targetIndex ?? destination.tasks.length
    const noChange = dragSource.dayId === targetDayId && (destinationIndex === dragSource.taskIndex || destinationIndex === dragSource.taskIndex + 1)
    setDragSource(null)
    if (noChange) return
    setPendingMove({ ...dragSource, targetDayId, targetIndex: destinationIndex, fromLabel: planDayLabel(dragSource.dayId), toLabel: dragSource.dayId === targetDayId ? `${planDayLabel(targetDayId)} (new position)` : planDayLabel(targetDayId) })
  }

  function confirmMove() {
    if (!pendingMove) return
    if (pendingMove.kind === 'review') {
      const item = interpretation?.[pendingMove.category]?.find((entry) => entry.id === pendingMove.itemId)
      if (item) {
        setInterpretation((current) => moveInterpretationItem(current, pendingMove.category, pendingMove.destination, pendingMove.itemId))
        setLastReviewMove({
          itemId: item.id,
          fromCategory: pendingMove.category,
          toCategory: pendingMove.destination,
          fromLabel: pendingMove.fromLabel,
          toLabel: pendingMove.toLabel,
        })
      }
    } else {
      setPlan((current) => {
        const sourceDay = current.days.find((day) => day.tasks.some((task) => task.id === pendingMove.taskId))
        const destinationDay = current.days.find((day) => day.id === pendingMove.targetDayId)
        if (!sourceDay || !destinationDay) return current
        const sourceTaskIndex = sourceDay.tasks.findIndex((task) => task.id === pendingMove.taskId)
        const days = current.days.map((day) => ({ ...day, tasks: [...day.tasks] }))
        const sourceIndex = days.findIndex((day) => day.id === sourceDay.id)
        const targetIndex = days.findIndex((day) => day.id === destinationDay.id)
        const [task] = days[sourceIndex].tasks.splice(sourceTaskIndex, 1)
        let insertionIndex = pendingMove.targetIndex
        if (sourceIndex === targetIndex && sourceTaskIndex < insertionIndex) insertionIndex -= 1
        insertionIndex = Math.max(0, Math.min(insertionIndex, days[targetIndex].tasks.length))
        days[targetIndex].tasks.splice(insertionIndex, 0, { ...task, date: days[targetIndex].date })
        return { ...current, days }
      })
    }
    setPendingMove(null)
  }

  function undoReviewMove() {
    if (!lastReviewMove) return
    setInterpretation((current) => moveInterpretationItem(
      current,
      lastReviewMove.toCategory,
      lastReviewMove.fromCategory,
      lastReviewMove.itemId,
    ))
    setLastReviewMove(null)
  }

  function resetIris() {
    setBrainDump(''); setInterpretation(null); setPlan(null); setCompletedTaskIds([]); setError(null); setClarificationAnswers({}); setEditingQuestion(null); setLastReviewMove(null)
  }

  async function submitClarifications() {
    const questions = interpretation?.questions || []
    if (!Array.isArray(questions) || questions.some((question, index) => !getText(question).trim() || typeof clarificationAnswers[index] !== 'string' || !clarificationAnswers[index].trim())) {
      setError('Please answer each question before updating the interpretation.')
      return
    }
    const clarificationText = questions.map((question, index) => `${getText(question)}: ${clarificationAnswers[index]}`).join('\n')
    const updatedBrainDump = `${brainDump}\n\nClarifications to Iris:\n${clarificationText}`
    setClarifying(true); setError(null)
    try {
      const refreshedInterpretation = await postJson('/api/interpret', {
        brainDump: updatedBrainDump,
        reviewedInterpretation: interpretation,
        ...getLocalDateTime(),
      })
      setInterpretation(mergeReviewedInterpretation(interpretation, refreshedInterpretation))
      setBrainDump(updatedBrainDump); setClarificationAnswers({}); setEditingQuestion(null)
    } catch (err) { console.error(err); setError(err.message) }
    finally { setClarifying(false) }
  }

  function renderDateTime(item, onChange) {
    return <div className="editable-metadata">
      <InlineEdit type="date" value={item.date || item.due_date || ''} placeholder="add date" className="metadata-edit" onSave={(date) => onChange({ date })} validate={(date) => isValidDateValue(date) ? '' : 'Use a real date.'} ariaLabel="Edit date" />
      <InlineEdit type="time" value={item.time || ''} placeholder="add time" className="metadata-edit" onSave={(time) => onChange({ time })} validate={(time) => isValidTimeValue(time) ? '' : 'Use a time like 09:30.'} ariaLabel="Edit time" />
    </div>
  }

  function renderPreviewCategory(category) {
    const items = interpretation?.[category] || []
    const [icon, label] = CATEGORIES[category]
    return <section className={`task-section category-drop-zone ${dragOverCategory === category ? 'drag-over' : ''}`} key={category} onDragOver={(event) => { event.preventDefault(); setDragOverCategory(category) }} onDragLeave={() => setDragOverCategory(null)} onDrop={() => requestReviewMove(category)}>
      <h2>{icon} {label}</h2>
      {items.length
        ? items.map((item) => <div className="preview-item movable-item" key={item.id} draggable onDragStart={() => setDragSource({ kind: 'review', category, itemId: item.id, title: getText(item) })} onDragEnd={() => { setDragSource(null); setDragOverCategory(null) }}>
          <div className="item-information"><InlineEdit value={getText(item)} onSave={(description) => updateInterpretationItem(category, item.id, { description })} className="item-title-edit" ariaLabel={`Edit ${label} item`} />{renderDateTime(item, (patch) => updateInterpretationItem(category, item.id, patch))}</div>
          <details className="item-actions" onMouseDown={(event) => event.stopPropagation()}>
            <summary>actions</summary>
            <div className="item-actions-panel">
              <label>move to
                <select defaultValue="" onChange={(event) => {
                  const destination = event.target.value
                  event.target.value = ''
                  if (destination) requestKeyboardReviewMove(category, item, destination)
                }}>
                  <option value="">choose a section</option>
                  {CATEGORY_KEYS.filter((destination) => destination !== category).map((destination) => <option value={destination} key={destination}>{CATEGORIES[destination][1]}</option>)}
                </select>
              </label>
              <button type="button" className="item-delete" onClick={() => deleteInterpretationItem(category, item.id)}>delete</button>
            </div>
          </details>
        </div>)
        : <p className="empty-drop-target">drop items here</p>}
    </section>
  }

  function renderTask(task, index, dayId, parentTaskId) {
    const complete = completedTaskIds.includes(task.id)
    const isSubtask = Boolean(parentTaskId)
    const update = (patch) => isSubtask ? updateSubtask(parentTaskId, task.id, patch) : updatePlanTask(task.id, patch)
    return <div className={`${isSubtask ? 'planned-subtask' : 'planned-task movable-item'} ${complete ? 'completed' : ''}`} key={task.id} draggable={!isSubtask} onDragStart={!isSubtask ? () => setDragSource({ kind: 'plan', taskId: task.id, taskIndex: index, dayId, title: getText(task) }) : undefined} onDragOver={!isSubtask ? (event) => event.preventDefault() : undefined} onDrop={!isSubtask ? (event) => { event.preventDefault(); requestPlanMove(dayId, index) } : undefined} onDragEnd={!isSubtask ? () => setDragSource(null) : undefined}>
      {!isSubtask && <button className="task-check-button" onClick={() => toggleTask(task.id)} aria-label={`${complete ? 'Mark incomplete' : 'Mark complete'}: ${getText(task)}`}>{complete ? '✓' : '○'}</button>}
      <div className="item-information"><InlineEdit value={getText(task)} onSave={(description) => update({ description })} className="item-title-edit" ariaLabel="Edit task" />{task.source && <span>{task.source}</span>}{renderDateTime(task, update)}{!isSubtask && (task.subtasks || []).map((subtask, subtaskIndex) => renderTask(subtask, subtaskIndex, dayId, task.id))}</div>
    </div>
  }

  function renderTasks(tasks, dayId) {
    if (!tasks.length) return <p className="empty-plan">Nothing is scheduled here yet.</p>
    return tasks.map((task, index) => renderTask(task, index, dayId))
  }

  function renderMoveDialog() {
    if (!pendingMove) return null
    const itemLabel = pendingMove.kind === 'review' ? 'item' : 'task'
    return <div className="move-dialog-backdrop" role="presentation"><section className="move-dialog" role="dialog" aria-modal="true" aria-labelledby="move-dialog-title">
      <p className="eyebrow">iris</p><h2 id="move-dialog-title">you’re moving this {itemLabel}</h2><strong className="move-title">{pendingMove.title}</strong>
      <div className="move-summary"><span>from</span><strong>{pendingMove.fromLabel}</strong><span>to</span><strong>{pendingMove.toLabel}</strong></div>
      <div className="move-actions"><button className="small-button" onClick={() => setPendingMove(null)}>cancel</button><button onClick={confirmMove}>move {itemLabel}</button></div>
    </section></div>
  }

  if (!interpretation) return <main className="app"><div className="card">
    <p className="eyebrow">iris</p><h1>what’s on your mind?</h1><p className="subtitle">don’t organize it. just tell me everything.</p>
    <textarea value={brainDump} onChange={(event) => setBrainDump(event.target.value)} placeholder="i have physics tomorrow and..." disabled={loading} />
    <button onClick={interpretBrainDump} disabled={loading || !brainDump.trim()}>{loading ? 'thinking...' : 'help me figure it out →'}</button>{error && <p className="error">{error}</p>}
  </div></main>

  if (!plan) return <main className="app"><div className="card">
    <p className="eyebrow">iris</p><h1>here’s what i understood.</h1><p className="subtitle">click anything to make it yours before i turn it into your plan.</p>
     <div className="category-list">{CATEGORY_KEYS.map(renderPreviewCategory)}</div>{lastReviewMove && <p className="move-undo" role="status">moved to {lastReviewMove.toLabel} · <button type="button" onClick={undoReviewMove}>undo</button></p>}<p className="move-hint">drag anything into another section if i got it wrong, or open an item’s actions to move it without dragging.</p>
    {interpretation.questions?.length > 0 && <section className="task-section clarification-section"><h2>? i need to check</h2><p className="clarification-hint">tap a question to answer it. iris will use your answers to clean up the interpretation.</p>
      {interpretation.questions.map((question, index) => <div className="clarification-item" key={question.id || index}><button className="clarification-question" onClick={() => setEditingQuestion(editingQuestion === index ? null : index)}><strong>{getText(question)}</strong><span>{clarificationAnswers[index] ? '✓ answered' : editingQuestion === index ? 'close' : 'answer →'}</span></button>{editingQuestion === index && <div className="clarification-input-wrap"><input autoFocus value={clarificationAnswers[index] || ''} onChange={(event) => setClarificationAnswers((current) => ({ ...current, [index]: event.target.value }))} placeholder="type your clarification…" /></div>}</div>)}
      <button className="clarification-submit" onClick={submitClarifications} disabled={clarifying}>{clarifying ? 'checking again…' : 'update my interpretation →'}</button>
    </section>}
    {error && <p className="error">{error}</p>}<div className="confirmation-actions"><button onClick={() => { setInterpretation(null); setError(null); setClarificationAnswers({}); setEditingQuestion(null) }} disabled={planning}>← edit</button><button className="primary-action" onClick={createPlan} disabled={planning}>{planning ? 'making your plan...' : 'looks right →'}</button></div>{renderMoveDialog()}
  </div></main>

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  return <main className="app dashboard-app"><div className="dashboard">
    <header className="dashboard-header"><div><p className="eyebrow">iris</p><h1>good {greeting}.</h1><p className="subtitle">let’s make today manageable.</p></div><button className="small-button" onClick={resetIris}>+ brain dump</button></header>
    <section className="focus-card"><div><p className="plan-label">today · {formatPlanDate(localNow.currentDate)}</p><InlineEdit value={today?.focus || ''} placeholder="a manageable next step" onSave={(focus) => updatePlanDay(today.id, { focus })} className="focus-edit" ariaLabel="Edit today’s focus" /></div><div className="progress-ring">{progress}%</div></section>
     <section className="dashboard-section today-plan" onDragOver={(event) => event.preventDefault()} onDrop={() => requestPlanMove(today.id, today.tasks.length)}><p className="today-date">today</p><InlineEdit type="date" value={today.date} displayValue={formatPlanDate(today.date)} onSave={(date) => updatePlanDay(today.id, { date })} validate={(date) => isValidDateValue(date) ? '' : 'Use a real date.'} className="today-full-date" ariaLabel="Edit today’s plan date" /><p className="plan-label">today’s plan</p>{renderTasks(today.tasks, today.id)}</section>
    {today.protected_time.length > 0 && <section className="dashboard-section protected-section"><p className="plan-label">protected</p>{today.protected_time.map((item) => <p className="protected-item" key={item.id}>♡ <InlineEdit value={getText(item)} onSave={(description) => updateProtectedTime(today.id, item.id, { description })} className="protected-edit" ariaLabel="Edit protected time" /></p>)}</section>}
     {upcomingAnchors.length > 0 && <section className="dashboard-section upcoming-section"><p className="plan-label">upcoming</p>{upcomingAnchors.map((anchor) => <div className="anchor-item" key={anchor.id}><InlineEdit value={getText(anchor)} onSave={(title) => updatePlanAnchor(anchor.dayId, anchor.id, { title })} className="anchor-edit" ariaLabel="Edit anchor" /><div className="editable-metadata"><InlineEdit type="date" value={anchor.date} displayValue={formatPlanDate(anchor.date)} onSave={(date) => updatePlanAnchor(anchor.dayId, anchor.id, { date })} validate={(date) => isValidDateValue(date) ? '' : 'Use a real date.'} className="metadata-edit" ariaLabel="Edit anchor date" /><InlineEdit type="time" value={anchor.time || ''} placeholder="add time" onSave={(time) => updatePlanAnchor(anchor.dayId, anchor.id, { time })} validate={(time) => isValidTimeValue(time) ? '' : 'Use a time like 09:30.'} className="metadata-edit" ariaLabel="Edit anchor time" /></div></div>)}</section>}
     {futureDays.length > 0 && <section className="future-days"><p className="plan-label">ahead</p>{futureDays.map((day) => <section className="future-day" key={day.id} onDragOver={(event) => event.preventDefault()} onDrop={() => requestPlanMove(day.id, day.tasks.length)}><div className="future-heading"><p className="future-date">{day.label || 'planned day'}</p><InlineEdit type="date" value={day.date} displayValue={formatPlanDate(day.date)} onSave={(date) => updatePlanDay(day.id, { date })} validate={(date) => isValidDateValue(date) ? '' : 'Use a real date.'} className="metadata-edit" ariaLabel="Edit planned day date" /></div><InlineEdit value={day.focus} placeholder="add a focus" onSave={(focus) => updatePlanDay(day.id, { focus })} className="day-focus-edit" ariaLabel="Edit day focus" />{renderTasks(day.tasks, day.id)}{day.protected_time.map((item) => <p className="protected-item" key={item.id}>♡ <InlineEdit value={getText(item)} onSave={(description) => updateProtectedTime(day.id, item.id, { description })} className="protected-edit" ariaLabel="Edit protected time" /></p>)}</section>)}</section>}
    {renderMoveDialog()}
  </div></main>
}

export default App
