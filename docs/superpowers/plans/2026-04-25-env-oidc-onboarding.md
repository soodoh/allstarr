# Env OIDC Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make production Docker onboarding support env-configured OIDC providers, separate registration controls, OIDC first-admin setup, and removal of DB-managed OIDC provider UI.

**Architecture:** Add one server-only auth config module that parses env vars and exposes Better Auth provider config, public provider metadata, and account-creation policy. Update Better Auth hooks and public setup status to use this module, then remove the old DB-backed OIDC provider schema, server functions, validators, and Settings UI.

**Tech Stack:** Bun, TypeScript, TanStack Start, Better Auth `genericOAuth`, Drizzle SQLite migrations, Vitest unit tests, Vitest browser tests.

---

## File Structure

- Create `src/lib/auth-config.ts`: server-side env parser and policy helpers.
- Create `src/lib/auth-config.test.ts`: unit coverage for env parsing and provider policy.
- Modify `src/lib/auth-server.ts`: consume `auth-config`, remove DB provider reads, enforce new policy.
- Modify `src/lib/auth-server.test.ts`: update mocks and policy expectations.
- Modify `src/server/setup.ts`: return env-backed public auth status.
- Modify `src/server/setup.test.ts`: update status tests for env providers and email/password flag.
- Modify `src/routes/setup.tsx`: add OIDC first-admin setup and email/password disabled state.
- Modify `src/routes/setup.browser.test.tsx`: cover setup OIDC and disabled email/password setup.
- Modify `src/routes/login.tsx`: use `emailPasswordRegistrationDisabled` to hide register link.
- Modify `src/routes/login.browser.test.tsx`: cover new status shape.
- Modify `src/routes/register.tsx`: block when either registration flag disables email/password signup.
- Modify `src/routes/register.browser.test.tsx`: cover email/password-only disable behavior.
- Modify `src/routes/_authed/settings/users.tsx`: remove OIDC provider management imports, loader data, section, and dialog.
- Modify `src/routes/_authed/settings/users.browser.test.tsx`: remove OIDC management expectations and add absence check.
- Delete `src/server/oidc-providers.ts`.
- Delete `src/server/oidc-providers.test.ts`.
- Delete `src/db/schema/oidc-providers.ts`.
- Modify `src/db/schema/index.ts`: remove OIDC provider export.
- Modify `src/lib/validators.ts`: remove OIDC provider schemas.
- Add one Drizzle migration under `drizzle/`: drop `oidc_providers`.
- Modify `.env.example`: document indexed OIDC env vars and registration flags.

## Task 0: Prepare Worktree

**Files:**
- Read: `package.json`
- Read: `.env.example`

- [ ] **Step 1: Install dependencies**

Run:

```bash
bun install
```

Expected: dependencies install successfully and `node_modules/` exists.

- [ ] **Step 2: Create local env file when missing**

Run:

```bash
test -f .env || cp .env.example .env
```

Expected: command exits with status `0`.

- [ ] **Step 3: Confirm generated files are not dirty**

Run:

```bash
git status --short
```

Expected: only intentional docs or future task changes are listed. Do not edit `src/routeTree.gen.ts`.

## Task 1: Add Env Auth Config Parser

**Files:**
- Create: `src/lib/auth-config.ts`
- Create: `src/lib/auth-config.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `src/lib/auth-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	getProviderAccountCreationPolicy,
	parseAuthConfig,
} from "./auth-config";

describe("parseAuthConfig", () => {
	it("returns defaults when no OIDC providers are configured", () => {
		const config = parseAuthConfig({});

		expect(config.registrationDisabled).toBe(false);
		expect(config.emailPasswordRegistrationDisabled).toBe(false);
		expect(config.oidcProviders).toEqual([]);
		expect(config.publicOidcProviders).toEqual([]);
		expect(config.allowOidcAccountCreation("authentik")).toBe(false);
	});

	it("parses one complete OIDC provider", () => {
		const config = parseAuthConfig({
			OIDC_1_PROVIDER_ID: "authentik",
			OIDC_1_DISPLAY_NAME: "Authentik",
			OIDC_1_CLIENT_ID: "client-id",
			OIDC_1_CLIENT_SECRET: "client-secret",
			OIDC_1_DISCOVERY_URL: "https://auth.example.com/.well-known/openid-configuration",
		});

		expect(config.oidcProviders).toEqual([
			{
				providerId: "authentik",
				displayName: "Authentik",
				clientId: "client-id",
				clientSecret: "client-secret",
				discoveryUrl:
					"https://auth.example.com/.well-known/openid-configuration",
				scopes: ["openid", "profile", "email"],
				allowAccountCreation: false,
			},
		]);
		expect(config.publicOidcProviders).toEqual([
			{ providerId: "authentik", displayName: "Authentik" },
		]);
	});

	it("parses multiple providers and custom scopes", () => {
		const config = parseAuthConfig({
			OIDC_1_PROVIDER_ID: "authentik",
			OIDC_1_DISPLAY_NAME: "Authentik",
			OIDC_1_CLIENT_ID: "authentik-client",
			OIDC_1_CLIENT_SECRET: "authentik-secret",
			OIDC_1_DISCOVERY_URL: "https://auth.example.com/.well-known/openid-configuration",
			OIDC_1_SCOPES: "openid,profile,email,groups",
			OIDC_2_PROVIDER_ID: "authelia",
			OIDC_2_DISPLAY_NAME: "Authelia",
			OIDC_2_CLIENT_ID: "authelia-client",
			OIDC_2_CLIENT_SECRET: "authelia-secret",
			OIDC_2_DISCOVERY_URL: "https://login.example.com/.well-known/openid-configuration",
		});

		expect(config.oidcProviders.map((provider) => provider.providerId)).toEqual([
			"authentik",
			"authelia",
		]);
		expect(config.oidcProviders[0]?.scopes).toEqual([
			"openid",
			"profile",
			"email",
			"groups",
		]);
	});

	it("parses registration flags and explicit OIDC account creation", () => {
		const config = parseAuthConfig({
			DISABLE_REGISTRATION: "true",
			DISABLE_EMAIL_PASSWORD_REGISTRATION: "true",
			OIDC_1_PROVIDER_ID: "authentik",
			OIDC_1_DISPLAY_NAME: "Authentik",
			OIDC_1_CLIENT_ID: "client-id",
			OIDC_1_CLIENT_SECRET: "client-secret",
			OIDC_1_DISCOVERY_URL: "https://auth.example.com/.well-known/openid-configuration",
			OIDC_1_ALLOW_ACCOUNT_CREATION: "true",
		});

		expect(config.registrationDisabled).toBe(true);
		expect(config.emailPasswordRegistrationDisabled).toBe(true);
		expect(config.allowOidcAccountCreation("authentik")).toBe(true);
		expect(config.allowOidcAccountCreation("authelia")).toBe(false);
		expect(getProviderAccountCreationPolicy(config, "authentik")).toBe(true);
	});

	it("throws a useful error for partial provider configuration", () => {
		expect(() =>
			parseAuthConfig({
				OIDC_1_PROVIDER_ID: "authentik",
				OIDC_1_CLIENT_ID: "client-id",
			}),
		).toThrow(
			"OIDC_1 is missing required environment variables: OIDC_1_DISPLAY_NAME, OIDC_1_CLIENT_SECRET, OIDC_1_DISCOVERY_URL",
		);
	});
});
```

- [ ] **Step 2: Run parser tests to verify they fail**

Run:

```bash
bun run test -- src/lib/auth-config.test.ts
```

Expected: FAIL because `src/lib/auth-config.ts` does not exist.

- [ ] **Step 3: Implement parser**

Create `src/lib/auth-config.ts`:

```ts
type Env = Record<string, string | undefined>;

export type OidcProviderConfig = {
	providerId: string;
	displayName: string;
	clientId: string;
	clientSecret: string;
	discoveryUrl: string;
	scopes: string[];
	allowAccountCreation: boolean;
};

export type PublicOidcProvider = Pick<
	OidcProviderConfig,
	"displayName" | "providerId"
>;

export type AuthConfig = {
	registrationDisabled: boolean;
	emailPasswordRegistrationDisabled: boolean;
	oidcProviders: OidcProviderConfig[];
	publicOidcProviders: PublicOidcProvider[];
	allowOidcAccountCreation: (providerId: string) => boolean;
};

const REQUIRED_PROVIDER_SUFFIXES = [
	"PROVIDER_ID",
	"DISPLAY_NAME",
	"CLIENT_ID",
	"CLIENT_SECRET",
	"DISCOVERY_URL",
] as const;

function isTrue(value: string | undefined): boolean {
	return value === "true";
}

function readTrimmed(env: Env, key: string): string | undefined {
	const value = env[key]?.trim();
	return value ? value : undefined;
}

function hasAnyProviderValue(env: Env, index: number): boolean {
	const prefix = `OIDC_${index}_`;
	return Object.keys(env).some(
		(key) => key.startsWith(prefix) && readTrimmed(env, key),
	);
}

function parseScopes(value: string | undefined): string[] {
	if (!value) {
		return ["openid", "profile", "email"];
	}
	const scopes = value
		.split(",")
		.map((scope) => scope.trim())
		.filter(Boolean);
	return scopes.length > 0 ? scopes : ["openid", "profile", "email"];
}

function parseProvider(env: Env, index: number): OidcProviderConfig {
	const prefix = `OIDC_${index}`;
	const missing = REQUIRED_PROVIDER_SUFFIXES.filter(
		(suffix) => !readTrimmed(env, `${prefix}_${suffix}`),
	);

	if (missing.length > 0) {
		throw new Error(
			`${prefix} is missing required environment variables: ${missing
				.map((suffix) => `${prefix}_${suffix}`)
				.join(", ")}`,
		);
	}

	return {
		providerId: readTrimmed(env, `${prefix}_PROVIDER_ID`) as string,
		displayName: readTrimmed(env, `${prefix}_DISPLAY_NAME`) as string,
		clientId: readTrimmed(env, `${prefix}_CLIENT_ID`) as string,
		clientSecret: readTrimmed(env, `${prefix}_CLIENT_SECRET`) as string,
		discoveryUrl: readTrimmed(env, `${prefix}_DISCOVERY_URL`) as string,
		scopes: parseScopes(readTrimmed(env, `${prefix}_SCOPES`)),
		allowAccountCreation: isTrue(
			readTrimmed(env, `${prefix}_ALLOW_ACCOUNT_CREATION`),
		),
	};
}

export function parseAuthConfig(env: Env = process.env): AuthConfig {
	const oidcProviders: OidcProviderConfig[] = [];

	for (let index = 1; hasAnyProviderValue(env, index); index += 1) {
		oidcProviders.push(parseProvider(env, index));
	}

	return {
		registrationDisabled: isTrue(env.DISABLE_REGISTRATION),
		emailPasswordRegistrationDisabled: isTrue(
			env.DISABLE_EMAIL_PASSWORD_REGISTRATION,
		),
		oidcProviders,
		publicOidcProviders: oidcProviders.map(({ displayName, providerId }) => ({
			displayName,
			providerId,
		})),
		allowOidcAccountCreation: (providerId: string) =>
			oidcProviders.some(
				(provider) =>
					provider.providerId === providerId && provider.allowAccountCreation,
			),
	};
}

export function getProviderAccountCreationPolicy(
	config: AuthConfig,
	providerId: string,
): boolean {
	return config.allowOidcAccountCreation(providerId);
}

export const authConfig = parseAuthConfig();
```

- [ ] **Step 4: Run parser tests to verify they pass**

Run:

```bash
bun run test -- src/lib/auth-config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit parser**

Run:

```bash
git add src/lib/auth-config.ts src/lib/auth-config.test.ts
git commit -m "feat(auth): parse env oidc config"
```

Expected: commit succeeds with no `Co-authored-by` trailer.

## Task 2: Wire Env Config Into Better Auth Policy

**Files:**
- Modify: `src/lib/auth-server.ts`
- Modify: `src/lib/auth-server.test.ts`

- [ ] **Step 1: Update auth-server tests first**

In `src/lib/auth-server.test.ts`, remove mocks for `oidcProviders` table access. Add a mock for `src/lib/auth-config`:

```ts
vi.mock("src/lib/auth-config", () => ({
	authConfig: {
		registrationDisabled: false,
		emailPasswordRegistrationDisabled: false,
		oidcProviders: [],
		publicOidcProviders: [],
		allowOidcAccountCreation: vi.fn(() => false),
	},
}));
```

Add or update tests so they assert:

```ts
it("blocks email signup when DISABLE_EMAIL_PASSWORD_REGISTRATION is set", async () => {
	mocks.authConfig.emailPasswordRegistrationDisabled = true;
	mocks.sqliteGet.mockReturnValue({ count: 1 });

	await expect(
		mocks.userCreateBefore(baseUserData, {
			request: new Request("http://localhost:3000/api/auth/sign-up/email"),
		}),
	).rejects.toThrow("Registration is disabled");
});

it("allows OIDC callback when global registration is disabled and provider allows account creation", async () => {
	mocks.authConfig.registrationDisabled = true;
	mocks.authConfig.allowOidcAccountCreation.mockReturnValue(true);
	mocks.getSettingValue.mockReturnValue("requester");
	mocks.sqliteGet.mockReturnValue({ count: 1 });

	await expect(
		mocks.userCreateBefore(baseUserData, {
			request: new Request("http://localhost:3000/api/auth/oauth2/callback/authentik"),
		}),
	).resolves.toEqual({
		data: { ...baseUserData, role: "requester" },
	});
});
```

Keep the existing first-user admin and admin-created user tests.

- [ ] **Step 2: Run auth-server tests to verify they fail**

Run:

```bash
bun run test -- src/lib/auth-server.test.ts
```

Expected: FAIL because `auth-server.ts` still reads DB-backed OIDC providers and does not use `DISABLE_EMAIL_PASSWORD_REGISTRATION`.

- [ ] **Step 3: Update auth-server implementation**

In `src/lib/auth-server.ts`:

- Remove imports of `and`, `eq`, and `oidcProviders`.
- Import `authConfig`:

```ts
import { authConfig } from "src/lib/auth-config";
```

- Delete `loadOidcProviders()` and `isProviderTrusted()`.
- Replace `const oidcConfig = loadOidcProviders();` with:

```ts
const oidcConfig = authConfig.oidcProviders.map(
	({ allowAccountCreation: _allowAccountCreation, displayName: _displayName, ...provider }) =>
		provider,
);
```

- Replace the OIDC callback policy with:

```ts
if (callbackMatch) {
	const providerId = callbackMatch[1];
	if (
		authConfig.registrationDisabled &&
		!authConfig.allowOidcAccountCreation(providerId)
	) {
		throw new Error("Registration is disabled");
	}
	return {
		data: { ...userData, role: getDefaultRole() },
	};
}
```

- Replace the email/password policy with:

```ts
if (
	authConfig.registrationDisabled ||
	authConfig.emailPasswordRegistrationDisabled
) {
	throw new Error("Registration is disabled");
}
```

- [ ] **Step 4: Run auth-server tests**

Run:

```bash
bun run test -- src/lib/auth-server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit auth policy**

Run:

```bash
git add src/lib/auth-server.ts src/lib/auth-server.test.ts
git commit -m "feat(auth): enforce env registration policy"
```

Expected: commit succeeds with no `Co-authored-by` trailer.

## Task 3: Update Public Registration Status

**Files:**
- Modify: `src/server/setup.ts`
- Modify: `src/server/setup.test.ts`

- [ ] **Step 1: Update setup server tests**

In `src/server/setup.test.ts`, remove DB provider mocks. Mock `src/lib/auth-config` with:

```ts
vi.mock("src/lib/auth-config", () => ({
	authConfig: {
		registrationDisabled: true,
		emailPasswordRegistrationDisabled: true,
		publicOidcProviders: [
			{ providerId: "authentik", displayName: "Authentik" },
		],
	},
}));
```

Assert:

```ts
await expect(getRegistrationStatusFn()).resolves.toEqual({
	registrationDisabled: true,
	emailPasswordRegistrationDisabled: true,
	oidcProviders: [{ providerId: "authentik", displayName: "Authentik" }],
});
```

- [ ] **Step 2: Run setup tests to verify they fail**

Run:

```bash
bun run test -- src/server/setup.test.ts
```

Expected: FAIL because `getRegistrationStatusFn` still queries `oidcProviders`.

- [ ] **Step 3: Update setup server implementation**

In `src/server/setup.ts`:

- Remove `eq`, `db`, and `oidcProviders` imports.
- Import `authConfig`:

```ts
import { authConfig } from "src/lib/auth-config";
```

- Replace `getRegistrationStatusFn` handler body with:

```ts
return {
	registrationDisabled: authConfig.registrationDisabled,
	emailPasswordRegistrationDisabled:
		authConfig.emailPasswordRegistrationDisabled,
	oidcProviders: authConfig.publicOidcProviders,
};
```

- [ ] **Step 4: Run setup tests**

Run:

```bash
bun run test -- src/server/setup.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit setup status**

Run:

```bash
git add src/server/setup.ts src/server/setup.test.ts
git commit -m "feat(auth): expose env registration status"
```

Expected: commit succeeds.

## Task 4: Update Login, Register, And Setup Routes

**Files:**
- Modify: `src/routes/login.tsx`
- Modify: `src/routes/login.browser.test.tsx`
- Modify: `src/routes/register.tsx`
- Modify: `src/routes/register.browser.test.tsx`
- Modify: `src/routes/setup.tsx`
- Modify: `src/routes/setup.browser.test.tsx`

- [ ] **Step 1: Update browser tests first**

Adjust mocked registration status in login/register/setup tests to include:

```ts
{
	registrationDisabled: false,
	emailPasswordRegistrationDisabled: false,
	oidcProviders: []
}
```

Add login test:

```ts
it("hides the register link when email/password registration is disabled", async () => {
	loginRouteMocks.getRegistrationStatusFn.mockResolvedValueOnce({
		registrationDisabled: false,
		emailPasswordRegistrationDisabled: true,
		oidcProviders: [],
	});

	await renderRoute();

	await expect.element(page.getByText("Don't have an account?")).not.toBeInTheDocument();
});
```

Add register test:

```ts
it("shows disabled messaging when email/password registration is disabled", async () => {
	registerRouteMocks.hasUsersFn.mockResolvedValueOnce({ hasUsers: true });
	registerRouteMocks.getRegistrationStatusFn.mockResolvedValueOnce({
		registrationDisabled: false,
		emailPasswordRegistrationDisabled: true,
		oidcProviders: [],
	});

	await renderRoute();

	await expect
		.element(page.getByRole("heading", { name: "Registration Disabled" }))
		.toBeInTheDocument();
});
```

Add setup OIDC mocks:

```ts
signInOauth2: vi.fn(),
getRegistrationStatusFn: vi.fn(),
```

Add setup tests:

```ts
it("starts OIDC first-admin setup when a provider button is clicked", async () => {
	setupRouteMocks.hasUsersFn.mockResolvedValueOnce({ hasUsers: false });
	setupRouteMocks.getRegistrationStatusFn.mockResolvedValueOnce({
		registrationDisabled: true,
		emailPasswordRegistrationDisabled: true,
		oidcProviders: [{ providerId: "authentik", displayName: "Authentik" }],
	});

	await renderRoute();
	await page.getByRole("button", { name: "Continue with Authentik" }).click();

	expect(setupRouteMocks.signInOauth2).toHaveBeenCalledWith({
		providerId: "authentik",
		callbackURL: "/",
	});
});

it("shows a configuration error when no setup method is available", async () => {
	setupRouteMocks.hasUsersFn.mockResolvedValueOnce({ hasUsers: false });
	setupRouteMocks.getRegistrationStatusFn.mockResolvedValueOnce({
		registrationDisabled: true,
		emailPasswordRegistrationDisabled: true,
		oidcProviders: [],
	});

	await renderRoute();

	await expect
		.element(page.getByText("No account creation method is configured."))
		.toBeInTheDocument();
	await expect.element(page.getByLabelText("Email")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run route tests to verify failures**

Run:

```bash
bun run test -- src/routes/login.browser.test.tsx src/routes/register.browser.test.tsx src/routes/setup.browser.test.tsx
```

Expected: FAIL because route components do not yet use the new status shape and setup lacks OIDC.

- [ ] **Step 3: Update login route**

In `src/routes/login.tsx`, derive:

```ts
const {
	emailPasswordRegistrationDisabled,
	registrationDisabled,
	oidcProviders,
} = Route.useLoaderData();
const emailPasswordRegistrationAllowed =
	!registrationDisabled && !emailPasswordRegistrationDisabled;
```

Replace `!registrationDisabled` around the register link with `emailPasswordRegistrationAllowed`.

- [ ] **Step 4: Update register route**

In `src/routes/register.tsx`, derive:

```ts
const { emailPasswordRegistrationDisabled, registrationDisabled } =
	Route.useLoaderData();
const registrationBlocked =
	registrationDisabled || emailPasswordRegistrationDisabled;
```

Replace `if (registrationDisabled)` with:

```ts
if (registrationBlocked) {
```

- [ ] **Step 5: Update setup route**

In `src/routes/setup.tsx`:

- Import `Separator` and `signIn`:

```ts
import Separator from "src/components/ui/separator";
import { signIn, signUp } from "src/lib/auth-client";
import { getRegistrationStatusFn, hasUsersFn } from "src/server/setup";
```

- Add loader:

```ts
loader: async () => {
	return getRegistrationStatusFn();
},
```

- Read status:

```ts
const { emailPasswordRegistrationDisabled, oidcProviders } =
	Route.useLoaderData();
const hasEmailPasswordSetup = !emailPasswordRegistrationDisabled;
const hasOidcSetup = oidcProviders.length > 0;
```

- Add OIDC handler:

```ts
const handleOidcSignIn = async (providerId: string) => {
	try {
		await signIn.oauth2({
			providerId,
			callbackURL: "/",
		});
	} catch {
		toast.error("Failed to sign in with provider");
	}
};
```

- Render the existing form only when `hasEmailPasswordSetup`.
- Render provider buttons with labels `Continue with ${provider.displayName}` when `hasOidcSetup`.
- Render this empty state when both methods are unavailable:

```tsx
<CardContent>
	<p className="text-sm text-muted-foreground">
		No account creation method is configured.
	</p>
</CardContent>
```

- [ ] **Step 6: Run route tests**

Run:

```bash
bun run test -- src/routes/login.browser.test.tsx src/routes/register.browser.test.tsx src/routes/setup.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit route updates**

Run:

```bash
git add src/routes/login.tsx src/routes/login.browser.test.tsx src/routes/register.tsx src/routes/register.browser.test.tsx src/routes/setup.tsx src/routes/setup.browser.test.tsx
git commit -m "feat(auth): support oidc onboarding routes"
```

Expected: commit succeeds.

## Task 5: Remove DB-Managed OIDC Provider UI And Server Code

**Files:**
- Modify: `src/routes/_authed/settings/users.tsx`
- Modify: `src/routes/_authed/settings/users.browser.test.tsx`
- Delete: `src/server/oidc-providers.ts`
- Delete: `src/server/oidc-providers.test.ts`
- Modify: `src/lib/validators.ts`

- [ ] **Step 1: Update Settings -> Users tests**

In `src/routes/_authed/settings/users.browser.test.tsx`:

- Remove mocks for `src/server/oidc-providers`.
- Remove mock loader fields named `oidcProviders`.
- Remove tests that click provider trusted/enabled/delete controls.
- Add an absence assertion to the main render test:

```ts
await expect
	.element(page.getByRole("heading", { name: "OIDC Providers" }))
	.not.toBeInTheDocument();
```

- [ ] **Step 2: Run settings test to verify failure**

Run:

```bash
bun run test -- src/routes/_authed/settings/users.browser.test.tsx
```

Expected: FAIL because the route still imports and renders OIDC provider management.

- [ ] **Step 3: Remove OIDC UI and loader data**

In `src/routes/_authed/settings/users.tsx`:

- Remove imports from `src/server/oidc-providers`.
- Remove `listOidcProvidersFn()` from the loader `Promise.all`.
- Return `{ users, defaultRole, registrationStatus }`.
- Remove `oidcProviders` from `Route.useLoaderData()`.
- Change the page header description to:

```tsx
description="Manage users, roles, and registration settings."
```

- Delete `OidcProvidersSection`, `OidcProvider` type, and `CreateOidcProviderDialog`.
- Remove OIDC-only dialog imports if unused.

- [ ] **Step 4: Delete server OIDC provider module and tests**

Run:

```bash
rm src/server/oidc-providers.ts src/server/oidc-providers.test.ts
```

Expected: files are removed from the worktree.

- [ ] **Step 5: Remove OIDC provider validators**

In `src/lib/validators.ts`, delete the section beginning with:

```ts
// ─── OIDC Providers
```

and remove `createOidcProviderSchema`, `updateOidcProviderSchema`, and `deleteOidcProviderSchema`.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
bun run test -- src/routes/_authed/settings/users.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit UI/server removal**

Run:

```bash
git add src/routes/_authed/settings/users.tsx src/routes/_authed/settings/users.browser.test.tsx src/lib/validators.ts
git add -u src/server/oidc-providers.ts src/server/oidc-providers.test.ts
git commit -m "feat(auth): remove db oidc management"
```

Expected: commit succeeds.

## Task 6: Remove OIDC Provider Schema And Add Migration

**Files:**
- Delete: `src/db/schema/oidc-providers.ts`
- Modify: `src/db/schema/index.ts`
- Add: `drizzle/0006_drop_oidc_providers.sql`
- Modify: Drizzle meta files only if generated by `bun run db:generate`

- [ ] **Step 1: Delete schema export**

Run:

```bash
rm src/db/schema/oidc-providers.ts
```

Then remove this line from `src/db/schema/index.ts`:

```ts
export * from "./oidc-providers";
```

- [ ] **Step 2: Generate migration**

Run:

```bash
bun run db:generate
```

Expected: Drizzle creates a new migration that drops `oidc_providers` and updates `drizzle/meta/_journal.json` plus the latest snapshot.

If Drizzle does not generate a migration, add `drizzle/0006_drop_oidc_providers.sql` manually with:

```sql
DROP TABLE `oidc_providers`;
```

and leave Drizzle meta unchanged.

- [ ] **Step 3: Run schema-related tests**

Run:

```bash
bun run typecheck
bun run test -- src/lib/auth-config.test.ts src/server/setup.test.ts src/lib/auth-server.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit schema removal**

Run:

```bash
git add src/db/schema/index.ts drizzle src/lib/auth-config.test.ts src/server/setup.test.ts src/lib/auth-server.test.ts
git add -u src/db/schema/oidc-providers.ts
git commit -m "feat(db): drop oidc providers table"
```

Expected: commit succeeds.

## Task 7: Document Env Configuration

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Update `.env.example`**

Replace the registration comments with:

```env
# Set to "true" to disable all self-service account creation after the first
# admin account exists. OIDC providers with OIDC_N_ALLOW_ACCOUNT_CREATION=true
# can still auto-create accounts.
# DISABLE_REGISTRATION=true

# Set to "true" to disable email/password account creation after the first
# admin account exists. Email/password login remains enabled.
# DISABLE_EMAIL_PASSWORD_REGISTRATION=true

# Optional OIDC providers configured at container startup.
# Use OIDC_2_*, OIDC_3_*, and so on for additional providers.
# OIDC_1_PROVIDER_ID=authentik
# OIDC_1_DISPLAY_NAME=Authentik
# OIDC_1_CLIENT_ID=your-client-id
# OIDC_1_CLIENT_SECRET=your-client-secret
# OIDC_1_DISCOVERY_URL=https://auth.example.com/application/o/allstarr/.well-known/openid-configuration
# OIDC_1_SCOPES=openid,profile,email
# OIDC_1_ALLOW_ACCOUNT_CREATION=false
```

- [ ] **Step 2: Update README local auth note**

Add this short section after Local Development commands:

```md
## Authentication Configuration

Allstarr supports email/password login by default. Production OIDC providers are configured with environment variables such as `OIDC_1_PROVIDER_ID`, `OIDC_1_CLIENT_ID`, `OIDC_1_CLIENT_SECRET`, and `OIDC_1_DISCOVERY_URL`. Additional providers use `OIDC_2_*`, `OIDC_3_*`, and so on.

`DISABLE_REGISTRATION=true` blocks self-service account creation after the first admin exists, except for OIDC providers with `OIDC_N_ALLOW_ACCOUNT_CREATION=true`. `DISABLE_EMAIL_PASSWORD_REGISTRATION=true` blocks email/password account creation while leaving email/password login enabled.
```

- [ ] **Step 3: Run docs lint**

Run:

```bash
bun run lint:fix
```

Expected: PASS or files are formatted without unrelated rewrites.

- [ ] **Step 4: Commit docs**

Run:

```bash
git add .env.example README.md
git commit -m "docs(auth): document env oidc setup"
```

Expected: commit succeeds.

## Task 8: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
bun run test -- src/lib/auth-config.test.ts src/lib/auth-server.test.ts src/server/setup.test.ts src/routes/login.browser.test.tsx src/routes/register.browser.test.tsx src/routes/setup.browser.test.tsx src/routes/_authed/settings/users.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run full tests**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 4: Run lint check**

Run:

```bash
bun run lint
```

Expected: PASS.

- [ ] **Step 5: Review commits and status**

Run:

```bash
git log --oneline -8
git status --short
```

Expected: task commits are present and the worktree is clean.

- [ ] **Step 6: Prepare integration choice**

Follow repository workflow after verification:

- If creating a PR, keep the local branch and include the spec and plan commits.
- If merging locally, cherrypick all feature commits onto local `main`, do not create a merge commit, then clean up both the worktree and branch.
