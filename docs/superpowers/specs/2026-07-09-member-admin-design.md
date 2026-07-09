# Member Admin Editing Design

## Goal

Add a self-service editing workflow for the lab homepage people page. After an administrator enters the shared admin passphrase, they can create, edit, and delete all member records. Changes are saved to a backend data service so every public visitor sees the updated data.

## Current Context

The existing Vue/Vite site is a static GitHub Pages app. Member records are compiled into the frontend from `src/data/students/years/*.ts`, and `PeoplePage.vue` renders those records directly. The current authentication state is browser-local and unlocks private fields, but it does not provide server-side write protection.

The new design keeps the frontend static and adds a backend API under `server/`. The frontend will continue to be built and published to GitHub Pages, while the backend will run on the lab server at port `3001` and be reached through `https://api.scs-happycv.top`.

## Architecture

The repository will contain both applications:

```text
LabHomePage/
  src/                 # Existing Vue frontend
  public/
  docs/                # GitHub Pages build output
  server/              # New backend service
    src/
      index.ts
      db.ts
      auth.ts
      students.routes.ts
      students.repo.ts
    scripts/
      import-students.ts
    data/
      lab-homepage.db
    .env.example
    package.json
    tsconfig.json
    ecosystem.config.cjs
```

The public frontend reads members from the API first. If the API is unavailable, it falls back to the existing compiled student data so the people page remains usable during backend downtime.

The backend owns all persistent writes. It uses Express and SQLite, listens on port `3001`, and is managed by PM2 on the lab server.

## Data Model

SQLite stores one row per member. The schema maps to the existing `StudentProfile` shape:

- `id`
- `name`
- `cohort`
- `degree`
- `role`
- `status`
- `research`
- `email`
- `phone`
- `wechat`
- `nativePlace`
- `photo`
- `destination`
- `bio`
- `achievements`
- `experiences`
- `sortOrder`
- `createdAt`
- `updatedAt`

Array fields such as `research`, `achievements`, and `experiences` can be stored as JSON text in SQLite for this first version. The API returns them as arrays so the frontend type remains close to the existing `StudentProfile`.

Photos are not uploaded in this version. The editor only exposes a photo URL field. Existing local public asset URLs can still be used, and future photo upload support can be added behind the same field.

## Backend API

Public API:

- `GET /health` returns service status.
- `GET /students` returns all member records sorted by cohort and `sortOrder`.

Admin API:

- `POST /auth/login` verifies the admin passphrase and returns a persistent browser token.
- `GET /auth/me` verifies the saved token.
- `POST /students` creates a member.
- `PUT /students/:id` updates a member.
- `DELETE /students/:id` deletes a member.

Admin write routes require a valid backend-issued token. The frontend must not be trusted just because `localStorage` says the user is a member.

## Authentication

The admin passphrase is verified by the backend. The passphrase hash lives in a server `.env` file as `ADMIN_PASS_HASH`; the frontend no longer needs to expose the hash in `VITE_MEMBER_PASS_HASH` for write access.

On successful login, the backend signs a token using `JWT_SECRET`. The frontend stores the token in browser storage for the existing long-lived login experience. Logging out clears the saved token.

The token can be long-lived to match the requested workflow, but all write requests still require server-side validation.

## Frontend Behavior

The people page will load records through a frontend API client configured by `VITE_API_BASE_URL`. In production this is `https://api.scs-happycv.top`; in local development it can be `http://localhost:3001`.

When the API succeeds:

- Render API member data.
- Refresh the list after create, update, or delete.

When the API fails:

- Render the existing compiled data from `src/data/students`.
- Show a subtle admin-only warning when logged in, because edits cannot be saved while the backend is unavailable.

After admin login:

- Show an "Add member" action near the people page controls.
- Show edit and delete actions on each member card or detail drawer.
- Open a member form in a dialog or drawer for create and edit.
- Ask for confirmation before deleting.

The form covers all existing student fields. Array fields can use one item per line to keep editing simple and predictable.

## Deployment

The frontend remains on GitHub Pages. The backend is deployed on the lab server:

```bash
git clone <repo>
cd LabHomePage/server
npm install
cp .env.example .env
npm run build
npm run db:import
pm2 start ecosystem.config.cjs
pm2 save
```

Example backend environment:

```env
PORT=3001
ADMIN_PASS_HASH=
JWT_SECRET=
SQLITE_PATH=./data/lab-homepage.db
CORS_ORIGIN=https://your-github-pages-domain
```

The existing reverse proxy for `https://api.scs-happycv.top` forwards requests to `localhost:3001`.

## Migration

The first version includes a one-time import script. It reads the current student data from `src/data/students/years/*.ts`, normalizes it into the API shape, creates the SQLite database if needed, and inserts the initial member records.

After import, SQLite is the source of truth for live edits. The compiled frontend data remains as a static fallback. The import script should be documented as a bootstrap tool, not a regular sync command, to avoid overwriting live edits by accident.

## Validation And Errors

Backend validation should reject missing or invalid required fields:

- `id`
- `name`
- `cohort`
- `degree`
- `role`
- `status`
- `email`
- `bio`

`status` must be either `current` or `alumni`. Array fields default to empty arrays. Optional text fields may be empty.

The frontend should show clear save errors, keep the user's form input when a save fails, and refresh the member list after successful writes.

## Testing

Backend verification:

- Health check returns OK.
- Public student list returns records without auth.
- Login succeeds with the correct passphrase and fails with an incorrect one.
- Create, update, and delete require a valid token.
- Required field validation works.
- Import script creates the SQLite database from existing data.

Frontend verification:

- People page renders API data when the backend is available.
- People page falls back to compiled data when the backend is unavailable.
- Admin login persists in the browser.
- Add, edit, and delete controls appear only for authenticated administrators.
- Create, update, and delete refresh the visible list.

## Non-Goals

This version does not include:

- Member-specific accounts.
- Role-based permissions.
- Photo upload or image processing.
- MySQL/PostgreSQL deployment.
- A separate admin dashboard page.
- Automatic Git commits from the web editor.
