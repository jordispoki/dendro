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
