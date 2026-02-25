# Dendro

A tree-structured LLM chat app. Instead of linear conversations, every message can branch into a new thread — letting you explore ideas non-linearly without losing context.

![Dendro screenshot](docs/screenshot.png)

## Features

- **Branching conversations** — select any text in a message to spawn a child branch with auto-generated context summary
- **3-column layout** — parent | active | first child; navigate the tree by clicking columns
- **SVG conversation map** — minimap with pan/zoom and expand modal; closed branches stay visible and can be reopened
- **Multi-provider LLM** — Gemini and OpenRouter models, switchable per conversation
- **Streaming responses** — SSE-based token streaming
- **Text selection popup** — Branch, Search, and Summarize-to-clipboard actions
- **Global settings** — system prompt, default models and verbosity for new conversations and branches, streaming on/off
- **Auth** — GitHub OAuth, Google OAuth, magic link email
- **LLM call log** (`/log`) and **activity feed** (`/activity`) — separate pages, both with cursor-based "Load more" pagination

## Tech stack

- [Nuxt 3](https://nuxt.com) + Vue 3 + Vite
- [Pinia](https://pinia.vuejs.org) for state
- [Tailwind CSS](https://tailwindcss.com)
- [Prisma](https://prisma.io) + SQLite (dev) / PostgreSQL (prod)
- [nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils)
- [@google/generative-ai](https://www.npmjs.com/package/@google/generative-ai) + OpenRouter

## Getting started

```bash
npm install
cp .env.example .env   # fill in your keys
npx prisma migrate dev --name init
npm run dev
```

## Environment variables

```env
DATABASE_URL=file:./dev.db
GEMINI_API_KEY=
NUXT_SESSION_PASSWORD=          # min 32 chars
NUXT_OAUTH_GITHUB_CLIENT_ID=
NUXT_OAUTH_GITHUB_CLIENT_SECRET=
NUXT_OAUTH_GOOGLE_CLIENT_ID=
NUXT_OAUTH_GOOGLE_CLIENT_SECRET=
OPENROUTER_API_KEY=             # optional
```

## Testing

There are two test scripts, both runnable with plain `node` (no test framework).

### `scripts/test-activity.mjs` — activity log unit test

Tests every activity log action type by writing entries directly through Prisma and verifying the stored payload shape. No HTTP server required.

```bash
node scripts/test-activity.mjs
```

Covers: `tree.created/renamed/deleted`, `conversation.created/closed/deleted`, `message.sent`, `context.built`, `command.executed` (local + remote), `url.scraped`, `url.removed`, `summary.prepared`, `settings.changed`, `file.uploaded/deleted`. Also verifies prefix filtering and cursor pagination logic.

---

### `scripts/test-features.mjs` — HTTP integration test

Drives every real API endpoint against a running dev server and asserts both the HTTP response shape and the corresponding `activityLog` DB entry (including the enriched title fields).

**Prerequisites:**

1. A user must exist in the DB with the email you'll use. Create one by signing in normally first (GitHub/Google/magic link).
2. Start the dev server with test mode enabled:

```bash
NUXT_TEST_MODE=1 npm run dev
```

**Run:**

```bash
# Standard run (no LLM calls, no command execution)
TEST_EMAIL=you@example.com node scripts/test-features.mjs

# With real LLM calls (sections §14 message send, §16 summarize)
TEST_EMAIL=you@example.com node scripts/test-features.mjs --with-llm

# With all tests including local command execution
TEST_EMAIL=you@example.com node scripts/test-features.mjs --with-llm --enable-exec
```

`TEST_EMAIL` defaults to `test@example.com` if not set.

**What it tests (in order):**

| § | Area | Endpoints |
|---|------|-----------|
| 1 | Auth | `POST /api/_test/session` |
| 2 | Trees — create | `POST /api/trees` |
| 3 | Trees — list | `GET /api/trees` |
| 4 | Trees — rename | `PATCH /api/trees/:id` |
| 5 | Conversations — create branch | `POST /api/conversations` |
| 6 | Context URLs — conversation add | `POST /api/conversations/:id/context-urls` |
| 7 | Context URLs — conversation remove | `DELETE /api/conversations/:id/context-urls` |
| 8 | Context URLs — tree add | `POST /api/trees/:id/context-urls` |
| 9 | Context URLs — tree remove | `DELETE /api/trees/:id/context-urls` |
| 10 | Files — upload | `POST /api/trees/:id/files` |
| 11 | Files — delete | `DELETE /api/trees/:id/files/:fileId` |
| 12 | Settings — read | `GET /api/settings` |
| 13 | Settings — update | `PATCH /api/settings` |
| 14 | Messages — send `--with-llm` | `POST /api/conversations/:id/messages` |
| 15 | Execute — local `--enable-exec` | `POST /api/execute` |
| 16 | Summarize `--with-llm` | `POST /api/summarize` |
| 17 | Activity log — filtering | `GET /api/activity?action=<prefix>` |
| 18 | Activity log — pagination | `GET /api/activity?before=<ISO>` |
| 19 | LLM log | `GET /api/log` (returns `{ entries, hasMore }`) |
| 20 | Conversation — close | `PATCH /api/conversations/:id` |
| 21 | Conversation — delete | `DELETE /api/conversations/:id` |
| 22 | Trees — soft-delete | `PATCH /api/trees/:id` (deletedAt) |
| 23 | Trees — hard-delete | `DELETE /api/trees/:id` |
| 24 | Cleanup | removes test DB entries |

Each section asserts the HTTP status, the response shape, and (where applicable) that the correct `activityLog` entry was written with the expected payload fields (including `treeTitle` and `conversationTitle`).

**Dev-only auth endpoint (`/api/_test/session`):**

The test script authenticates by POSTing an email to `/api/_test/session`, which sets a real iron-session cookie without going through OAuth. This endpoint only exists when `NUXT_TEST_MODE=1` is set — it returns 404 in production.

**Adding new tests:**

1. Add new sections to `scripts/test-features.mjs` following the existing pattern (section number comment, HTTP call via `apiJson`, `assert()` calls, optional `getLastActivity()` check).
2. If you add new `activityLog` action types, add them to the coverage list in `scripts/test-activity.mjs` section 14, and add a dedicated fixture section for the new action.
3. If you add new payload fields to existing actions, update both the server-side `logActivity(...)` call and the corresponding assertion in `test-activity.mjs`.
