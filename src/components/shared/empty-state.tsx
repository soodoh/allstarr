import type { LucideIcon } from "lucide-react";
import type { JSX, ReactNode } from "react";

type EmptyStateProps = {
	icon: LucideIcon;
	title: string;
	description: string;
	action?: ReactNode;
};

export default function EmptyState({
	icon: Icon,
	title,
	description,
	action,
}: EmptyStateProps): JSX.Element {
	return (
		<div className="flex flex-col items-center justify-center py-16 text-center">
			<Icon className="h-12 w-12 text-muted-foreground/50 mb-4" />
			<h3 className="text-lg font-medium mb-1">{title}</h3>
			<p className="text-sm text-muted-foreground mb-4 max-w-sm">
				{description}
			</p>
			{action}
		</div>
	);
}
