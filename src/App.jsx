import { useState } from 'react'
import './App.css'

function App() {
  const [brainDump, setBrainDump] = useState('')
  const [interpretation, setInterpretation] = useState(null)

  function interpretBrainDump() {
    if (!brainDump.trim()) return

    setInterpretation({
      tasks: [],
      deadlines: [],
      events: [],
      reminders: [],
      routines: [],
      notes: [],
      ideas: [],
      non_negotiables: [],
      questions: []
    })
  }

  return (
    <main className="app">
      <div className="card">
        <p className="eyebrow">iris</p>

        {!interpretation ? (
          <>
            <h1>what's on your mind?</h1>

            <p className="subtitle">
              don't organize it. just tell me everything.
            </p>

            <textarea
              value={brainDump}
              onChange={(e) => setBrainDump(e.target.value)}
              placeholder="i have physics tomorrow and..."
            />

            <button onClick={interpretBrainDump}>
              help me figure it out →
            </button>
          </>
        ) : (
          <>
            <h1>here's what i understood.</h1>

            <p className="subtitle">
              i'll never assume something you didn't tell me.
            </p>

            <div className="preview-grid">
              <div className="preview-item">
                <strong>📋 tasks</strong>
                <span>things you need to do</span>
              </div>

              <div className="preview-item">
                <strong>📅 deadlines</strong>
                <span>things with due dates</span>
              </div>

              <div className="preview-item">
                <strong>🗓️ events</strong>
                <span>things happening at a time</span>
              </div>

              <div className="preview-item">
                <strong>🔔 reminders</strong>
                <span>things to remember</span>
              </div>

              <div className="preview-item">
                <strong>🔄 routines</strong>
                <span>things that repeat</span>
              </div>

              <div className="preview-item">
                <strong>🧠 non-negotiables</strong>
                <span>things Iris protects</span>
              </div>
            </div>

            <button onClick={() => setInterpretation(null)}>
              ← new brain dump
            </button>
          </>
        )}
      </div>
    </main>
  )
}

export default App