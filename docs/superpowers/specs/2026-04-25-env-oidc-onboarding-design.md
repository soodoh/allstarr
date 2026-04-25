# Env-Driven OIDC Onboarding Design

## Context

Allstarr is a self-hosted media manager distributed as a production Docker container. On a fresh install, the operator needs a predictable way to create the first administrator account and configure authentication without using an already-authenticated UI.

The current code already has email/password setup, login, and registration routes, Better Auth integration, first-user admin promotion, a registration disable flag, and partial OIDC support. OIDC providers are currently stored in the database and managed from Settings. For production bootstrap, OIDC should instead be configured entirely through environment variables.

No existing production installs depend on DB-managed OIDC, so this feature may remove the OIDC provider table and UI without a compatibility path.

## Goals

- Configure one or more OIDC providers through environment variables only.
- Allow the first account to be created as an admin through either email/password or OIDC.
- Keep email/password sign-in enabled for existing credential users.
- Allow operators to disable all self-service account creation after setup.
- Allow operators to disable email/password account creation while still allowing selected OIDC providers to auto-provision users.
- Remove database-backed OIDC provider management.
- Keep the implementation testable through small configuration and policy helpers.

## Non-Goals

- Add UI for configuring OIDC providers.
- Disable email/password login.
- Preserve DB-configured OIDC providers during upgrade.
- Add invitation flows or domain allowlists.
- Change the existing admin-created user behavior.

## Environment Contract

OIDC providers use indexed environment variables:

```bash
OIDC_1_PROVIDER_ID=authentik
OIDC_1_DISPLAY_NAME=Authentik
OIDC_1_CLIENT_ID=...
OIDC_1_CLIENT_SECRET=...
OIDC_1_DISCOVERY_URL=https://auth.example.com/application/o/allstarr/.well-known/openid-configuration
OIDC_1_SCOPES=openid,profile,email
OIDC_1_ALLOW_ACCOUNT_CREATION=true
```

Additional providers use `OIDC_2_*`, `OIDC_3_*`, and so on. Parsing stops at the first completely empty index. A provider index is complete when it has `PROVIDER_ID`, `DISPLAY_NAME`, `CLIENT_ID`, `CLIENT_SECRET`, and `DISCOVERY_URL`. `SCOPES` defaults to `openid,profile,email`. `ALLOW_ACCOUNT_CREATION` defaults to `false`.

Partially configured providers are treated as configuration errors. The auth configuration helper should report which index is invalid and which required keys are missing so container logs are actionable.

Registration flags:

- `DISABLE_REGISTRATION=true` blocks self-service account creation after the first user exists, except for OIDC providers with `OIDC_N_ALLOW_ACCOUNT_CREATION=true`.
- `DISABLE_EMAIL_PASSWORD_REGISTRATION=true` blocks email/password signup after the first user exists.
- First-user creation is always allowed and always receives `role: "admin"`.
- Email/password sign-in remains enabled.

## Architecture

Add a server-only auth configuration module that parses environment variables into one typed policy object. It exposes:

- Better Auth provider config: `providerId`, `clientId`, `clientSecret`, `discoveryUrl`, and `scopes`.
- Public provider metadata: `providerId` and `displayName`.
- Provider account-creation policy keyed by `providerId`.
- Registration flags for global and email/password registration.

`src/lib/auth-server.ts` uses this module instead of querying `oidc_providers`. Better Auth registers the `genericOAuth` plugin only when at least one env provider is configured.

`src/server/setup.ts` uses the same module to return public login/setup status:

```ts
{
  registrationDisabled: boolean;
  emailPasswordRegistrationDisabled: boolean;
  oidcProviders: Array<{ providerId: string; displayName: string }>;
}
```

The existing DB `account.providerId` field remains because Better Auth uses it to identify linked auth methods. Only the Allstarr-specific `oidc_providers` table and management functions are removed.

## Account Creation Policy

The Better Auth user creation hook enforces account creation policy:

- If user count is `0`, creation is allowed and the new user gets `role: "admin"`, regardless of whether the request came from email/password or OIDC.
- If the request is `/admin/create-user`, preserve current behavior: use the supplied role when present, otherwise use the configured default role.
- If the request is an OIDC callback, allow creation when global registration is enabled or when that specific provider has `ALLOW_ACCOUNT_CREATION=true`. Assign the configured default role.
- If the request is email/password signup, block creation when `DISABLE_REGISTRATION=true` or `DISABLE_EMAIL_PASSWORD_REGISTRATION=true`. Otherwise assign the configured default role.

The default role remains restricted to `viewer` or `requester`; invalid stored values fall back to `requester`.

## UI Flow

`/login`:

- Always keeps email/password sign-in visible.
- Shows OIDC sign-in buttons when env providers exist.
- Shows the register link only when email/password registration is allowed.

`/register`:

- Remains email/password only.
- Redirects to `/setup` when no users exist.
- Shows disabled registration messaging when either registration flag blocks email/password signup.

`/setup`:

- Supports first-admin creation through email/password and OIDC.
- Hides the email/password setup form when `DISABLE_EMAIL_PASSWORD_REGISTRATION=true`.
- Shows OIDC setup buttons when env providers exist.
- If no users exist, email/password registration is disabled, and no OIDC providers are configured, shows a clear configuration error so the operator can fix env vars.

Settings -> Users:

- Keeps user management and default role controls.
- Removes OIDC provider list, create dialog, trusted toggle, enabled toggle, and delete action.

## Data And Migration

Remove DB-managed OIDC provider support:

- Delete `src/server/oidc-providers.ts` and its tests.
- Remove OIDC provider validators from `src/lib/validators.ts`.
- Remove `src/db/schema/oidc-providers.ts` and its export.
- Add a Drizzle migration that drops `oidc_providers`.
- Do not edit generated route tree files manually.

Because no installs use this feature yet, there is no migration path from DB providers to env providers. Operators configure OIDC through env vars before starting the upgraded container.

## Testing

Unit tests for the auth env parser cover:

- no providers configured
- one complete provider
- multiple providers
- custom scope parsing
- `OIDC_N_ALLOW_ACCOUNT_CREATION=true`
- account creation defaulting to false
- partial provider config errors with useful missing-key details

Unit tests for auth user creation policy cover:

- first email/password user becomes admin even if registration is disabled
- first OIDC user becomes admin even if global registration is disabled
- later email/password signup respects both registration flags
- later OIDC signup is blocked by `DISABLE_REGISTRATION=true` unless the provider allows account creation
- later OIDC signup is allowed for a provider with account creation enabled
- admin-created users preserve current behavior

Browser tests cover:

- `/login` shows OIDC buttons from env-backed registration status
- `/login` hides the register link when email/password registration is disabled
- `/register` blocks email/password registration when either flag applies
- `/setup` supports OIDC first-admin entry
- `/setup` hides email/password setup when email/password registration is disabled
- Settings -> Users no longer renders OIDC provider management

Verification commands after implementation:

```bash
bun run lint:fix
bun run typecheck
bun run test -- src/lib/auth-config.test.ts src/lib/auth-server.test.ts src/server/setup.test.ts src/routes/login.browser.test.tsx src/routes/register.browser.test.tsx src/routes/setup.browser.test.tsx src/routes/_authed/settings/users.browser.test.tsx
bun run test
```

## Acceptance Criteria

- A fresh Docker install can create the first admin using email/password when email/password registration is enabled.
- A fresh Docker install can create the first admin using an env-configured OIDC provider.
- `DISABLE_REGISTRATION=true` blocks later email/password signup and later OIDC signup unless the provider explicitly allows account creation.
- `DISABLE_EMAIL_PASSWORD_REGISTRATION=true` blocks later email/password signup without blocking OIDC provider account creation when enabled per provider.
- Login continues to work for existing credential users.
- OIDC providers cannot be created, edited, trusted, enabled, disabled, or deleted through the app UI.
- Runtime OIDC provider configuration comes only from environment variables.
