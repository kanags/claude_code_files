# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Initial setup (install deps, generate Prisma client, run migrations)
npm run setup

# Development server (http://localhost:3000)
npm run dev

# Development server in background (logs to logs.txt)
npm run dev:daemon

# Build for production
npm run build

# Run all tests
npm test

# Run a single test file
npx vitest run src/components/chat/__tests__/ChatInterface.test.tsx

# Lint
npm run lint

# Reset database (destructive)
npm run db:reset
```

**Package installs:** Always use `--legacy-peer-deps` when installing packages manually (`npm install <pkg> --legacy-peer-deps`). The `setup` script already includes this flag.

**Windows note:** All scripts use `cross-env` to set `NODE_OPTIONS=--require ./node-compat.cjs`. This shim removes `globalThis.localStorage/sessionStorage` on the server to fix SSR errors caused by Node 25's experimental Web Storage API.

## Architecture Overview

UIGen is an AI-powered React component generator with a live in-browser preview. The user describes a component in chat; Claude generates it using tool calls that operate on a **virtual file system** (in-memory, never touches disk); the result is compiled in the browser via Babel and rendered in an `<iframe>`.

### Data flow

```
User message
  → POST /api/chat  (route.ts)
    → Vercel AI SDK streamText  (up to 40 steps)
      → str_replace_editor / file_manager tools  (server side)
        → VirtualFileSystem mutations
      → tool call events streamed to client
        → FileSystemContext.handleToolCall  (client side mirrors mutations)
          → refreshTrigger increment
            → PreviewFrame re-renders iframe via jsx-transformer
```

### Key subsystems

**Virtual File System** (`src/lib/file-system.ts`)
`VirtualFileSystem` is a class holding a `Map<string, FileNode>`. It lives both on the server (in the API route, reconstructed from the serialized `files` in each request body) and on the client (inside `FileSystemContext`). The two copies are kept in sync by replaying every tool call on the client. `serialize()` / `deserializeFromNodes()` convert between the class and plain JSON for transport.

**AI Tools** (`src/lib/tools/`)
- `str_replace_editor` — view/create/str_replace/insert operations on the VFS, matching the Anthropic text-editor tool interface.
- `file_manager` — rename and delete.

**JSX Preview** (`src/lib/transform/jsx-transformer.ts`)
Uses `@babel/standalone` in the browser to transpile JSX/TSX. Builds an ES module import map so relative imports between virtual files resolve correctly using `blob:` URLs. Strips CSS imports. Falls back to placeholder components for unresolved imports.

**Contexts** (`src/lib/contexts/`)
- `FileSystemProvider` — wraps `VirtualFileSystem`, exposes file ops, owns `refreshTrigger` (a counter that causes `PreviewFrame` to rebuild).
- `ChatProvider` — wraps Vercel AI SDK's `useChat`, passes `files` (serialized VFS) and optional `projectId` in every request body, calls `handleToolCall` on each streaming tool call.

**Server Actions** (`src/actions/`)
Next.js Server Actions for project CRUD: `createProject`, `getProject`, `getProjects`. These require an authenticated session and call Prisma directly. Used by client components that need to save or load projects.

**Auth** (`src/lib/auth.ts`, `src/middleware.ts`)
JWT stored in an `httpOnly` cookie (`auth-token`). `getSession()` is server-only (uses Next.js `cookies()`). `verifySession()` is used in middleware and accepts a `NextRequest`. Only `/api/projects` and `/api/filesystem` are protected.

**AI Provider** (`src/lib/provider.ts`)
`getLanguageModel()` returns `anthropic("claude-haiku-4-5")` when `ANTHROPIC_API_KEY` is set, otherwise a `MockLanguageModel` that streams canned responses. The app is fully functional without an API key.

**Persistence** (`prisma/schema.prisma`)
SQLite via Prisma. Two models: `User` (email + bcrypt password) and `Project` (stores `messages` and `data` as JSON strings). `userId` is optional on `Project` to allow anonymous sessions to be upgraded later. The Prisma client is generated into `src/generated/prisma/`.

**Anonymous work tracking** (`src/lib/anon-work-tracker.ts`)
Uses `sessionStorage` (`uigen_has_anon_work`, `uigen_anon_data`) to preserve an anonymous user's messages + VFS so they can be saved after signing up.

### Route structure

| Path | Description |
|------|-------------|
| `/` | Home — anonymous chat with no persistence |
| `/[projectId]` | Persisted project loaded from DB, chat continues with existing messages |
| `/api/chat` | Streaming POST — runs AI with tools, optionally saves to DB on finish |

### Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `ANTHROPIC_API_KEY` | No | Falls back to mock provider if absent |
| `JWT_SECRET` | No | Defaults to `"development-secret-key"` |

### VFS generation conventions

The system prompt (`src/lib/prompts/generation.tsx`) constrains what the AI generates into the VFS:
- Entry point must be `/App.jsx` with a default export
- All inter-file imports use the `@/` alias (e.g. `@/components/Foo`)
- Styling via Tailwind only — no hardcoded styles or CSS files
- No HTML files; the VFS is a virtual root, not a traditional filesystem

These conventions are enforced by the AI prompt, not by the transformer. Changing them requires updating `generationPrompt`.

### Testing

Tests use Vitest + jsdom + `@testing-library/react`. Test files sit in `__tests__/` folders co-located with the code they test. The vitest config (via `vite-tsconfig-paths`) resolves `@/` path aliases identically to the Next.js app.
