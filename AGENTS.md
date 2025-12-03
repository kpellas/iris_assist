# Repository Guidelines

## Project Structure & Module Organization
- Root workspaces: `backend` (Lambda service + Alexa handler), `ipad-app` (Vite/React UI), `local-agent` (Playwright-powered desktop automation), `alexa-skill` (ASK skill assets).
- Back-end code lives in `backend/src` with `handlers/` for Alexa intents and `services/` for domain logic; database scripts in `backend/src/database/`.
- Frontend UI lives in `ipad-app/src` with Vite entrypoints; assets in `ipad-app/public`.
- Local agent lives in `local-agent/src`; browser automation flows belong in `automation/` or feature folders by target site.

## Build, Test, and Development Commands
- Install all workspaces: `npm run setup` from repo root.
- Backend: `npm run dev:backend` for hot reload (TSX), `npm run build:backend` for production bundles, `npm run deploy` to push via Serverless, `npm run test:backend` for Jest.
- iPad app: `npm run dev:ipad` for Vite dev server, `npm run build:ipad` for production build, `npm run test` inside `ipad-app` for Vitest, `npm run lint` for ESLint.
- Local agent: `npm run dev:local` for TSX watch, `npm run build` inside `local-agent`, `npm test` there for Jest.
- Database: `cd backend && npm run db:migrate` (or `db:seed`) against the configured Postgres/pgvector instance.

## Coding Style & Naming Conventions
- Language: TypeScript everywhere; `tsconfig` is `strict`. Favor explicit types on public exports and service boundaries.
- Linting/formatting: ESLint runs in `ipad-app`; mirror its rules (React hooks, TypeScript ESLint). Keep 2-space indentation and single quotes unless tooling says otherwise.
- Naming: use `camelCase` for functions/vars, `PascalCase` for React components and classes, and align file names with primary export (e.g., `MemoryService.ts`, `ProtocolList.tsx`).

## Testing Guidelines
- Frameworks: Jest in `backend` and `local-agent`; Vitest in `ipad-app`.
- Place unit tests alongside code or in `__tests__` folders; name with `.test.ts`/`.test.tsx`.
- Aim to cover Alexa intent handlers, service logic (memory/protocol/task flows), and automation scripts. Prefer fast, deterministic tests; mock external APIs and secrets.

## Commit & Pull Request Guidelines
- Commits: concise, present-tense subjects; scope by package when helpful (e.g., `backend: tighten error logging`). Group related changes and keep noise low.
- PRs: include summary, screenshots for UI changes, and mention affected commands or migrations. Link issues/requests; note deployment steps (Serverless, ASK, or Vite build) and risk areas.

## Security & Configuration Tips
- Secrets live in `.env` files; never commit credentials or tokens. Use different profiles for local vs. production AWS/ASK.
- Verify CORS/WebSocket hosts before deploy; double-check pgvector migrations when changing embeddings.
- Local agent handles credentials; avoid logging sensitive automation data.
