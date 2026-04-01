import { createFileRoute, Link } from "@tanstack/react-router";
import PageHeader from "src/components/shared/page-header";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";
import { settingsNavItems } from "src/lib/nav-config";

export const Route = createFileRoute("/_authed/settings/")({
	component: SettingsPage,
});

function SettingsPage() {
	return (
		<div>
			<PageHeader
				title="Settings"
				description="Manage your Allstarr configuration."
			/>

			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{settingsNavItems.map((item) => (
					<Link key={item.title} to={item.to}>
						<Card className="h-full transition-colors hover:border-primary hover:bg-accent/50 cursor-pointer">
							<CardHeader>
								<div className="flex items-center gap-3">
									<item.icon className="h-6 w-6 text-primary" />
									<CardTitle>{item.title}</CardTitle>
								</div>
								<CardDescription>{item.description}</CardDescription>
							</CardHeader>
							<CardContent />
						</Card>
					</Link>
				))}
			</div>
		</div>
	);
}
