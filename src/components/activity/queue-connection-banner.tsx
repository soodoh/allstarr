import { AlertTriangle, X } from "lucide-react";
import type { JSX } from "react";
import { useState } from "react";
import { Button } from "src/components/ui/button";

type QueueConnectionBannerProps = {
	warnings: string[];
};

export default function QueueConnectionBanner({
	warnings,
}: QueueConnectionBannerProps): JSX.Element | null {
	const [dismissed, setDismissed] = useState<Set<string>>(new Set());

	const visible = warnings.filter((w) => !dismissed.has(w));

	if (visible.length === 0) {
		return null;
	}

	return (
		<div className="space-y-2 mb-4">
			{visible.map((warning) => (
				<div
					key={warning}
					className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200"
				>
					<div className="flex items-center gap-2">
						<AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
						<span>{warning}</span>
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="h-6 w-6 shrink-0"
						onClick={() => setDismissed((prev) => new Set([...prev, warning]))}
						aria-label="Dismiss warning"
					>
						<X className="h-3.5 w-3.5" />
					</Button>
				</div>
			))}
		</div>
	);
}
