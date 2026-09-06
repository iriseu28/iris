# IRIS ENGINEERING INSTRUCTIONS

## source of truth

`IRIS_SPEC.md` is the authoritative product specification.

When implementing Iris, use `IRIS_SPEC.md` to determine intended product behavior.

Do not contradict it without explicitly identifying the conflict and asking for clarification.

## inspect before editing

Before changing code:

1. inspect the relevant existing implementation
2. understand the current state/data flow
3. identify dependencies between components
4. determine whether existing behavior must be preserved
5. then implement the change

Do not blindly rewrite files.

## preserve working functionality

Iris is being developed incrementally.

Do not remove existing functionality merely to make implementation easier.

When refactoring, preserve externally visible behavior unless the product specification explicitly calls for changing it.

## coherent feature slices

Prefer implementing complete, coherent feature slices instead of isolated cosmetic changes.

A feature should include, where appropriate:

- data/state model
- UI
- interaction behavior
- error handling
- persistence implications
- accessibility/basic usability
- tests or verification

Do not implement half of a feature if doing so would create confusing temporary behavior.

## user authority

Iris is an AI-assisted system, not an AI-controlled system.

The user is authoritative over their own tasks, dates, plans, priorities, and information.

AI-generated content is editable.

Never silently overwrite user-created or user-edited information.

Do not trigger expensive AI reinterpretation for ordinary manual edits unless explicitly required.

## stable entities

Use stable IDs for meaningful entities.

Never use array indexes as persistent identity.

Never use displayed text as identity.

Moving, editing, reordering, or categorizing an item must not accidentally turn it into a different entity.

## state architecture

Prefer explicit application state and domain models over scattered UI booleans.

As Iris grows, separate:

- domain data
- API communication
- workflow state
- UI state
- persistence

Avoid allowing one giant React component to become the permanent architecture.

Refactor when doing so materially improves maintainability.

## API boundaries

Keep AI-provider credentials server-side.

Never expose API keys to the browser.

Keep provider-specific logic behind the server API.

Validate data entering and leaving API boundaries.

Do not trust model output merely because it is valid JSON.

## AI output

AI output must be treated as untrusted external data.

Validate schemas.

Handle malformed responses gracefully.

Never allow a malformed model response to crash the application.

Do not depend on the model following formatting instructions perfectly.

## dates and time

Use normalized dates internally.

Respect the user's local timezone.

Do not silently reinterpret an explicit user date.

Relative dates should be resolved deterministically using the relevant local date/time.

Always distinguish between:

- an event
- a deadline
- a task
- a reminder

Do not turn anchors into tasks without a reason.

## editing

Manual editing should be lightweight.

Prefer inline editing for user-facing text where appropriate.

Editing an item should modify that item rather than recreate it.

Editing should preserve its stable ID and relevant metadata.

## drag and drop

Drag-and-drop should preserve the identity of the moved entity.

Confirm meaningful relocations before committing them when required by the product specification.

Cancellation must leave the previous state untouched.

## persistence

When implementing persistence:

- prefer simple reliable solutions first
- avoid unnecessary infrastructure
- preserve data across refreshes
- handle corrupted/missing stored data gracefully
- keep future cloud synchronization possible

Do not introduce a database merely because one exists as an option.

## UI

Preserve Iris's existing visual identity.

Do not replace the interface with a generic SaaS dashboard.

Prefer calm, spacious, human interfaces.

Avoid unnecessary complexity.

Interaction should communicate clearly what is editable, draggable, active, completed, or protected.

## testing

After meaningful code changes, run appropriate verification.

At minimum, when applicable:

`npm run lint`

`npm run build`

`git diff --check`

For interaction-heavy changes, perform a browser verification when possible.

Do not claim a feature works solely because the code compiles.

## dependencies

Do not add a dependency when the feature can reasonably be implemented using the existing stack.

When adding a dependency:

- explain why it is necessary
- prefer lightweight, well-maintained packages
- consider the project's low-cost constraint

## cost

Iris should remain extremely low-cost to develop.

Target total spend is approximately ₹500 or less.

Prefer existing free/student resources already available to the project.

## development communication

Before a large implementation:

1. summarize what you found
2. identify the implementation approach
3. identify potentially risky changes

For straightforward tasks, proceed without unnecessary questions.

After implementation, report:

- files changed
- behavior implemented
- tests/verification performed
- known limitations
- recommended next step

Do not claim success without verification.

## scope discipline

Do not implement every future Iris capability simply because it appears in `IRIS_SPEC.md`.

`IRIS_SPEC.md` contains both current product requirements and long-term direction.

Implement the requested milestone first.

Avoid speculative architecture that adds complexity without immediate value.

## current project

Current technology:

- React
- Vite
- JavaScript
- Node.js
- Express
- OpenRouter
- Git/GitHub

Do not migrate the project to another framework unless there is a compelling technical/product reason.
