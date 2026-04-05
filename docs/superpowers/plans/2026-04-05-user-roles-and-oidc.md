# User Roles, Permissions & OIDC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add role-based access control (admin/viewer/requester), a user management settings page, a first-run setup wizard, registration controls, and OIDC provider support to Allstarr.

**Architecture:** Uses better-auth's admin plugin for role storage and user management endpoints, genericOAuth plugin for OIDC, and a `requireAdmin()` middleware wrapper to enforce write permissions. Routes are protected by role checks in `_authed.tsx`, sidebar is filtered by role, and all mutating server functions require admin role.

**Tech Stack:** better-auth (admin plugin, genericOAuth plugin), Drizzle ORM (SQLite), TanStack Start/Router, React, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-05-user-roles-and-oidc-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/db/schema/oidc-providers.ts` | OIDC providers table schema |
| `src/server/setup.ts` | Public server functions: hasUsersFn, getRegistrationStatusFn (for login page + settings) |
| `src/server/users.ts` | Admin user management server functions (list, create, set-role, delete) |
| `src/server/oidc-providers.ts` | OIDC provider CRUD server functions |
| `src/hooks/use-role.ts` | useIsAdmin() and useUserRole() hooks |
| `src/routes/setup.tsx` | First-run setup wizard page |
| `src/routes/_authed/requests/index.tsx` | Requests stub page (requester home) |
| `src/routes/_authed/settings/users.tsx` | User management settings page |

### Modified Files
| File | Change |
|------|--------|
| `src/db/schema/auth.ts` | Add admin plugin columns (role, banned, banReason, banExpires, impersonatedBy) |
| `src/db/schema/index.ts` | Export new oidc-providers schema |
| `src/lib/auth.ts` | Add admin + genericOAuth plugins, databaseHooks for role assignment + registration control |
| `src/lib/auth-client.ts` | Add adminClient + genericOAuthClient plugins |
| `src/server/middleware.ts` | Add requireAdmin() helper |
| `src/routes/_authed.tsx` | Role-based route guarding (requester redirect) |
| `src/routes/login.tsx` | Setup redirect, OIDC buttons, registration-disabled check |
| `src/routes/register.tsx` | Setup redirect, registration-disabled check |
| `src/components/layout/app-sidebar.tsx` | Role-based nav filtering |
| `src/lib/nav-config.ts` | Add "Users" settings item |
| `src/lib/validators.ts` | Add OIDC provider and user management validators |
| `.env.example` | Add DISABLE_REGISTRATION |
| ~20 server function files | Switch mutating functions from requireAuth() to requireAdmin() |

---

### Task 1: Auth Schema — Add Admin Plugin Columns

**Files:**
- Modify: `src/db/schema/auth.ts`

- [ ] **Step 1: Add admin plugin columns to user and session tables**

Modify `src/db/schema/auth.ts` — add `role`, `banned`, `banReason`, `banExpires` columns to the `user` table and `impersonatedBy` to the `session` table:

```typescript
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("email_verified", { mode: "boolean" })
		.notNull()
		.default(false),
	image: text("image"),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
	// better-auth admin plugin columns
	role: text("role"),
	banned: integer("banned", { mode: "boolean" }).default(false),
	banReason: text("ban_reason"),
	banExpires: integer("ban_expires", { mode: "timestamp" }),
});

export const session = sqliteTable("session", {
	id: text("id").primaryKey(),
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	token: text("token").notNull().unique(),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	// better-auth admin plugin column
	impersonatedBy: text("impersonated_by"),
});

// account and verification tables remain unchanged
```

- [ ] **Step 2: Generate and run migration**

```bash
bun run db:generate
bun run db:migrate
```

- [ ] **Step 3: Add data migration for existing users**

Add a startup migration in `src/db/index.ts` after the existing triggers. Existing users with `role = NULL` should become admin (they existed before roles):

```typescript
// Promote existing users with no role to admin (pre-roles migration)
sqlite.run(`
  UPDATE user SET role = 'admin' WHERE role IS NULL;
`);
```

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/auth.ts src/db/index.ts drizzle/
git commit -m "feat: add admin plugin columns to auth schema"
```

---

### Task 2: OIDC Providers Schema

**Files:**
- Create: `src/db/schema/oidc-providers.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create OIDC providers table schema**

Create `src/db/schema/oidc-providers.ts`:

```typescript
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const oidcProviders = sqliteTable("oidc_providers", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	providerId: text("provider_id").notNull().unique(),
	displayName: text("display_name").notNull(),
	clientId: text("client_id").notNull(),
	clientSecret: text("client_secret").notNull(),
	discoveryUrl: text("discovery_url").notNull(),
	scopes: text("scopes", { mode: "json" })
		.$type<string[]>()
		.notNull()
		.default(["openid", "profile", "email"]),
	trusted: integer("trusted", { mode: "boolean" }).notNull().default(false),
	enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});
```

- [ ] **Step 2: Export from schema index**

Add to `src/db/schema/index.ts`:

```typescript
export * from "./oidc-providers";
```

- [ ] **Step 3: Generate and run migration**

```bash
bun run db:generate
bun run db:migrate
```

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/oidc-providers.ts src/db/schema/index.ts drizzle/
git commit -m "feat: add OIDC providers schema"
```

---

### Task 3: Seed Default Auth Settings

**Files:**
- Modify: `src/db/index.ts`

- [ ] **Step 1: Seed auth.defaultRole setting**

Add to `src/db/index.ts` after the existing triggers and the role migration, before the `seedBuiltinCustomFormats()` call:

```typescript
// Seed default auth settings if not present
sqlite.run(`
  INSERT OR IGNORE INTO settings (key, value) VALUES ('auth.defaultRole', '"requester"');
`);
```

Note: The value is double-JSON-stringified (`'"requester"'`) to match the existing convention where settings values are stored with an extra `JSON.stringify` wrap.

- [ ] **Step 2: Commit**

```bash
git add src/db/index.ts
git commit -m "feat: seed default auth.defaultRole setting"
```

---

### Task 4: Configure better-auth with Admin + OIDC Plugins

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/auth-client.ts`

- [ ] **Step 1: Update server auth config**

Rewrite `src/lib/auth.ts` to add the admin plugin, genericOAuth plugin, and databaseHooks:

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { genericOAuth } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { db } from "src/db";
import { oidcProviders, settings } from "src/db/schema";

function loadOidcProviders() {
	const rows = db
		.select()
		.from(oidcProviders)
		.where(eq(oidcProviders.enabled, true))
		.all();

	return rows.map((row) => ({
		providerId: row.providerId,
		clientId: row.clientId,
		clientSecret: row.clientSecret,
		discoveryUrl: row.discoveryUrl,
		scopes: row.scopes,
	}));
}

function getDefaultRole(): string {
	const row = db
		.select()
		.from(settings)
		.where(eq(settings.key, "auth.defaultRole"))
		.get();
	if (row?.value) {
		try {
			const parsed =
				typeof row.value === "string" ? JSON.parse(row.value) : row.value;
			if (parsed === "viewer" || parsed === "requester") return parsed;
		} catch {}
	}
	return "requester";
}

function isProviderTrusted(providerId: string): boolean {
	const provider = db
		.select()
		.from(oidcProviders)
		.where(
			and(
				eq(oidcProviders.providerId, providerId),
				eq(oidcProviders.enabled, true),
				eq(oidcProviders.trusted, true),
			),
		)
		.get();
	return !!provider;
}

const oidcConfig = loadOidcProviders();

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "sqlite",
	}),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [
		admin({
			defaultRole: "requester",
		}),
		...(oidcConfig.length > 0
			? [genericOAuth({ config: oidcConfig })]
			: []),
	],
	databaseHooks: {
		user: {
			create: {
				before: async (userData, ctx) => {
					// Count existing users via raw SQL (avoids circular imports)
					const sqlite = (db as any).$client as import("bun:sqlite").Database;
					const { count } = sqlite
						.prepare("SELECT COUNT(*) as count FROM user")
						.get() as { count: number };

					// First user is always admin
					if (count === 0) {
						return { data: { ...userData, role: "admin" } };
					}

					const requestUrl = (ctx as any)?.request?.url || "";

					// Admin-created users get the provided role or default
					if (requestUrl.includes("/admin/create-user")) {
						const defaultRole = getDefaultRole();
						return {
							data: {
								...userData,
								role: userData.role || defaultRole,
							},
						};
					}

					// OIDC callback — check if provider is trusted
					const callbackMatch = requestUrl.match(
						/\/oauth2\/callback\/([^/?]+)/,
					);
					if (callbackMatch) {
						const providerId = callbackMatch[1];
						if (
							process.env.DISABLE_REGISTRATION === "true" &&
							!isProviderTrusted(providerId)
						) {
							throw new Error("Registration is disabled");
						}
						return {
							data: { ...userData, role: getDefaultRole() },
						};
					}

					// Email/password signup — check DISABLE_REGISTRATION
					if (process.env.DISABLE_REGISTRATION === "true") {
						throw new Error("Registration is disabled");
					}

					return {
						data: { ...userData, role: getDefaultRole() },
					};
				},
			},
		},
	},
});
```

- [ ] **Step 2: Update auth client**

Rewrite `src/lib/auth-client.ts` to add admin and genericOAuth client plugins:

```typescript
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { genericOAuthClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
	plugins: [adminClient(), genericOAuthClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
```

- [ ] **Step 3: Verify the app starts**

```bash
bun run dev
```

Check the terminal for errors. The app should start without issues. Kill the dev server after verifying.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth.ts src/lib/auth-client.ts
git commit -m "feat: configure better-auth admin + genericOAuth plugins with databaseHooks"
```

---

### Task 5: Add requireAdmin() Middleware

**Files:**
- Modify: `src/server/middleware.ts`

- [ ] **Step 1: Add requireAdmin() function**

Add after the existing `requireAuth()` function in `src/server/middleware.ts`:

```typescript
export async function requireAdmin() {
	const session = await requireAuth();
	if (session.user.role !== "admin") {
		throw new Error("Forbidden: admin access required");
	}
	return session;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/middleware.ts
git commit -m "feat: add requireAdmin() middleware"
```

---

### Task 6: Switch Mutating Server Functions to requireAdmin()

**Files:**
- Modify: All server function files listed below

Every mutating server function currently calls `await requireAuth()`. Replace with `await requireAdmin()` and update the import. Read-only (GET) functions stay with `requireAuth()`.

- [ ] **Step 1: Update imports and calls across all server files**

For each file below, change the import from:
```typescript
import { requireAuth } from "./middleware";
```
to:
```typescript
import { requireAdmin, requireAuth } from "./middleware";
```

Then replace `await requireAuth()` with `await requireAdmin()` **only** in the mutating functions listed. Leave `requireAuth()` in GET/read-only functions.

**Files and mutating functions to update:**

| File | Mutating functions (change to `requireAdmin()`) |
|------|------------------------------------------------|
| `src/server/authors.ts` | `createAuthorFn`, `updateAuthorFn`, `deleteAuthorFn` |
| `src/server/books.ts` | `createBookFn`, `updateBookFn`, `deleteBookFn`, `monitorBookProfileFn`, `unmonitorBookProfileFn` |
| `src/server/shows.ts` | `addShowFn`, `updateShowFn`, `deleteShowFn`, `monitorEpisodeProfileFn`, `unmonitorEpisodeProfileFn`, `bulkMonitorEpisodeProfileFn`, `bulkUnmonitorEpisodeProfileFn`, `monitorShowProfileFn`, `unmonitorShowProfileFn`, `refreshShowMetadataFn` |
| `src/server/movies.ts` | `addMovieFn`, `updateMovieFn`, `deleteMovieFn`, `refreshMovieMetadataFn`, `monitorMovieProfileFn`, `unmonitorMovieProfileFn` |
| `src/server/manga.ts` | `deleteMangaFn`, `monitorMangaChapterFn`, `unmonitorMangaChapterFn`, `bulkMonitorMangaChapterFn`, `bulkUnmonitorMangaChapterFn`, `monitorMangaProfileFn`, `unmonitorMangaProfileFn`, `refreshMangaMetadataFn` |
| `src/server/settings.ts` | `updateSettingFn`, `regenerateApiKeyFn`, `updateMetadataProfileFn` |
| `src/server/download-clients.ts` | `createDownloadClientFn`, `updateDownloadClientFn`, `deleteDownloadClientFn`, `testDownloadClientFn` |
| `src/server/download-profiles.ts` | `createDownloadProfileFn`, `updateDownloadProfileFn`, `deleteDownloadProfileFn`, `moveProfileFilesFn`, `createDownloadFormatFn`, `updateDownloadFormatFn` |
| `src/server/indexers.ts` | `createIndexerFn`, `updateIndexerFn` |
| `src/server/custom-formats.ts` | `createCustomFormatFn`, `updateCustomFormatFn`, `deleteCustomFormatFn`, `duplicateCustomFormatFn`, `setProfileCFScoreFn`, `bulkSetProfileCFScoresFn`, `removeProfileCFsFn` |
| `src/server/custom-format-import-export.ts` | `importCustomFormatsFn` |
| `src/server/queue.ts` | `removeFromQueueFn`, `pauseDownloadFn`, `resumeDownloadFn`, `setDownloadPriorityFn` |
| `src/server/tasks.ts` | `runScheduledTaskFn`, `toggleTaskEnabledFn` |
| `src/server/blocklist.ts` | `addToBlocklistFn`, `removeFromBlocklistFn`, `bulkRemoveFromBlocklistFn` |
| `src/server/import.ts` | `importHardcoverAuthorFn`, `importHardcoverBookFn`, `refreshAuthorMetadataFn`, `refreshBookMetadataFn`, `monitorBookFn` |
| `src/server/manga-import.ts` | `importMangaFn` |
| `src/server/manga-search.ts` | `updateMangaSourceFn` |
| `src/server/import-list-exclusions.ts` | `removeBookImportExclusionFn`, `removeMovieImportExclusionFn` |
| `src/server/filesystem.ts` | `browseDirectoryFn` |
| `src/server/commands.ts` | All command submission functions |

**Pattern for each file:**

Before (e.g., `src/server/settings.ts`):
```typescript
import { requireAuth } from "./middleware";

export const updateSettingFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => updateSettingSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();
		// ...
	});
```

After:
```typescript
import { requireAdmin, requireAuth } from "./middleware";

export const updateSettingFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => updateSettingSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		// ...
	});
```

- [ ] **Step 2: Verify the app still compiles**

```bash
bun run build
```

- [ ] **Step 3: Commit**

```bash
git add src/server/
git commit -m "feat: enforce admin role on all mutating server functions"
```

---

### Task 7: Public Server Functions (Setup + Registration Status)

**Files:**
- Create: `src/server/setup.ts`

- [ ] **Step 1: Create setup server functions**

Create `src/server/setup.ts`:

```typescript
import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { oidcProviders } from "src/db/schema";
import { eq } from "drizzle-orm";

/**
 * Check if any users exist in the database.
 * Public (no auth required) — used by /setup, /login, _authed.
 */
export const hasUsersFn = createServerFn({ method: "GET" }).handler(
	async () => {
		const sqlite = (db as any).$client as import("bun:sqlite").Database;
		const row = sqlite
			.prepare("SELECT 1 FROM user LIMIT 1")
			.get();
		return { hasUsers: !!row };
	},
);

/**
 * Get registration status for the login/register pages.
 * Public (no auth required).
 */
export const getRegistrationStatusFn = createServerFn({
	method: "GET",
}).handler(async () => {
	const registrationDisabled =
		process.env.DISABLE_REGISTRATION === "true";

	// Get enabled OIDC providers (public info only — no secrets)
	const providers = db
		.select({
			providerId: oidcProviders.providerId,
			displayName: oidcProviders.displayName,
		})
		.from(oidcProviders)
		.where(eq(oidcProviders.enabled, true))
		.all();

	return {
		registrationDisabled,
		oidcProviders: providers,
	};
});
```

- [ ] **Step 2: Commit**

```bash
git add src/server/setup.ts
git commit -m "feat: add public server functions for setup and registration status"
```

---

### Task 8: Setup Wizard Route

**Files:**
- Create: `src/routes/setup.tsx`

- [ ] **Step 1: Create the setup wizard page**

Create `src/routes/setup.tsx`:

```typescript
import {
	createFileRoute,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "src/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import { signUp } from "src/lib/auth-client";
import { hasUsersFn } from "src/server/setup";

export const Route = createFileRoute("/setup")({
	beforeLoad: async () => {
		const { hasUsers } = await hasUsersFn();
		if (hasUsers) {
			throw redirect({ to: "/login" });
		}
	},
	component: SetupPage,
});

function SetupPage() {
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setLoading(true);
		try {
			const result = await signUp.email({ name, email, password });
			if (result.error) {
				toast.error(result.error.message || "Failed to create account");
			} else {
				toast.success("Admin account created!");
				navigate({ to: "/" });
			}
		} catch {
			toast.error("Failed to create account");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="flex min-h-screen items-center justify-center">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<CardTitle className="text-2xl font-bold">
						Welcome to Allstarr
					</CardTitle>
					<CardDescription>
						Create your administrator account to get started.
					</CardDescription>
				</CardHeader>
				<form onSubmit={handleSubmit}>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name">Name</Label>
							<Input
								id="name"
								type="text"
								placeholder="Your name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								placeholder="admin@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								placeholder="Password (min 8 characters)"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								minLength={8}
							/>
						</div>
					</CardContent>
					<CardFooter className="mt-6">
						<Button type="submit" className="w-full" disabled={loading}>
							{loading ? "Creating account..." : "Create Admin Account"}
						</Button>
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/setup.tsx
git commit -m "feat: add first-run setup wizard route"
```

---

### Task 9: Update Login + Register for Setup Redirect and Registration Check

**Files:**
- Modify: `src/routes/login.tsx`
- Modify: `src/routes/register.tsx`

- [ ] **Step 1: Update login page**

Modify `src/routes/login.tsx`:

1. Add `beforeLoad` to redirect to `/setup` if no users exist
2. Load registration status to show/hide register link and OIDC buttons
3. Add OIDC provider buttons

```typescript
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "src/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import { Separator } from "src/components/ui/separator";
import { signIn } from "src/lib/auth-client";
import {
	getRegistrationStatusFn,
	hasUsersFn,
} from "src/server/setup";

export const Route = createFileRoute("/login")({
	beforeLoad: async () => {
		const { hasUsers } = await hasUsersFn();
		if (!hasUsers) {
			throw redirect({ to: "/setup" });
		}
	},
	loader: async () => {
		return getRegistrationStatusFn();
	},
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const { registrationDisabled, oidcProviders } = Route.useLoaderData();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setLoading(true);
		try {
			const result = await signIn.email({ email, password });
			if (result.error) {
				toast.error(result.error.message || "Failed to sign in");
			} else {
				navigate({ to: "/" });
			}
		} catch {
			toast.error("Failed to sign in");
		} finally {
			setLoading(false);
		}
	};

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

	return (
		<div className="flex min-h-screen items-center justify-center">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<CardTitle className="text-2xl font-bold">Allstarr</CardTitle>
					<CardDescription>Sign in to your account</CardDescription>
				</CardHeader>
				<form onSubmit={handleSubmit}>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								placeholder="you@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								placeholder="Password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
							/>
						</div>
					</CardContent>
					<CardFooter className="mt-6 flex flex-col gap-4">
						<Button type="submit" className="w-full" disabled={loading}>
							{loading ? "Signing in..." : "Sign In"}
						</Button>

						{oidcProviders.length > 0 && (
							<>
								<div className="relative w-full">
									<Separator />
									<span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
										or
									</span>
								</div>
								<div className="flex w-full flex-col gap-2">
									{oidcProviders.map((provider) => (
										<Button
											key={provider.providerId}
											type="button"
											variant="outline"
											className="w-full"
											onClick={() =>
												handleOidcSignIn(provider.providerId)
											}
										>
											Sign in with {provider.displayName}
										</Button>
									))}
								</div>
							</>
						)}

						{!registrationDisabled && (
							<p className="text-sm text-muted-foreground">
								Don&apos;t have an account?{" "}
								<Link
									to="/register"
									className="text-primary underline"
								>
									Register
								</Link>
							</p>
						)}
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
```

- [ ] **Step 2: Update register page**

Modify `src/routes/register.tsx` — add `beforeLoad` to redirect to `/setup` if no users, or show "registration disabled" message:

```typescript
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "src/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import { signUp } from "src/lib/auth-client";
import {
	getRegistrationStatusFn,
	hasUsersFn,
} from "src/server/setup";

export const Route = createFileRoute("/register")({
	beforeLoad: async () => {
		const { hasUsers } = await hasUsersFn();
		if (!hasUsers) {
			throw redirect({ to: "/setup" });
		}
	},
	loader: async () => {
		return getRegistrationStatusFn();
	},
	component: RegisterPage,
});

function RegisterPage() {
	const navigate = useNavigate();
	const { registrationDisabled } = Route.useLoaderData();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);

	if (registrationDisabled) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<Card className="w-full max-w-md">
					<CardHeader className="text-center">
						<CardTitle className="text-2xl font-bold">
							Registration Disabled
						</CardTitle>
						<CardDescription>
							Account registration is currently disabled. Contact your
							administrator for access.
						</CardDescription>
					</CardHeader>
					<CardFooter className="justify-center">
						<Link to="/login" className="text-primary underline">
							Back to Sign In
						</Link>
					</CardFooter>
				</Card>
			</div>
		);
	}

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setLoading(true);
		try {
			const result = await signUp.email({ name, email, password });
			if (result.error) {
				toast.error(result.error.message || "Failed to register");
			} else {
				toast.success("Account created! Signing in...");
				navigate({ to: "/" });
			}
		} catch {
			toast.error("Failed to register");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="flex min-h-screen items-center justify-center">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<CardTitle className="text-2xl font-bold">
						Create Account
					</CardTitle>
					<CardDescription>
						Register for a new Allstarr account
					</CardDescription>
				</CardHeader>
				<form onSubmit={handleSubmit}>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name">Name</Label>
							<Input
								id="name"
								type="text"
								placeholder="Your name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								placeholder="you@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								placeholder="Password (min 8 characters)"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								minLength={8}
							/>
						</div>
					</CardContent>
					<CardFooter className="mt-6 flex flex-col gap-4">
						<Button
							type="submit"
							className="w-full"
							disabled={loading}
						>
							{loading ? "Creating account..." : "Create Account"}
						</Button>
						<p className="text-sm text-muted-foreground">
							Already have an account?{" "}
							<Link
								to="/login"
								className="text-primary underline"
							>
								Sign In
							</Link>
						</p>
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/login.tsx src/routes/register.tsx
git commit -m "feat: add setup redirect and registration controls to login/register"
```

---

### Task 10: Role-Based Route Access Control

**Files:**
- Modify: `src/routes/_authed.tsx`
- Create: `src/routes/_authed/requests/index.tsx`

- [ ] **Step 1: Update _authed.tsx for role-based routing**

Modify `src/routes/_authed.tsx` to redirect requesters to `/requests`:

```typescript
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import AppLayout from "src/components/layout/app-layout";
import NotFound from "src/components/NotFound";
import { SSEContext } from "src/hooks/sse-context";
import { useServerEvents } from "src/hooks/use-server-events";
import { getAuthSessionFn } from "src/server/middleware";
import { hasUsersFn } from "src/server/setup";

export const Route = createFileRoute("/_authed")({
	beforeLoad: async ({ location }) => {
		// Redirect to setup if no users exist
		const { hasUsers } = await hasUsersFn();
		if (!hasUsers) {
			throw redirect({ to: "/setup" });
		}

		const session = await getAuthSessionFn();
		if (!session) {
			throw redirect({
				to: "/login",
				search: { redirect: location.href },
			});
		}

		// Requester role can only access /requests
		const isRequester = session.user.role === "requester";
		const isRequestsRoute = location.pathname.startsWith("/requests");
		if (isRequester && !isRequestsRoute) {
			throw redirect({ to: "/requests" });
		}

		return { session };
	},
	component: AuthedLayout,
	notFoundComponent: NotFound,
});

function AuthedLayout() {
	const { isConnected } = useServerEvents();
	const sseValue = useMemo(() => ({ isConnected }), [isConnected]);
	return (
		<SSEContext.Provider value={sseValue}>
			<AppLayout>
				<Outlet />
			</AppLayout>
		</SSEContext.Provider>
	);
}
```

- [ ] **Step 2: Create requests stub page**

Create `src/routes/_authed/requests/index.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import EmptyState from "src/components/shared/empty-state";
import PageHeader from "src/components/shared/page-header";

export const Route = createFileRoute("/_authed/requests/")({
	component: RequestsPage,
});

function RequestsPage() {
	return (
		<div>
			<PageHeader
				title="Requests"
				description="Request books, movies, and more."
			/>
			<EmptyState
				icon={BookOpen}
				title="Coming Soon"
				description="The requests feature is under development. Check back later!"
			/>
		</div>
	);
}
```

- [ ] **Step 3: Update the index redirect for requesters**

Modify `src/routes/_authed/index.tsx` to redirect requesters to `/requests` instead of `/books`:

```typescript
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/")({
	beforeLoad: async ({ context }) => {
		const role = context.session?.user?.role;
		throw redirect({
			to: role === "requester" ? "/requests" : "/books",
		});
	},
});
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authed.tsx src/routes/_authed/requests/index.tsx src/routes/_authed/index.tsx
git commit -m "feat: add role-based route access control and requests stub page"
```

---

### Task 11: Sidebar Role Filtering

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`
- Create: `src/hooks/use-role.ts`

- [ ] **Step 1: Create role hooks**

Create `src/hooks/use-role.ts`:

```typescript
import { useRouteContext } from "@tanstack/react-router";

export function useUserRole(): string {
	const context = useRouteContext({ from: "/_authed" });
	return context.session?.user?.role || "viewer";
}

export function useIsAdmin(): boolean {
	return useUserRole() === "admin";
}
```

- [ ] **Step 2: Update sidebar to filter by role**

Modify `src/components/layout/app-sidebar.tsx`. Add the role hook import and filter nav groups for requesters:

Add import at the top:
```typescript
import { useUserRole } from "src/hooks/use-role";
```

Inside the `AppSidebar` component, after `const routerState = useRouterState();`, add:

```typescript
const role = useUserRole();
```

Replace the `navGroups` usage with a filtered version. Before the `const activeGroup = getActiveGroup(...)` line, add:

```typescript
const visibleGroups =
	role === "requester"
		? [
				{
					title: "Requests",
					to: "/requests",
					icon: BookOpen,
					matchPrefixes: ["/requests"],
					children: [],
				} satisfies NavGroup,
			]
		: navGroups;
```

Then update all references from `navGroups` to `visibleGroups`:
- `getActiveGroup(currentPath, visibleGroups)` instead of `getActiveGroup(currentPath, navGroups)`
- `{visibleGroups.map((group) => {` instead of `{navGroups.map((group) => {`

Also add the `BookOpen` import from lucide-react (it's already imported).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-role.ts src/components/layout/app-sidebar.tsx
git commit -m "feat: filter sidebar navigation by user role"
```

---

### Task 12: Validators for User Management and OIDC

**Files:**
- Modify: `src/lib/validators.ts`

- [ ] **Step 1: Add validators**

Add the following schemas to the end of `src/lib/validators.ts`:

```typescript
// ─── User Management ────────────────────────────────────────────────────────

export const userRoleSchema = z.enum(["admin", "viewer", "requester"]);

export const setUserRoleSchema = z.object({
	userId: z.string(),
	role: userRoleSchema,
});

export const createUserSchema = z.object({
	name: z.string().min(1),
	email: z.string().email(),
	password: z.string().min(8),
	role: userRoleSchema,
});

export const deleteUserSchema = z.object({
	userId: z.string(),
});

export const updateDefaultRoleSchema = z.object({
	role: z.enum(["viewer", "requester"]),
});

// ─── OIDC Providers ─────────────────────────────────────────────────────────

export const createOidcProviderSchema = z.object({
	providerId: z
		.string()
		.min(1)
		.regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with hyphens"),
	displayName: z.string().min(1),
	clientId: z.string().min(1),
	clientSecret: z.string().min(1),
	discoveryUrl: z.string().url(),
	scopes: z.array(z.string()).default(["openid", "profile", "email"]),
	trusted: z.boolean().default(false),
	enabled: z.boolean().default(true),
});

export const updateOidcProviderSchema = z.object({
	id: z.string(),
	displayName: z.string().min(1).optional(),
	clientId: z.string().min(1).optional(),
	clientSecret: z.string().min(1).optional(),
	discoveryUrl: z.string().url().optional(),
	scopes: z.array(z.string()).optional(),
	trusted: z.boolean().optional(),
	enabled: z.boolean().optional(),
});

export const deleteOidcProviderSchema = z.object({
	id: z.string(),
});
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/validators.ts
git commit -m "feat: add validators for user management and OIDC providers"
```

---

### Task 13: User Management Server Functions

**Files:**
- Create: `src/server/users.ts`

- [ ] **Step 1: Create user management server functions**

Create `src/server/users.ts`:

```typescript
import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { account, session, user } from "src/db/schema";
import { settings } from "src/db/schema";
import { desc, eq, max } from "drizzle-orm";
import {
	createUserSchema,
	deleteUserSchema,
	setUserRoleSchema,
	updateDefaultRoleSchema,
} from "src/lib/validators";
import { auth } from "src/lib/auth";
import { requireAdmin } from "./middleware";

export const listUsersFn = createServerFn({ method: "GET" }).handler(
	async () => {
		const session_ = await requireAdmin();

		// Get all users with their latest session and account provider
		const users = db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
				image: user.image,
				createdAt: user.createdAt,
			})
			.from(user)
			.orderBy(desc(user.createdAt))
			.all();

		// Batch query: last login time per user (most recent session)
		const lastLogins = db
			.select({
				userId: session.userId,
				lastLogin: max(session.createdAt),
			})
			.from(session)
			.groupBy(session.userId)
			.all();

		const lastLoginMap = new Map(
			lastLogins.map((l) => [l.userId, l.lastLogin]),
		);

		// Batch query: auth method per user (provider from account table)
		const accounts = db
			.select({
				userId: account.userId,
				providerId: account.providerId,
			})
			.from(account)
			.all();

		const authMethodMap = new Map<string, string>();
		for (const acc of accounts) {
			// If user has an oauth2 account, use the provider name.
			// "credential" means email/password.
			const current = authMethodMap.get(acc.userId);
			if (!current || acc.providerId !== "credential") {
				authMethodMap.set(acc.userId, acc.providerId);
			}
		}

		return users.map((u) => ({
			...u,
			lastLogin: lastLoginMap.get(u.id) ?? null,
			authMethod: authMethodMap.get(u.id) ?? "credential",
		}));
	},
);

export const setUserRoleFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => setUserRoleSchema.parse(d))
	.handler(async ({ data }) => {
		const session_ = await requireAdmin();

		// Prevent changing your own role
		if (data.userId === session_.user.id) {
			throw new Error("Cannot change your own role");
		}

		db.update(user)
			.set({ role: data.role })
			.where(eq(user.id, data.userId))
			.run();

		return { success: true };
	});

export const createUserFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => createUserSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();

		// Use better-auth admin endpoint to create user
		const result = await auth.api.createUser({
			body: {
				name: data.name,
				email: data.email,
				password: data.password,
				role: data.role,
			},
		});

		return result;
	});

export const deleteUserFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => deleteUserSchema.parse(d))
	.handler(async ({ data }) => {
		const session_ = await requireAdmin();

		// Prevent deleting yourself
		if (data.userId === session_.user.id) {
			throw new Error("Cannot delete your own account");
		}

		// Use better-auth admin endpoint to remove user
		await auth.api.removeUser({
			body: { userId: data.userId },
		});

		return { success: true };
	});

export const getDefaultRoleFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAdmin();
		const row = db
			.select()
			.from(settings)
			.where(eq(settings.key, "auth.defaultRole"))
			.get();

		let value = "requester";
		if (row?.value) {
			try {
				const parsed =
					typeof row.value === "string"
						? JSON.parse(row.value)
						: row.value;
				if (parsed === "viewer" || parsed === "requester") {
					value = parsed;
				}
			} catch {}
		}
		return { defaultRole: value };
	},
);

export const updateDefaultRoleFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => updateDefaultRoleSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		db.insert(settings)
			.values({
				key: "auth.defaultRole",
				value: JSON.stringify(data.role),
			})
			.onConflictDoUpdate({
				target: settings.key,
				set: { value: JSON.stringify(data.role) },
			})
			.run();
		return { success: true };
	});
```

- [ ] **Step 2: Commit**

```bash
git add src/server/users.ts
git commit -m "feat: add user management server functions"
```

---

### Task 14: OIDC Provider Server Functions

**Files:**
- Create: `src/server/oidc-providers.ts`

- [ ] **Step 1: Create OIDC provider CRUD server functions**

Create `src/server/oidc-providers.ts`:

```typescript
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "src/db";
import { oidcProviders } from "src/db/schema";
import {
	createOidcProviderSchema,
	deleteOidcProviderSchema,
	updateOidcProviderSchema,
} from "src/lib/validators";
import { requireAdmin } from "./middleware";

export const listOidcProvidersFn = createServerFn({
	method: "GET",
}).handler(async () => {
	await requireAdmin();
	return db.select().from(oidcProviders).all();
});

export const createOidcProviderFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => createOidcProviderSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();

		// Check for duplicate providerId
		const existing = db
			.select()
			.from(oidcProviders)
			.where(eq(oidcProviders.providerId, data.providerId))
			.get();

		if (existing) {
			throw new Error(
				`Provider with ID "${data.providerId}" already exists`,
			);
		}

		const provider = db
			.insert(oidcProviders)
			.values(data)
			.returning()
			.get();

		return provider;
	});

export const updateOidcProviderFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => updateOidcProviderSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		const { id, ...updates } = data;

		db.update(oidcProviders)
			.set(updates)
			.where(eq(oidcProviders.id, id))
			.run();

		return { success: true };
	});

export const deleteOidcProviderFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => deleteOidcProviderSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();

		db.delete(oidcProviders)
			.where(eq(oidcProviders.id, data.id))
			.run();

		return { success: true };
	});
```

- [ ] **Step 2: Commit**

```bash
git add src/server/oidc-providers.ts
git commit -m "feat: add OIDC provider CRUD server functions"
```

---

### Task 15: Nav Config — Add Users Settings Item

**Files:**
- Modify: `src/lib/nav-config.ts`

- [ ] **Step 1: Add Users item to settings nav**

Add the `Users` import from lucide-react (already imported in sidebar but needs to be in nav-config). Add the Users nav item as the first item in the `settingsNavItems` array:

```typescript
import {
	Activity,
	BookOpen,
	Download,
	FileText,
	FileType,
	HardDrive,
	History,
	ListFilter,
	ListPlus,
	ListTodo,
	Radar,
	Settings,
	Sliders,
	Users,
} from "lucide-react";
```

Add as the first item in `settingsNavItems`:

```typescript
{
	title: "Users",
	to: "/settings/users",
	icon: Users,
	description: "Manage users, roles, and authentication providers.",
},
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/nav-config.ts
git commit -m "feat: add Users item to settings nav config"
```

---

### Task 16: User Management Settings Page

**Files:**
- Create: `src/routes/_authed/settings/users.tsx`

- [ ] **Step 1: Create the users settings page**

Create `src/routes/_authed/settings/users.tsx`:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import PageHeader from "src/components/shared/page-header";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "src/components/ui/dialog";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "src/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "src/components/ui/table";
import { useIsAdmin } from "src/hooks/use-role";
import {
	createOidcProviderFn,
	deleteOidcProviderFn,
	listOidcProvidersFn,
	updateOidcProviderFn,
} from "src/server/oidc-providers";
import { getRegistrationStatusFn } from "src/server/setup";
import {
	createUserFn,
	deleteUserFn,
	getDefaultRoleFn,
	listUsersFn,
	setUserRoleFn,
	updateDefaultRoleFn,
} from "src/server/users";

export const Route = createFileRoute("/_authed/settings/users")({
	loader: async () => {
		const [users, defaultRole, oidcProviders, registrationStatus] =
			await Promise.all([
				listUsersFn(),
				getDefaultRoleFn(),
				listOidcProvidersFn(),
				getRegistrationStatusFn(),
			]);
		return { users, defaultRole, oidcProviders, registrationStatus };
	},
	component: UsersSettingsPage,
});

function UsersSettingsPage() {
	const router = useRouter();
	const { users, defaultRole, oidcProviders, registrationStatus } =
		Route.useLoaderData();
	const isAdmin = useIsAdmin();

	return (
		<div className="space-y-6">
			<PageHeader
				title="Users"
				description="Manage users, roles, and authentication providers."
			/>

			<RegistrationSettingsSection
				defaultRole={defaultRole.defaultRole}
				registrationDisabled={registrationStatus.registrationDisabled}
				isAdmin={isAdmin}
			/>

			<UsersTableSection users={users} isAdmin={isAdmin} />

			<OidcProvidersSection
				providers={oidcProviders}
				isAdmin={isAdmin}
			/>
		</div>
	);
}

// ─── Registration Settings ──────────────────────────────────────────────────

function RegistrationSettingsSection({
	defaultRole,
	registrationDisabled,
	isAdmin,
}: {
	defaultRole: string;
	registrationDisabled: boolean;
	isAdmin: boolean;
}) {
	const router = useRouter();

	const handleDefaultRoleChange = async (role: string) => {
		try {
			await updateDefaultRoleFn({
				data: { role: role as "viewer" | "requester" },
			});
			toast.success("Default role updated");
			router.invalidate();
		} catch {
			toast.error("Failed to update default role");
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Registration</CardTitle>
				<CardDescription>
					Control how new users can register for accounts.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center justify-between">
					<div>
						<Label>Account Registration</Label>
						<p className="text-sm text-muted-foreground">
							Controlled by the DISABLE_REGISTRATION environment
							variable.
						</p>
					</div>
					<Badge variant={registrationDisabled ? "destructive" : "default"}>
						{registrationDisabled ? "Disabled" : "Enabled"}
					</Badge>
				</div>
				<div className="space-y-2">
					<Label>Default Role for New Users</Label>
					<Select
						value={defaultRole}
						onValueChange={handleDefaultRoleChange}
						disabled={!isAdmin}
					>
						<SelectTrigger className="w-48">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="viewer">Viewer</SelectItem>
							<SelectItem value="requester">Requester</SelectItem>
						</SelectContent>
					</Select>
					<p className="text-sm text-muted-foreground">
						Role assigned to newly registered users.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}

// ─── Users Table ────────────────────────────────────────────────────────────

type UserRow = {
	id: string;
	name: string;
	email: string;
	role: string | null;
	image: string | null;
	createdAt: Date;
	lastLogin: Date | null;
	authMethod: string;
};

function UsersTableSection({
	users,
	isAdmin,
}: {
	users: UserRow[];
	isAdmin: boolean;
}) {
	const router = useRouter();
	const [createOpen, setCreateOpen] = useState(false);
	const [deleteUserId, setDeleteUserId] = useState<string | null>(null);

	const handleRoleChange = async (userId: string, role: string) => {
		try {
			await setUserRoleFn({
				data: { userId, role: role as "admin" | "viewer" | "requester" },
			});
			toast.success("Role updated");
			router.invalidate();
		} catch (e) {
			toast.error(
				e instanceof Error ? e.message : "Failed to update role",
			);
		}
	};

	const handleDelete = async () => {
		if (!deleteUserId) return;
		try {
			await deleteUserFn({ data: { userId: deleteUserId } });
			toast.success("User deleted");
			setDeleteUserId(null);
			router.invalidate();
		} catch (e) {
			toast.error(
				e instanceof Error ? e.message : "Failed to delete user",
			);
		}
	};

	const formatDate = (date: Date | null) => {
		if (!date) return "Never";
		return new Date(date).toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<div>
					<CardTitle>Users</CardTitle>
					<CardDescription>
						Manage user accounts and their roles.
					</CardDescription>
				</div>
				{isAdmin && (
					<CreateUserDialog
						open={createOpen}
						onOpenChange={setCreateOpen}
					/>
				)}
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Auth Method</TableHead>
							<TableHead>Last Login</TableHead>
							<TableHead>Created</TableHead>
							{isAdmin && (
								<TableHead className="w-12" />
							)}
						</TableRow>
					</TableHeader>
					<TableBody>
						{users.map((u) => (
							<TableRow key={u.id}>
								<TableCell>{u.name}</TableCell>
								<TableCell>{u.email}</TableCell>
								<TableCell>
									{isAdmin ? (
										<Select
											value={u.role || "viewer"}
											onValueChange={(role) =>
												handleRoleChange(u.id, role)
											}
										>
											<SelectTrigger className="w-32">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="admin">
													Admin
												</SelectItem>
												<SelectItem value="viewer">
													Viewer
												</SelectItem>
												<SelectItem value="requester">
													Requester
												</SelectItem>
											</SelectContent>
										</Select>
									) : (
										<Badge variant="outline">
											{u.role || "viewer"}
										</Badge>
									)}
								</TableCell>
								<TableCell>
									<Badge variant="secondary">
										{u.authMethod === "credential"
											? "Email"
											: u.authMethod}
									</Badge>
								</TableCell>
								<TableCell>{formatDate(u.lastLogin)}</TableCell>
								<TableCell>{formatDate(u.createdAt)}</TableCell>
								{isAdmin && (
									<TableCell>
										<Button
											variant="ghost"
											size="icon"
											onClick={() =>
												setDeleteUserId(u.id)
											}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</TableCell>
								)}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>

			<ConfirmDialog
				open={!!deleteUserId}
				onOpenChange={(open) => !open && setDeleteUserId(null)}
				title="Delete User"
				description="Are you sure you want to delete this user? This action cannot be undone."
				onConfirm={handleDelete}
				variant="destructive"
			/>
		</Card>
	);
}

// ─── Create User Dialog ─────────────────────────────────────────────────────

function CreateUserDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const router = useRouter();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [role, setRole] = useState("viewer");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async () => {
		setLoading(true);
		try {
			await createUserFn({
				data: {
					name,
					email,
					password,
					role: role as "admin" | "viewer" | "requester",
				},
			});
			toast.success("User created");
			onOpenChange(false);
			setName("");
			setEmail("");
			setPassword("");
			setRole("viewer");
			router.invalidate();
		} catch (e) {
			toast.error(
				e instanceof Error ? e.message : "Failed to create user",
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogTrigger asChild>
				<Button size="sm">
					<Plus className="mr-2 h-4 w-4" />
					Add User
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create User</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label>Name</Label>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="User name"
						/>
					</div>
					<div className="space-y-2">
						<Label>Email</Label>
						<Input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="user@example.com"
						/>
					</div>
					<div className="space-y-2">
						<Label>Password</Label>
						<Input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="Minimum 8 characters"
						/>
					</div>
					<div className="space-y-2">
						<Label>Role</Label>
						<Select value={role} onValueChange={setRole}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="admin">Admin</SelectItem>
								<SelectItem value="viewer">Viewer</SelectItem>
								<SelectItem value="requester">
									Requester
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button onClick={handleSubmit} disabled={loading}>
						{loading ? "Creating..." : "Create User"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── OIDC Providers Section ─────────────────────────────────────────────────

type OidcProvider = {
	id: string;
	providerId: string;
	displayName: string;
	clientId: string;
	clientSecret: string;
	discoveryUrl: string;
	scopes: string[];
	trusted: boolean;
	enabled: boolean;
	createdAt: Date;
};

function OidcProvidersSection({
	providers,
	isAdmin,
}: {
	providers: OidcProvider[];
	isAdmin: boolean;
}) {
	const router = useRouter();
	const [createOpen, setCreateOpen] = useState(false);
	const [deleteId, setDeleteId] = useState<string | null>(null);

	const handleToggleEnabled = async (
		id: string,
		enabled: boolean,
	) => {
		try {
			await updateOidcProviderFn({ data: { id, enabled } });
			toast.success(
				`Provider ${enabled ? "enabled" : "disabled"}. Restart required.`,
			);
			router.invalidate();
		} catch {
			toast.error("Failed to update provider");
		}
	};

	const handleToggleTrusted = async (
		id: string,
		trusted: boolean,
	) => {
		try {
			await updateOidcProviderFn({ data: { id, trusted } });
			toast.success("Provider trust updated. Restart required.");
			router.invalidate();
		} catch {
			toast.error("Failed to update provider");
		}
	};

	const handleDelete = async () => {
		if (!deleteId) return;
		try {
			await deleteOidcProviderFn({ data: { id: deleteId } });
			toast.success("Provider deleted. Restart required.");
			setDeleteId(null);
			router.invalidate();
		} catch {
			toast.error("Failed to delete provider");
		}
	};

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<div>
					<CardTitle>OIDC Providers</CardTitle>
					<CardDescription>
						Configure single sign-on providers. Changes require a
						server restart to take effect.
					</CardDescription>
				</div>
				{isAdmin && (
					<CreateOidcProviderDialog
						open={createOpen}
						onOpenChange={setCreateOpen}
					/>
				)}
			</CardHeader>
			<CardContent>
				{providers.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No OIDC providers configured.
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Provider ID</TableHead>
								<TableHead>Discovery URL</TableHead>
								<TableHead>Trusted</TableHead>
								<TableHead>Enabled</TableHead>
								{isAdmin && (
									<TableHead className="w-12" />
								)}
							</TableRow>
						</TableHeader>
						<TableBody>
							{providers.map((p) => (
								<TableRow key={p.id}>
									<TableCell>{p.displayName}</TableCell>
									<TableCell>
										<code className="text-xs">
											{p.providerId}
										</code>
									</TableCell>
									<TableCell className="max-w-48 truncate text-sm">
										{p.discoveryUrl}
									</TableCell>
									<TableCell>
										<input
											type="checkbox"
											checked={p.trusted}
											onChange={(e) =>
												handleToggleTrusted(
													p.id,
													e.target.checked,
												)
											}
											disabled={!isAdmin}
										/>
									</TableCell>
									<TableCell>
										<input
											type="checkbox"
											checked={p.enabled}
											onChange={(e) =>
												handleToggleEnabled(
													p.id,
													e.target.checked,
												)
											}
											disabled={!isAdmin}
										/>
									</TableCell>
									{isAdmin && (
										<TableCell>
											<Button
												variant="ghost"
												size="icon"
												onClick={() =>
													setDeleteId(p.id)
												}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</TableCell>
									)}
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>

			<ConfirmDialog
				open={!!deleteId}
				onOpenChange={(open) => !open && setDeleteId(null)}
				title="Delete OIDC Provider"
				description="Are you sure? This requires a server restart to take effect."
				onConfirm={handleDelete}
				variant="destructive"
			/>
		</Card>
	);
}

// ─── Create OIDC Provider Dialog ────────────────────────────────────────────

function CreateOidcProviderDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const router = useRouter();
	const [providerId, setProviderId] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [clientId, setClientId] = useState("");
	const [clientSecret, setClientSecret] = useState("");
	const [discoveryUrl, setDiscoveryUrl] = useState("");
	const [trusted, setTrusted] = useState(false);
	const [loading, setLoading] = useState(false);

	const handleSubmit = async () => {
		setLoading(true);
		try {
			await createOidcProviderFn({
				data: {
					providerId,
					displayName,
					clientId,
					clientSecret,
					discoveryUrl,
					trusted,
				},
			});
			toast.success("Provider created. Restart required.");
			onOpenChange(false);
			setProviderId("");
			setDisplayName("");
			setClientId("");
			setClientSecret("");
			setDiscoveryUrl("");
			setTrusted(false);
			router.invalidate();
		} catch (e) {
			toast.error(
				e instanceof Error
					? e.message
					: "Failed to create provider",
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogTrigger asChild>
				<Button size="sm">
					<Plus className="mr-2 h-4 w-4" />
					Add Provider
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add OIDC Provider</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label>Display Name</Label>
						<Input
							value={displayName}
							onChange={(e) =>
								setDisplayName(e.target.value)
							}
							placeholder="e.g. Authentik"
						/>
					</div>
					<div className="space-y-2">
						<Label>Provider ID</Label>
						<Input
							value={providerId}
							onChange={(e) =>
								setProviderId(e.target.value)
							}
							placeholder="e.g. authentik (lowercase, hyphens)"
						/>
						<p className="text-xs text-muted-foreground">
							Used in callback URLs. Must be lowercase
							alphanumeric with hyphens.
						</p>
					</div>
					<div className="space-y-2">
						<Label>Client ID</Label>
						<Input
							value={clientId}
							onChange={(e) =>
								setClientId(e.target.value)
							}
						/>
					</div>
					<div className="space-y-2">
						<Label>Client Secret</Label>
						<Input
							type="password"
							value={clientSecret}
							onChange={(e) =>
								setClientSecret(e.target.value)
							}
						/>
					</div>
					<div className="space-y-2">
						<Label>Discovery URL</Label>
						<Input
							value={discoveryUrl}
							onChange={(e) =>
								setDiscoveryUrl(e.target.value)
							}
							placeholder="https://auth.example.com/.well-known/openid-configuration"
						/>
					</div>
					<div className="flex items-center gap-2">
						<input
							type="checkbox"
							id="trusted"
							checked={trusted}
							onChange={(e) =>
								setTrusted(e.target.checked)
							}
						/>
						<Label htmlFor="trusted">
							Trusted provider (can create accounts even when
							registration is disabled)
						</Label>
					</div>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button onClick={handleSubmit} disabled={loading}>
						{loading ? "Creating..." : "Add Provider"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 2: Verify the page renders**

```bash
bun run dev
```

Navigate to `/settings/users` and verify the page loads without errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authed/settings/users.tsx
git commit -m "feat: add user management settings page with OIDC provider management"
```

---

### Task 17: Update .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add DISABLE_REGISTRATION to .env.example**

Add after the `BETTER_AUTH_URL` line:

```
# Set to "true" to disable new account registration (email/password).
# Trusted OIDC providers can still auto-create accounts.
# Registration is always allowed when no users exist (first-run setup).
# DISABLE_REGISTRATION=true
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "feat: add DISABLE_REGISTRATION env var to .env.example"
```

---

### Task 18: Verify Full Feature

- [ ] **Step 1: Run the build**

```bash
bun run build
```

Ensure no TypeScript or build errors.

- [ ] **Step 2: Run existing tests**

```bash
bun run test
```

Ensure existing unit tests still pass.

- [ ] **Step 3: Manual verification checklist**

Start the dev server and verify:

```bash
bun run dev
```

1. **Setup wizard:** Delete the database, restart. Navigate to any URL → should redirect to `/setup`. Create admin account → should redirect to `/`.
2. **Admin access:** Login as admin → full sidebar, all actions enabled.
3. **Register second user:** Go to `/register` → create account → should be assigned "requester" role by default.
4. **Requester routing:** Login as requester → should redirect to `/requests`. Try navigating to `/books` → redirected back to `/requests`. Sidebar shows only "Requests".
5. **User management:** Login as admin → `/settings/users` → see both users, change requester to viewer, delete user.
6. **Viewer access:** Login as viewer → full sidebar visible, but mutation buttons (Add, Delete, Edit) should be disabled.
7. **OIDC providers:** Add a provider in settings → verify "restart required" messaging.

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during verification"
```
