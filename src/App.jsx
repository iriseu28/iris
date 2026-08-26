import { useState } from 'react'
import './App.css'

function App() {
  const [task, setTask] = useState('')
  const [items, setItems] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)

  function organizeTasks() {
    if (!task.trim()) return

   setItems({
  tasks: [
    {
      title: task,
      status: 'needs-ai'
    }
  ],
  deadlines: [],
  events: [],
  reminders: [],
  routines: [],
  notes: [],
  ideas: []
})
  }

  return (
    <main className="app">
      <div className="card">
        <p className="eyebrow">iris</p>

        {!items ? (
          <>
            <h1>what should you do right now?</h1>

            <p className="subtitle">
              tell me everything that's on your mind.
            </p>

            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="brain dump here..."
            />

            <button onClick={organizeTasks}>
              help me figure it out →
            </button>
          </>
        ) : (
          <>
            <h1>okay. let's make this less overwhelming.</h1>

            <section className="task-section">
              <h2>🧠 iris understood</h2>
              <div className="preview-grid">
  <div className="preview-item">
    <strong>📋 tasks</strong>
    <span>things you need to do</span>
  </div>

  <div className="preview-item">
    <strong>📅 deadlines</strong>
    <span>things that have a due date</span>
  </div>

  <div className="preview-item">
    <strong>🗓️ events</strong>
    <span>things happening at a specific time</span>
  </div>

  <div className="preview-item">
    <strong>🔔 reminders</strong>
    <span>things Iris should remember</span>
  </div>

  <div className="preview-item">
    <strong>🔄 routines</strong>
    <span>things that repeat</span>
  </div>

  <div className="preview-item">
    <strong>💭 notes & ideas</strong>
    <span>things worth remembering</span>
  </div>
</div>

              <p className="subtitle">
                your brain dump will eventually be intelligently
                separated into tasks, deadlines, events, reminders,
                routines, notes and ideas.
              </p>
            </section>

            <button onClick={() => setItems(null)}>
              ← new brain dump
            </button>
          </>
        )}

        {selectedTask && (
          <div className="action-panel">
            <p>what do you want to do with:</p>
            <h2>{selectedTask}</h2>

            <button onClick={() => alert(`starting: ${selectedTask}`)}>
              ▶ start now
            </button>

            <button onClick={() => alert(`breaking down: ${selectedTask}`)}>
              ✨ break it down
            </button>

            <button onClick={() => alert(`postponing: ${selectedTask}`)}>
              ⏰ postpone
            </button>

            <button onClick={() => setSelectedTask(null)}>
              close
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

export default App
