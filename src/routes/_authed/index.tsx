import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/")({
	beforeLoad: async ({ context }) => {
		const role = context.session?.user?.role;
		throw redirect({
			to: role === "requester" ? "/requests" : "/books",
		});
	},
});
