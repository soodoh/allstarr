import { BookOpen } from "lucide-react";
import type { JSX } from "react";
import EmptyState from "src/components/shared/empty-state";
import { TabsContent } from "src/components/ui/tabs";
import { formatBytes } from "src/lib/format";

type BookFile = {
	id: number;
	path: string;
	size: number;
	quality: {
		quality: { id: number; name: string };
		revision: { version: number; real: number };
	} | null;
	dateAdded: Date;
	part: number | null;
	partCount: number | null;
	duration: number | null;
	bitrate: number | null;
	codec: string | null;
	pageCount: number | null;
};

type BookFilesTabProps = {
	files: BookFile[];
};

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

function isAudioFile(file: BookFile): boolean {
	return file.duration !== null || file.bitrate !== null || file.codec !== null;
}

export default function BookFilesTab({
	files,
}: BookFilesTabProps): JSX.Element {
	if (files.length === 0) {
		return (
			<TabsContent value="files" className="flex-1 min-h-0">
				<EmptyState
					icon={BookOpen}
					title="No book files"
					description="No files have been imported for this book yet."
				/>
			</TabsContent>
		);
	}

	const hasAudio = files.some(isAudioFile);
	const hasEbook = files.some((f) => f.pageCount !== null);

	return (
		<TabsContent value="files" className="flex-1 min-h-0">
			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b text-muted-foreground">
							<th className="text-left font-medium py-2 pr-4">Path</th>
							<th className="text-left font-medium py-2 pr-4">Size</th>
							<th className="text-left font-medium py-2 pr-4">Format</th>
							{hasAudio && (
								<>
									<th className="text-left font-medium py-2 pr-4">Part</th>
									<th className="text-left font-medium py-2 pr-4">Duration</th>
									<th className="text-left font-medium py-2 pr-4">Bitrate</th>
									<th className="text-left font-medium py-2 pr-4">Codec</th>
								</>
							)}
							{hasEbook && (
								<th className="text-left font-medium py-2 pr-4">Pages</th>
							)}
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
									{formatBytes(file.size)}
								</td>
								<td className="py-2 pr-4 whitespace-nowrap">
									{file.quality?.quality.name ?? "Unknown"}
								</td>
								{hasAudio && (
									<>
										<td className="py-2 pr-4 whitespace-nowrap">
											{file.part && file.partCount
												? `Part ${file.part} of ${file.partCount}`
												: "-"}
										</td>
										<td className="py-2 pr-4 whitespace-nowrap">
											{file.duration ? formatDuration(file.duration) : "-"}
										</td>
										<td className="py-2 pr-4 whitespace-nowrap">
											{file.bitrate
												? `${Math.round(file.bitrate / 1000)} kbps`
												: "-"}
										</td>
										<td className="py-2 pr-4 whitespace-nowrap">
											{file.codec ?? "-"}
										</td>
									</>
								)}
								{hasEbook && (
									<td className="py-2 pr-4 whitespace-nowrap">
										{file.pageCount ?? "-"}
									</td>
								)}
								<td className="py-2 whitespace-nowrap">
									{new Date(file.dateAdded).toLocaleDateString()}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</TabsContent>
	);
}
