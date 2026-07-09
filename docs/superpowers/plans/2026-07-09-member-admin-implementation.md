# Member Admin Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a server-backed member editing workflow for the people page, with Express, SQLite, admin authentication, API-first frontend data loading, and in-page create/edit/delete controls.

**Architecture:** Keep the Vue/Vite frontend on GitHub Pages and add a `server/` Express service in the same repository. The backend owns SQLite persistence and authenticated writes; the frontend reads API data first and falls back to compiled member data when the API is unavailable.

**Tech Stack:** Vue 3, Vite, TypeScript, Express, SQLite via Node's built-in `node:sqlite`, JWT via `jsonwebtoken`, password hashing with Node `crypto`, backend tests with Node's built-in test runner and Supertest.

## Global Constraints

- Frontend API base URL is configured by `VITE_API_BASE_URL`.
- Backend deploys to the lab server on port `3001` and is exposed by `https://api.scs-happycv.top`.
- SQLite is the production source of truth after import.
- Existing compiled student data remains as public fallback when the backend is unavailable.
- Admin passphrase verification happens on the backend; frontend must not rely on exposed password hashes for write access.
- Login remains long-lived in the current browser.
- Member photos are edited as URL text only; no upload support in this version.
- Editing is in the people page, not a separate admin page.
- PM2 is the backend process manager.

---

## File Structure

- `server/package.json`: backend package scripts and dependencies.
- `server/tsconfig.json`: backend TypeScript config.
- `server/vitest.config.ts`: backend test config if Vitest is needed; prefer Node test runner if package support is sufficient.
- `server/src/types.ts`: shared backend member/auth types.
- `server/src/config.ts`: environment parsing.
- `server/src/db.ts`: SQLite connection and schema initialization.
- `server/src/auth.ts`: passphrase hashing, login token signing, auth middleware.
- `server/src/students.repo.ts`: SQLite CRUD and validation helpers.
- `server/src/students.routes.ts`: public and admin student routes.
- `server/src/index.ts`: Express app factory and server startup.
- `server/scripts/import-students.ts`: one-time import from existing frontend TS data.
- `server/.env.example`: deployment config template.
- `server/ecosystem.config.cjs`: PM2 config.
- `src/utils/api.ts`: frontend API client.
- `src/utils/useAuth.ts`: adapt current auth composable to backend login/token.
- `src/pages/PeoplePage.vue`: API loading, fallback, add/edit/delete UI.
- `README.md`: document backend setup and deployment.

## Task 1: Backend Project Scaffold And App Factory

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/config.ts`
- Create: `server/src/types.ts`
- Create: `server/src/index.ts`
- Create: `server/test/app.test.ts`

**Interfaces:**
- Produces: `createApp(options?: Partial<AppOptions>): express.Express`
- Produces: `loadConfig(): ServerConfig`

- [ ] Write failing health-check test in `server/test/app.test.ts`.
- [ ] Run `npm test` inside `server` and verify the health-check test fails because `createApp` does not exist.
- [ ] Add the backend package, TypeScript config, environment config, type definitions, and Express app factory.
- [ ] Re-run `npm test` inside `server` and verify the health-check test passes.
- [ ] Commit with `feat: scaffold member admin api`.

## Task 2: SQLite Repository And Validation

**Files:**
- Create: `server/src/db.ts`
- Create: `server/src/students.repo.ts`
- Create: `server/test/students.repo.test.ts`

**Interfaces:**
- Consumes: `StudentRecord` from `server/src/types.ts`
- Produces: `createStudentRepository(db: Database): StudentRepository`
- Produces: `initDatabase(db: Database): void`

- [ ] Write failing repository tests for insert/list/update/delete and required-field validation.
- [ ] Run repository tests and verify failure because the repository module does not exist.
- [ ] Implement SQLite schema creation, JSON array serialization, CRUD methods, and validation errors.
- [ ] Re-run repository tests and verify they pass.
- [ ] Commit with `feat: add sqlite student repository`.

## Task 3: Backend Auth And Protected Routes

**Files:**
- Create: `server/src/auth.ts`
- Modify: `server/src/index.ts`
- Create: `server/test/auth.test.ts`

**Interfaces:**
- Consumes: `ServerConfig`
- Produces: `hashPassphrase(passphrase: string): string`
- Produces: `createAuthService(config: ServerConfig): AuthService`
- Produces: `requireAdmin(authService: AuthService): express.RequestHandler`

- [ ] Write failing tests for login success, login failure, token verification, and protected write rejection without token.
- [ ] Run auth tests and verify failure because auth is not implemented.
- [ ] Implement SHA-256 passphrase hashing, JWT signing/verification, `POST /auth/login`, `GET /auth/me`, and admin middleware.
- [ ] Re-run auth tests and verify they pass.
- [ ] Commit with `feat: add admin authentication`.

## Task 4: Student API Routes

**Files:**
- Create: `server/src/students.routes.ts`
- Modify: `server/src/index.ts`
- Create: `server/test/students.routes.test.ts`

**Interfaces:**
- Consumes: `StudentRepository`
- Consumes: `requireAdmin`
- Produces: `createStudentRouter(deps: StudentRouterDeps): express.Router`

- [ ] Write failing route tests for public list, create, update, delete, validation error, and auth-required behavior.
- [ ] Run route tests and verify failure because student routes are not registered.
- [ ] Implement `GET /students`, `POST /students`, `PUT /students/:id`, and `DELETE /students/:id`.
- [ ] Re-run route tests and verify they pass.
- [ ] Commit with `feat: expose student management api`.

## Task 5: Import Script And Backend Deployment Files

**Files:**
- Create: `server/scripts/import-students.ts`
- Create: `server/.env.example`
- Create: `server/ecosystem.config.cjs`
- Modify: `server/package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: frontend student modules under `src/data/students/years/*.ts`
- Produces: `npm run db:import`

- [ ] Write a failing smoke test or script dry-run check proving import creates a database from existing student data.
- [ ] Run the check and verify failure because the import script does not exist.
- [ ] Implement import script, PM2 config, environment example, scripts, and gitignore rules for SQLite runtime files.
- [ ] Re-run the import check and verify it passes.
- [ ] Commit with `feat: add student data import and pm2 config`.

## Task 6: Frontend API Client And Auth Composable

**Files:**
- Create: `src/utils/api.ts`
- Modify: `src/utils/useAuth.ts`

**Interfaces:**
- Produces: `memberApi.listStudents(): Promise<StudentProfile[]>`
- Produces: `memberApi.login(password: string): Promise<void>`
- Produces: `memberApi.createStudent(member: StudentProfile): Promise<StudentProfile>`
- Produces: `memberApi.updateStudent(id: string, member: StudentProfile): Promise<StudentProfile>`
- Produces: `memberApi.deleteStudent(id: string): Promise<void>`
- Keeps: `useAuth()` returning `{ isMember, verify, logout }`

- [ ] Write failing tests or type-check fixtures for API base URL construction, token storage, and login integration.
- [ ] Run the check and verify failure because the API client does not exist.
- [ ] Implement the API client and update `useAuth` so `verify()` calls backend login and stores the long-lived token.
- [ ] Re-run the checks and verify they pass.
- [ ] Commit with `feat: connect frontend auth to member api`.

## Task 7: People Page API Loading And Fallback

**Files:**
- Modify: `src/pages/PeoplePage.vue`

**Interfaces:**
- Consumes: `memberApi.listStudents()`
- Keeps: fallback import `studentProfiles`

- [ ] Write a failing test or build-time check for API data source state and fallback behavior.
- [ ] Run the check and verify failure because `PeoplePage` still only uses compiled data.
- [ ] Add reactive `members`, loading/error state, API fetch on mount, and computed filters based on the active members array.
- [ ] Re-run the check and verify it passes.
- [ ] Commit with `feat: load people data from api with fallback`.

## Task 8: In-Page Member Editing UI

**Files:**
- Modify: `src/pages/PeoplePage.vue`
- Create if needed: `src/components/MemberEditor.vue`

**Interfaces:**
- Consumes: `memberApi.createStudent`, `memberApi.updateStudent`, `memberApi.deleteStudent`
- Produces: add/edit/delete controls visible only when `isMember` is true

- [ ] Write failing tests or type-check checks for editor form data conversion and save/delete handlers.
- [ ] Run the check and verify failure because editing controls do not exist.
- [ ] Implement add, edit, delete controls; editor dialog/drawer; array fields as one item per line; delete confirmation; list refresh after saves.
- [ ] Re-run the check and verify it passes.
- [ ] Commit with `feat: add in-page member editor`.

## Task 9: Documentation And End-To-End Verification

**Files:**
- Modify: `README.md`
- Modify if needed: `.env`
- Modify if needed: `vite.config.ts`

**Interfaces:**
- Consumes: all prior tasks
- Produces: clear local and server deployment instructions

- [ ] Update README with backend local run, import, PM2 deployment, env vars, and frontend `VITE_API_BASE_URL`.
- [ ] Run backend tests.
- [ ] Run frontend build.
- [ ] Run backend build.
- [ ] Start backend locally and verify `GET /health`.
- [ ] Commit with `docs: document member admin deployment`.
