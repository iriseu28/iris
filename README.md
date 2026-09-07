# Iris

Iris is an AI-powered executive-function operating system for students. It helps a student brain-dump naturally, turns that input into a reviewable interpretation, and creates a forgiving, editable plan. Iris is not intended to become a conventional todo-list app.

The current vertical slice is:

```text
brain dump → AI interpretation → human correction → AI planning → editable dashboard
```

## Technology stack

- React
- Vite
- JavaScript
- Node.js
- Express
- OpenRouter
- Git/GitHub

The application does not use Replit-specific runtime APIs or a Replit database.

## Repository structure

```text
src/
  App.jsx                 Main Iris workflow and dashboard
  App.css                 Iris-specific styles
  index.css               Global styles
  components/InlineEdit   Reusable inline editing control
  lib/irisState.js        Client normalization and localStorage persistence

server/
  index.js                Express routes, prompts, date handling, and plan validation
  services/aiProvider.js  Provider boundary; OpenRouter is the current implementation

public/                   Static public assets
```

`IRIS_SPEC.md` is the product specification. `AGENTS.md` contains engineering guidance for preserving the product direction and portability.

## Prerequisites

- Node.js 18 or newer
- npm
- An OpenRouter API key for interpretation and planning

## Install dependencies

```bash
npm install
```

## Environment variables

Copy `.env.example` to `.env` for local development:

```bash
cp .env.example .env
```

Required:

- `OPENROUTER_API_KEY` — server-side OpenRouter credential

Optional:

- `OPENROUTER_MODEL` — defaults to `openai/gpt-oss-20b`
- `OPENROUTER_API_URL` — defaults to OpenRouter's chat completions endpoint
- `PORT` — Express port; defaults to `3001` locally
- `VITE_API_URL` — an alternate API base URL. Leave empty for same-origin production requests and the Vite development proxy.
- `VITE_API_BASE_URL` — legacy frontend alias accepted for compatibility

Never commit `.env` or place an API key in a `VITE_*` variable. Vite variables are available to browser code.

## Development

Run the frontend and backend together:

```bash
npm run dev:all
```

This starts:

- Vite at `http://localhost:5173`
- Express at `http://localhost:3001`

Vite proxies `/api/*` requests to the local Express server. The browser therefore uses relative API paths by default and does not contain a permanent production dependency on `localhost`.

You can also run the processes separately:

```bash
npm run dev       # frontend
npm run server    # backend
```

## Production build and start

Build the frontend:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

The Express server uses `PORT` when supplied, serves the built frontend from `dist/`, and serves the API from the same origin. A production host only needs to expose the configured Express port and provide `OPENROUTER_API_KEY`.

## API endpoints

### `GET /api/health`

Returns:

```json
{ "status": "ok" }
```

### `POST /api/interpret`

Accepts a brain dump and local date/time context. Returns categorized interpretation data.

### `POST /api/plan`

Accepts the human-reviewed interpretation and local date/time context. Returns a date-based plan.

The server keeps OpenRouter request details and credentials behind `server/services/aiProvider.js`. Application routes do not need to know the provider URL or request format.

## Persistence

The current app stores the active brain dump, interpretation, plan, and completed task IDs in browser `localStorage` under the versioned key `iris-state-v1`.

There is currently no account system, database, cloud synchronization, or cross-device persistence.

## Current AI provider

OpenRouter is the current AI provider. The provider model and endpoint are environment-configurable, while the application-level interpretation and planning prompts remain in the Express application.

## Portability and deployment notes

- The frontend and backend use standard React, Vite, Node.js, Express, and HTTP.
- No application logic depends on Replit runtime APIs.
- Local development uses Vite's proxy; production uses one Express origin.
- AI credentials remain server-side.
- `PORT` is configurable for hosts that assign ports dynamically.
- Browser-local state can be replaced later through a storage adapter without introducing a platform-specific database.
- GitHub remains the durable source of truth.

## Available checks

```bash
npm run lint
npm run build
git diff --check
```
