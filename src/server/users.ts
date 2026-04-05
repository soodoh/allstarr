import { createServerFn } from "@tanstack/react-start";
import { desc, eq, max } from "drizzle-orm";
import { db } from "src/db";
import { account, session, settings, user } from "src/db/schema";
import { auth } from "src/lib/auth";
import {
	createUserSchema,
	deleteUserSchema,
	setUserRoleSchema,
	updateDefaultRoleSchema,
} from "src/lib/validators";
import { requireAdmin } from "./middleware";

export const listUsersFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAdmin();

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

		// Batch query: last login time per user
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

		// Batch query: auth method per user
		const accounts = db
			.select({
				userId: account.userId,
				providerId: account.providerId,
			})
			.from(account)
			.all();

		const authMethodMap = new Map<string, string>();
		for (const acc of accounts) {
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

		if (data.userId === session_.user.id) {
			throw new Error("Cannot delete your own account");
		}

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
					typeof row.value === "string" ? JSON.parse(row.value) : row.value;
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
