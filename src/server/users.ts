import { createServerFn } from "@tanstack/react-start";
import { desc, eq, max } from "drizzle-orm";
import { db } from "src/db";
import { account, session, user } from "src/db/schema";
import { getAuth } from "src/lib/auth";
import {
	createUserSchema,
	deleteUserSchema,
	setUserRoleSchema,
	updateDefaultRoleSchema,
} from "src/lib/validators";
import type { z } from "zod";
import { requireAdmin } from "./middleware";
import { getSettingValue, upsertSettingValue } from "./settings-store";

type ManagedUserRole = z.infer<typeof setUserRoleSchema>["role"];
type DefaultUserRole = z.infer<typeof updateDefaultRoleSchema>["role"];

function isDefaultUserRole(role: string): role is DefaultUserRole {
	return role === "viewer" || role === "requester";
}

function getBetterAuthCreateRole(role: ManagedUserRole): "admin" | undefined {
	return role === "admin" ? "admin" : undefined;
}

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
		const auth = await getAuth();

		const result = await auth.api.createUser({
			body: {
				name: data.name,
				email: data.email,
				password: data.password,
				role: getBetterAuthCreateRole(data.role),
			},
		});

		if (data.role !== "admin") {
			db.update(user)
				.set({ role: data.role })
				.where(eq(user.id, result.user.id))
				.run();
		}

		return result;
	});

export const deleteUserFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => deleteUserSchema.parse(d))
	.handler(async ({ data }) => {
		const session_ = await requireAdmin();
		const auth = await getAuth();

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
		const defaultRole = getSettingValue<string>(
			"auth.defaultRole",
			"requester",
		);
		return {
			defaultRole: isDefaultUserRole(defaultRole)
				? defaultRole
				: ("requester" satisfies DefaultUserRole),
		};
	},
);

export const updateDefaultRoleFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => updateDefaultRoleSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		upsertSettingValue("auth.defaultRole", data.role);
		return { success: true };
	});
