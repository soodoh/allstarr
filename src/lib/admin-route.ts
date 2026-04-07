import { redirect } from "@tanstack/react-router";

type AdminBeforeLoadArgs = {
	context: {
		session: {
			user: {
				role?: string | null;
			};
		};
	};
};

export function requireAdminBeforeLoad({ context }: AdminBeforeLoadArgs): void {
	if (context.session.user.role !== "admin") {
		throw redirect({ to: "/" });
	}
}
