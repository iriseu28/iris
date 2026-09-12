import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import { createAiProvider } from './services/aiProvider.js'
import { parseAiJson } from './domain/parseAiJson.js'
import { enforceTaskLineage } from './domain/lineage.js'
import {
  validateInterpretRequest,
  validateInterpretation,
  validatePlan,
  validatePlanRequest,
} from './domain/contracts.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({
  path: path.join(__dirname, '../.env')
})

const app = express()
const aiProvider = createAiProvider()

app.use(cors())
app.use(express.json())

const PORT = Number.parseInt(process.env.PORT || '3001', 10) || 3001
const DIST_PATH = path.join(__dirname, '../dist')

function sendApiError(res, error, fallbackMessage) {
  console.error(fallbackMessage, error)
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500
  res.status(statusCode).json({
    error: error?.publicMessage || fallbackMessage,
  })
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function addDays(date, amount) {
  const result = new Date(`${date}T00:00:00`)
  result.setDate(result.getDate() + amount)
  return result.toISOString().slice(0, 10)
}

function resolveRelativeDate(text, currentDate) {
  if (!currentDate || !DATE_PATTERN.test(currentDate) || !text) return null
  const value = text.toLowerCase()
  if (/\btoday\b/.test(value)) return { date: currentDate, displayRelative: 'today' }
  if (/\btomorrow\b/.test(value)) return { date: addDays(currentDate, 1), displayRelative: 'tomorrow' }

  const daysMatch = value.match(/\bin\s+(\d+)\s+days?\b/)
  if (daysMatch) return { date: addDays(currentDate, Number(daysMatch[1])), displayRelative: daysMatch[0] }

  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const weekdayMatch = value.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
  if (weekdayMatch) {
    const currentWeekday = new Date(`${currentDate}T00:00:00`).getDay()
    let offset = (weekdays.indexOf(weekdayMatch[1]) - currentWeekday + 7) % 7
    if (offset === 0) offset = 7
    return { date: addDays(currentDate, offset), displayRelative: weekdayMatch[0] }
  }

  return null
}

function itemText(item) {
  if (typeof item === 'string') return item
  return [item?.description, item?.task, item?.item, item?.action, item?.title, item?.name, item?.due, item?.due_date].filter(Boolean).join(' ')
}

function normalizeItemDate(item, currentDate) {
  const relative = resolveRelativeDate(itemText(item), currentDate)
  if (!relative) {
    if (item && typeof item === 'object' && !DATE_PATTERN.test(item.date || '') && DATE_PATTERN.test(item.due_date || '')) {
      return { ...item, date: item.due_date }
    }
    return item
  }
  const normalized = typeof item === 'string' ? { description: item } : { ...item }
  return { ...normalized, date: DATE_PATTERN.test(normalized.date || '') ? normalized.date : relative.date, displayRelative: normalized.displayRelative || relative.displayRelative }
}

function normalizeInterpretationDates(interpretation, currentDate) {
  if (!interpretation || !DATE_PATTERN.test(currentDate || '')) return interpretation
  return Object.fromEntries(Object.entries(interpretation).map(([category, items]) => [
    category,
    Array.isArray(items) ? items.map((item) => normalizeItemDate(item, currentDate)) : items,
  ]))
}

function attachAnchorDates(plan, interpretation, currentDate) {
  const knownAnchors = ['deadlines', 'events']
    .flatMap((category) => interpretation?.[category] || [])
    .filter((item) => DATE_PATTERN.test(item?.date || item?.due_date || ''))

  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      anchors: (day.anchors || []).map((anchor) => {
        const title = itemText(anchor).toLowerCase()
        const matched = knownAnchors.find((item) => {
          const words = itemText(item).toLowerCase().split(/\W+/).filter((word) => word.length > 3)
          return words.some((word) => title.includes(word))
        })
        return {
          ...anchor,
          date: DATE_PATTERN.test(anchor?.date || '') ? anchor.date : matched?.date || matched?.due_date || day.date || currentDate,
          ...(matched?.displayRelative && !anchor.displayRelative ? { displayRelative: matched.displayRelative } : {}),
        }
      }),
    })),
  }
}

function ensureGenericTestPreparation(plan, interpretation) {
  const test = ['deadlines', 'events']
    .flatMap((category) => interpretation?.[category] || [])
    .find((item) => /\b(test|exam)\b/i.test(itemText(item)) && DATE_PATTERN.test(item?.date || ''))

  if (!test) return plan

  const testText = itemText(test)
  const userSuppliedTopics = /\b(chapter|topic|unit|syllabus|formula)\b/i.test(testText)
  const modelInventedSpecificity = plan.days.some((day) => (day.tasks || []).some((task) => /\bchapter\b|\b\d+\s+(?:practice problems|problems|weak concepts)\b|\bformulas?\b|\b\d+\s+minutes?\b/i.test(task.description || '')))
  if (userSuppliedTopics || !modelInventedSpecificity) return plan

  const subject = testText.replace(/\bin\s+\d+\s+days?\b/ig, '').replace(/\b(test|exam)\b/ig, '').trim() || 'test'
  const source = `${subject} test`.replace(/\s+/g, ' ').trim()
  const stepsFor = (date) => {
    const daysUntil = Math.round((new Date(`${test.date}T00:00:00`) - new Date(`${date}T00:00:00`)) / 86400000)
    if (daysUntil <= 0) return ['Do a light recall of the material if it feels useful.']
    if (daysUntil === 1) return [
      'Review the weak areas you identified.',
      'Practice representative problems without immediately looking at the solution.',
      'Check mistakes and revisit the concepts behind them.',
      'Make a short final-review list.',
    ]
    return [
      'Gather or open the material you already have.',
      'Review the material once and mark anything that feels unclear.',
      'Practice a few representative problems.',
    ]
  }

  return {
    ...plan,
    days: plan.days.map((day) => {
      const otherTasks = (day.tasks || []).filter((task) => !new RegExp(subject, 'i').test(`${task.source || ''} ${task.description || ''}`))
      const testTasks = stepsFor(day.date).map((description) => ({
        description,
        source,
        reason: 'Supports your upcoming test without assuming a syllabus.',
      }))
      return { ...day, tasks: [...otherTasks, ...testTasks] }
    }),
  }
}

/* -------------------------------------------------------
   INTERPRETATION
------------------------------------------------------- */

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.post('/api/interpret', async (req, res) => {
  try {
    const { brainDump, currentDate, currentTime, reviewedInterpretation } = validateInterpretRequest(req.body)

    const systemPrompt = `
You are Iris, an executive-function assistant for a student.

Your job in this step is to INTERPRET the user's brain dump.

Do NOT make a schedule yet.
Do NOT create a day-by-day plan yet.

Instead, organize what the user said into these categories:

tasks
deadlines
events
reminders
routines
notes
ideas
non_negotiables
questions

IMPORTANT RULES:

1. Do not treat every line as a separate task.
2. Preserve relationships between pieces of information.
3. Do not invent facts, dates, times, deadlines, priorities, chapters, subjects, or commitments.
4. Classify things semantically.
5. A task is something the user needs to do.
6. Something with a due date/deadline belongs in deadlines.
7. Something happening at a particular date/time belongs in events.
8. An explicit "remind me" request belongs in reminders.
9. Something the user says they repeatedly do belongs in routines.
10. Useful information that is not an action belongs in notes.
11. A possible future thing belongs in ideas.
12. Something the user explicitly says they need to protect, must have, cannot sacrifice, or really need belongs in non_negotiables.
13. If the user expresses uncertainty using phrases like "I think", "maybe", "probably", preserve that uncertainty.
14. Relative dates such as "tomorrow", "in 2 days", "next Friday", etc. should be interpreted using the current date supplied below.
15. If the user says they have an upcoming test/exam/deadline, preserve it as an anchor. Do not invent what is being tested.
16. "I really need an hour to do absolutely nothing" is a non_negotiable, not a task.
17. Do not add motivational fluff.
18. Every top-level category must be present, even if empty.
19. Return ONLY valid JSON. No markdown. No explanation outside the JSON.
20. If a previously reviewed interpretation is supplied, preserve every reviewed item,
    including its category, text, date, time, and id. Do not silently drop or reclassify
    reviewed items. Apply clarification answers only where they add information.

Current date: ${currentDate || 'unknown'}
Current time: ${currentTime || 'unknown'}

Return exactly this structure:

{
  "tasks": [],
  "deadlines": [],
  "events": [],
  "reminders": [],
  "routines": [],
  "notes": [],
  "ideas": [],
  "non_negotiables": [],
  "questions": []
}
`

    const content = await aiProvider.interpret([
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: [
          brainDump.trim(),
          reviewedInterpretation
            ? `Previously reviewed interpretation (preserve these items):\n${JSON.stringify(reviewedInterpretation, null, 2)}`
            : '',
        ].filter(Boolean).join('\n\n'),
      },
    ])

    const validated = validateInterpretation(parseAiJson(content))
    const interpretation = normalizeInterpretationDates(validated, currentDate)

    res.json(interpretation)
  } catch (error) {
    sendApiError(res, error, 'Interpretation request failed')
  }
})

/* -------------------------------------------------------
   PLANNING
------------------------------------------------------- */

app.post('/api/plan', async (req, res) => {
  try {
    const { interpretation, currentDate, currentTime } = validatePlanRequest(req.body)

    const systemPrompt = `
You are Iris, an executive-function planning assistant for a student.

The user has ALREADY reviewed and corrected an AI interpretation of their brain dump.

Your job now is to turn that corrected interpretation into a realistic, actionable plan.

This is NOT another interpretation step.

The corrected interpretation is the SOURCE OF TRUTH.

CURRENT DATE:
${currentDate || 'unknown'}

CURRENT TIME:
${currentTime || 'unknown'}

CORE PRINCIPLES:

1. Turn large or vague tasks into small actionable steps when doing so is useful.
2. Do NOT leave an important upcoming deadline as one giant task if it can reasonably be broken into steps.
3. Work BACKWARD from deadlines and important events.
4. Deadlines and events are ANCHORS, not tasks themselves.
5. Do not invent chapters, topics, assignments, materials, dates, times, or requirements that the user never mentioned.
6. If the user says they have a test in 2 days but gives no syllabus/topics, create GENERIC but genuinely useful preparation steps such as:
   - review the material
   - identify weak areas
   - practice representative problems
   - review mistakes
   - final recall/review
   Do not invent specific chapters.
7. If the user gives specific topics, use those topics.
8. If a task is due Friday and today is Wednesday, distribute the work across Wednesday and Thursday rather than putting everything on Friday.
9. Avoid packing every available hour with work.
10. Respect non_negotiables.
11. Do not schedule over an event.
12. Do not turn non_negotiables into productivity tasks.
13. Do not invent exact study durations unless the user provided one. You may use reasonable approximate durations only when necessary, and label them as estimates.
14. Prefer a small number of meaningful actions per day over a huge checklist.
15. Each action should be something the user can actually DO.
16. Use the user's existing tasks as the basis for planning.
17. If an existing task is already sufficiently small, do not unnecessarily split it.
18. Plans should be forgiving: if a day is missed, the remaining work should still be recoverable.
19. Do not create plans for dates before the current date.
20. Include today and future dates only when something needs to happen.
21. If there is an upcoming test/deadline, make the sequence progressively more useful:
    understand/review → practice → identify weaknesses → fix weaknesses → final review.
22. Do not claim that something is completed.
23. Never use vague tasks such as "study physics", "prepare for the test", or "work on it" when a test is involved. Each task must name a concrete action (review material, mark unclear areas, practice representative problems, correct mistakes, or recall key points).
24. Dates in the corrected interpretation are normalized source-of-truth dates. Use them exactly; do not replace them with a relative phrase.
25. For planned tasks, include priority only when supported by the corrected interpretation. Use exactly "urgent", "important", or "normal", or return null when unsupported.
26. Include estimated_minutes only when a reasonable approximate effort is supported. Use a non-negative whole number of minutes, never false precision, or return null when unsupported.
27. Preserve source_id only when it exactly matches an existing normalized interpretation item id from the corrected interpretation. Never invent source ids. Include source_category when source_id is present.
28. Return ONLY valid JSON.

IMPORTANT EXAMPLE:

If the interpretation says:

"test in 2 days"

do NOT return:

"Study for test"

Instead return something like:

today:
- Review the material you already have.
- Mark concepts that feel unclear.
- Do a few representative practice problems.

tomorrow:
- Review the weak concepts identified today.
- Practice without looking at notes.
- Correct mistakes and make a short final-review list.

test day:
- Only a light recall/review if useful.

But ONLY include the test-day step if it makes sense from the available information.

OUTPUT FORMAT:

{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "label": "today",
      "focus": "short description of the day's main focus",
      "tasks": [
        {
          "description": "specific actionable step",
          "source": "what original task/deadline this supports",
          "reason": "brief explanation of why this belongs today",
          "priority": null,
          "estimated_minutes": null,
          "source_id": null,
          "source_category": null
        }
      ],
      "anchors": [
        {
          "type": "deadline or event",
          "title": "anchor title",
          "date": "YYYY-MM-DD",
          "displayRelative": "original relative wording if useful, otherwise empty string",
          "time": "time if known, otherwise empty string"
        }
      ],
      "protected_time": [
        {
          "description": "protected time from the user's non-negotiables"
        }
      ]
    }
  ]
}
`

    const userPrompt = `
Here is the user's corrected interpretation:

${JSON.stringify(interpretation, null, 2)}

Build the plan from this information.
`

    const content = await aiProvider.plan([
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ])

    const validated = validatePlan(parseAiJson(content), { allowMissingAnchorDate: true })
    const plan = validatePlan(
      enforceTaskLineage(
        ensureGenericTestPreparation(
          attachAnchorDates(validated, interpretation, currentDate),
          interpretation
        ),
        interpretation,
      ),
    )

    validatePlan(plan)

    res.json(plan)
  } catch (error) {
    sendApiError(res, error, 'Planning request failed')
  }
})

/* -------------------------------------------------------
   SERVER
------------------------------------------------------- */

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Iris API route not found.' })
})

if (fs.existsSync(DIST_PATH)) {
  app.use(express.static(DIST_PATH))
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(DIST_PATH, 'index.html'), (error) => {
      if (error) next()
    })
  })
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Iris server running on port ${PORT}`)
})
