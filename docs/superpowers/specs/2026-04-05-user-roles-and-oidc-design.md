# User Roles, Permissions & OIDC Integration

## Overview

Add role-based access control (admin, viewer, requester) to Allstarr, a user management settings page, a first-run setup wizard, registration controls, and OIDC provider support. Uses better-auth's admin plugin and genericOAuth plugin.

## Roles & Permission Model

Three fixed roles stored in the user table's `role` column (via better-auth admin plugin):

| Role | Page Access | Can Mutate |
|------|-------------|------------|
| `admin` | All pages | Yes — full control |
| `viewer` | All pages (including `/requests`) | No — all actions disabled (buttons, forms, delete, settings changes) |
| `requester` | `/requests` only | Only request-related actions (stubbed for now) |

### Server-Side Enforcement

- `requireAuth()` stays as-is — returns session with role.
- New `requireAdmin()` helper — calls `requireAuth()`, then throws 403 if role is not `admin`.
- Every mutating server function (create, update, delete, settings changes, triggering jobs) calls `requireAdmin()` instead of `requireAuth()`.
- Read-only server functions (get, list, paginate) keep `requireAuth()` — viewers and admins can both read.

### Client-Side Enforcement

- Session context includes the user's role (provided by better-auth admin plugin).
- A `useIsAdmin()` hook checks `session.user.role === "admin"`.
- Mutating UI elements (buttons, forms, dropdowns) are disabled when `!isAdmin`.
- No granular permission system — just admin vs not-admin for mutations.

## Route Access & Navigation

| Route | Admin | Viewer | Requester |
|-------|-------|--------|-----------|
| `/setup` | Only when no users exist | Only when no users exist | Only when no users exist |
| `/login` | Yes | Yes | Yes |
| `/requests` | Yes | Yes | Yes |
| `/books`, `/authors`, `/tv`, `/movies`, `/manga` | Yes | Yes (read-only) | Redirect to `/requests` |
| `/activity` (queue, history, blocklist) | Yes | Yes (read-only) | Redirect to `/requests` |
| `/settings/*` | Yes | Yes (read-only) | Redirect to `/requests` |
| `/system/*` | Yes | Yes (read-only) | Redirect to `/requests` |

### Implementation in `_authed.tsx`

The existing `beforeLoad` hook already fetches the session. Extend it to check role:

- If `requester` and the target route is not `/requests` — redirect to `/requests`.
- Session (with role) is passed to child routes via `routeContext`.

### Sidebar Filtering

- Admin and viewer see the full sidebar (all nav groups).
- Requester sees only a "Requests" nav item — all other groups are hidden.
- Sidebar reads role from session context and conditionally renders nav groups.

### Requester `/requests` Page

- Stub route at `src/routes/_authed/requests/index.tsx`.
- Simple page with a "Coming soon" or empty state message.
- This is the requester's home page — they redirect here from `/`.

## First-Run Setup Wizard

### Flow

1. User navigates to Allstarr for the first time (no users in DB).
2. Any route redirects to `/setup`.
3. Setup page collects: name, email, password.
4. On submit, creates the user account via better-auth's `signUp.email()`, then the `databaseHooks.user.create.before` hook detects zero existing users and sets role to `admin`.
5. User is automatically signed in and redirected to `/`.

### Route Protection

- `/setup` has its own `beforeLoad` that checks if any users exist (via a server function `hasUsersFn`).
- If users already exist, `/setup` redirects to `/login`.
- The `_authed.tsx` layout and `/login` both check if zero users exist — if so, redirect to `/setup`.

### `hasUsersFn`

- A public server function (no auth required — there are no users yet).
- Returns `boolean` — queries `SELECT 1 FROM user LIMIT 1`.
- Used by `/setup`, `/login`, and `_authed.tsx`.

### Setup Page UI

- Clean, centered card layout (similar to `/login` and `/register`).
- Title: "Welcome to Allstarr" or similar.
- Subtitle explaining this creates the admin account.
- Same form fields as `/register` (name, email, password).
- No link to `/login` (there are no accounts yet).

## Registration Control

### Environment Variable

- `DISABLE_REGISTRATION` — when `true`, blocks new email/password signups.
- Added to `.env.example` with default commented out.

### Logic in `databaseHooks.user.create.before`

1. Count existing users.
2. If zero users → allow (first-run), set role to `"admin"`.
3. If request URL matches `/api/auth/admin/create-user` → allow (admin-created user, better-auth admin plugin requires admin session to reach this endpoint).
4. If request URL matches `/api/auth/oauth2/callback/:providerId` → look up provider in `oidc_providers` table. If `trusted` → allow. If not trusted and `DISABLE_REGISTRATION=true` → block.
5. If `DISABLE_REGISTRATION=true` → block with error ("Registration is disabled").
6. Otherwise → allow, assign the configured default role from settings (`auth.defaultRole`).

### Default Role Setting

- Stored in the `settings` table as `auth.defaultRole` (key-value, like existing settings).
- Initial value seeded as `"requester"` via migration.
- Admin can change this in the user management settings UI (dropdown: viewer or requester).
- The `databaseHooks.user.create.before` hook reads this setting to assign the role to new non-first users.

### Registration Page Behavior

- `/register` checks `DISABLE_REGISTRATION` env var and user count via a public server function.
- If registration is disabled AND users exist AND no OIDC context → show a message like "Registration is disabled. Contact your administrator." with a link back to `/login`.
- If no users exist → redirect to `/setup` instead.

## OIDC Integration

### Provider Storage

New `oidc_providers` table:

| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | Auto-generated UUID |
| `providerId` | text (unique) | Slug used in URLs, e.g. `authentik`, `github` |
| `displayName` | text | Shown on login button, e.g. "Sign in with Authentik" |
| `clientId` | text | OAuth client ID |
| `clientSecret` | text | OAuth client secret |
| `discoveryUrl` | text | OIDC discovery URL (`.well-known/openid-configuration`) |
| `scopes` | text (JSON) | Array of scopes, defaults to `["openid", "profile", "email"]` |
| `trusted` | boolean | If true, can auto-create accounts even when registration is disabled |
| `enabled` | boolean | Toggle provider on/off without deleting |
| `createdAt` | timestamp | |

### Auth Initialization

- On server startup, read all enabled providers from `oidc_providers` table.
- Build the `genericOAuth` plugin config array from DB rows.
- Pass to `betterAuth({ plugins: [admin(...), genericOAuth({ config: [...] })] })`.
- Provider changes in settings UI show a "Restart required for changes to take effect" banner.

### Trusted Provider Logic (in `databaseHooks.user.create.before`)

- When a user signs in via OIDC and no account exists, better-auth triggers user creation.
- The hook checks if the originating provider is marked `trusted`.
- If trusted → allow account creation regardless of `DISABLE_REGISTRATION`.
- If not trusted and `DISABLE_REGISTRATION=true` → block with error.

### Detecting the Originating Provider

The `databaseHooks.user.create.before` hook receives a context object with the current request. For OIDC-initiated user creation, the request URL contains the provider ID in the OAuth callback path (`/api/auth/oauth2/callback/:providerId`). Extract the provider ID from the URL, query the `oidc_providers` table for its `trusted` flag. If the URL doesn't match the OAuth callback pattern, the creation is from email/password signup or admin action.

### Login Page

- Below the email/password form, show OIDC provider buttons for each enabled provider.
- Each button calls `signIn.oauth2({ providerId })` from the better-auth client.
- If `DISABLE_REGISTRATION=true` and no OIDC providers are configured, only show the email/password login form (no register link).

## User Management Settings Page

New settings category "Users" — added to the settings hub grid and nav config alongside existing categories.

**Route:** `/settings/users`

### Section 1: Registration Settings

- Display current `DISABLE_REGISTRATION` env var status (read-only, since it's an env var — show "Registration is currently enabled/disabled").
- Default role dropdown: viewer or requester (saves to `auth.defaultRole` setting).

### Section 2: Users Table

- List all users via better-auth's `admin/list-users` endpoint.
- Columns: name, email, role, auth method (email or OIDC provider name), last login time, created date.
- Actions per row (admin only):
  - Change role (dropdown: admin, viewer, requester).
  - Delete user (with confirmation dialog).
- Cannot delete yourself or change your own role (prevent accidental lockout).
- Admin can create new users via a dialog (name, email, password, role) — uses better-auth's `admin/create-user` endpoint. This works regardless of `DISABLE_REGISTRATION`.

### Section 3: OIDC Providers

- Table of configured providers: display name, provider ID, discovery URL, trusted badge, enabled toggle.
- Add provider button → dialog with form fields (display name, provider ID, client ID, client secret, discovery URL, scopes, trusted checkbox).
- Edit/delete actions per row.
- "Restart required" banner when providers have been modified since last server start.

## Schema Changes & Migration

### Database Changes

1. **`user` table** — new columns added by better-auth admin plugin:
   - `role` (text, nullable) — "admin", "viewer", or "requester"
   - `banned` (boolean, default false) — required by plugin, not used in UI
   - `banReason` (text, nullable)
   - `banExpires` (timestamp, nullable)

2. **`session` table** — new column from admin plugin:
   - `impersonatedBy` (text, nullable) — required by plugin, not used in UI

3. **New `oidc_providers` table** — as described in OIDC section.

4. **`settings` table** — new seed row:
   - `auth.defaultRole` = `"requester"`

### Migration Strategy

- Run `bun run db:generate` after updating the Drizzle schema to include admin plugin columns and the new OIDC table.
- Migration auto-generated by Drizzle.
- Existing users get `role = NULL` after migration. Data migration step: if `role` is NULL, set it to `"admin"` for existing users (they were created before roles existed, so they should retain full access). This runs as part of the migration or as a startup check.

### Auth Schema Update

The existing `src/db/schema/auth.ts` needs the admin plugin columns added. better-auth with Drizzle requires the schema to match the plugin's expectations. Add the columns to the existing `user` and `session` table definitions.

## Server Function Enforcement

### Middleware Changes (`src/server/middleware.ts`)

- `requireAuth()` — unchanged, returns session (which now includes `role`).
- New `requireAdmin()` — calls `requireAuth()`, checks `session.user.role === "admin"`, throws 403 if not.

### Functions Switching to `requireAdmin()`

Every mutating function across all server files:

| File | Functions |
|------|-----------|
| `authors.ts` | createAuthorFn, updateAuthorFn, deleteAuthorFn |
| `books.ts` | createBookFn, updateBookFn, deleteBookFn, monitorBookProfileFn, unmonitorBookProfileFn |
| `shows.ts` | addShowFn, updateShowFn, deleteShowFn, monitorEpisodeProfileFn, unmonitorEpisodeProfileFn, bulkMonitor/Unmonitor, refreshShowMetadataFn |
| `movies.ts` | addMovieFn, updateMovieFn, deleteMovieFn, refreshMovieMetadataFn, monitorMovieProfileFn, unmonitorMovieProfileFn |
| `manga.ts` | deleteMangaFn, monitorMangaChapterFn, unmonitorMangaChapterFn, bulkMonitor/Unmonitor, refreshMangaMetadataFn |
| `settings.ts` | updateSettingFn, regenerateApiKeyFn, updateMetadataProfileFn |
| `download-clients.ts` | createDownloadClientFn, updateDownloadClientFn, deleteDownloadClientFn, testDownloadClientFn |
| `download-profiles.ts` | createDownloadProfileFn, updateDownloadProfileFn, deleteDownloadProfileFn, moveProfileFilesFn, createDownloadFormatFn, updateDownloadFormatFn |
| `indexers.ts` | createIndexerFn, updateIndexerFn |
| `custom-formats.ts` | createCustomFormatFn, updateCustomFormatFn, deleteCustomFormatFn, duplicateCustomFormatFn, setProfileCFScoreFn, bulkSetProfileCFScoresFn, removeProfileCFsFn |
| `custom-format-import-export.ts` | importCustomFormatsFn |
| `queue.ts` | removeFromQueueFn, pauseDownloadFn, resumeDownloadFn, setDownloadPriorityFn |
| `tasks.ts` | runScheduledTaskFn, toggleTaskEnabledFn |
| `blocklist.ts` | addToBlocklistFn, removeFromBlocklistFn, bulkRemoveFromBlocklistFn |
| `import.ts` | importHardcoverAuthorFn, importHardcoverBookFn, refreshAuthorMetadataFn, refreshBookMetadataFn, monitorBookFn |
| `manga-import.ts` | importMangaFn |
| `manga-search.ts` | updateMangaSourceFn |
| `import-list-exclusions.ts` | removeBookImportExclusionFn, removeMovieImportExclusionFn |
| `filesystem.ts` | browseDirectoryFn |
| `commands.ts` | All command submission functions |

### Functions That Stay `requireAuth()` (Read-Only)

All get/list/paginate functions — getAuthorsFn, getBooksFn, getHistoryFn, getQueueFn, getSettingsFn, etc. Viewers need these to see the UI.

User settings functions (`user-settings.ts`) also stay `requireAuth()` — viewers should be able to save their own column/view preferences.
