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
