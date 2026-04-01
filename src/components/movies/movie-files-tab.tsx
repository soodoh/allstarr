import { Film } from "lucide-react";
import type { JSX } from "react";
import EmptyState from "src/components/shared/empty-state";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";

type MovieFile = {
	id: number;
	path: string;
	size: number;
	quality: {
		quality: { id: number; name: string };
		revision: { version: number; real: number };
	} | null;
	dateAdded: Date;
	duration: number | null;
	codec: string | null;
	container: string | null;
};

type MovieFilesTabProps = {
	files: MovieFile[];
};

function formatSize(bytes: number): string {
	const mb = bytes / 1024 / 1024;
	if (mb >= 1024) {
		return `${(mb / 1024).toFixed(1)} GB`;
	}
	return `${mb.toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	if (h === 0) {
		return `${m}m`;
	}
	if (m === 0) {
		return `${h}h`;
	}
	return `${h}h ${m}m`;
}

export default function MovieFilesTab({
	files,
}: MovieFilesTabProps): JSX.Element {
	if (files.length === 0) {
		return (
			<EmptyState
				icon={Film}
				title="No movie files"
				description="No files have been imported for this movie yet."
			/>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Files ({files.length})</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b text-muted-foreground">
								<th className="text-left font-medium py-2 pr-4">Path</th>
								<th className="text-left font-medium py-2 pr-4">Size</th>
								<th className="text-left font-medium py-2 pr-4">Quality</th>
								<th className="text-left font-medium py-2 pr-4">Codec</th>
								<th className="text-left font-medium py-2 pr-4">Container</th>
								<th className="text-left font-medium py-2 pr-4">Duration</th>
								<th className="text-left font-medium py-2">Date Added</th>
							</tr>
						</thead>
						<tbody>
							{files.map((file) => (
								<tr key={file.id} className="border-b last:border-b-0">
									<td className="py-2 pr-4 max-w-xs truncate" title={file.path}>
										{file.path}
									</td>
									<td className="py-2 pr-4 whitespace-nowrap">
										{formatSize(file.size)}
									</td>
									<td className="py-2 pr-4 whitespace-nowrap">
										{file.quality?.quality.name ?? "Unknown"}
									</td>
									<td className="py-2 pr-4 whitespace-nowrap">
										{file.codec ?? "-"}
									</td>
									<td className="py-2 pr-4 whitespace-nowrap">
										{file.container ?? "-"}
									</td>
									<td className="py-2 pr-4 whitespace-nowrap">
										{file.duration ? formatDuration(file.duration) : "-"}
									</td>
									<td className="py-2 whitespace-nowrap">
										{new Date(file.dateAdded).toLocaleDateString()}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	);
}
