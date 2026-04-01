import { Loader2 } from "lucide-react";
import type { JSX } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "src/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "src/components/ui/select";
import { useUpdateManga } from "src/hooks/mutations/manga";

type MangaBulkBarProps = {
	selectedIds: Set<number>;
	onDone: () => void;
};

export default function MangaBulkBar({
	selectedIds,
	onDone,
}: MangaBulkBarProps): JSX.Element {
	const [monitorNewChapters, setMonitorNewChapters] = useState("");
	const [applying, setApplying] = useState(false);

	const updateManga = useUpdateManga();

	const handleApply = async () => {
		if (selectedIds.size === 0) {
			return;
		}
		setApplying(true);

		const ids = [...selectedIds];
		const promises = ids.map((id) => {
			const payload: {
				id: number;
				monitorNewChapters?: "all" | "future" | "missing" | "none";
			} = { id };
			if (monitorNewChapters) {
				payload.monitorNewChapters = monitorNewChapters as
					| "all"
					| "future"
					| "missing"
					| "none";
			}
			return updateManga.mutateAsync(payload);
		});

		try {
			await Promise.all(promises);
			toast.success(`Updated ${ids.length} manga`);
			onDone();
		} catch {
			toast.error("Some updates failed");
		} finally {
			setApplying(false);
		}
	};

	return (
		<div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-zinc-950 px-6 py-3">
			<div className="flex items-center gap-4 max-w-7xl mx-auto">
				<span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
					{selectedIds.size} selected
				</span>

				<Select
					value={monitorNewChapters}
					onValueChange={setMonitorNewChapters}
				>
					<SelectTrigger className="w-44">
						<SelectValue placeholder="Monitor Chapters" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All</SelectItem>
						<SelectItem value="future">Future Only</SelectItem>
						<SelectItem value="missing">Missing</SelectItem>
						<SelectItem value="none">None</SelectItem>
					</SelectContent>
				</Select>

				<div className="ml-auto">
					<Button
						disabled={selectedIds.size === 0 || applying}
						onClick={handleApply}
					>
						{applying ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Applying...
							</>
						) : (
							"Apply"
						)}
					</Button>
				</div>
			</div>
		</div>
	);
}
