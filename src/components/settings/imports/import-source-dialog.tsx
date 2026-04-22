import type { FormEvent, JSX } from "react";
import { useEffect, useState } from "react";
import { Button } from "src/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "src/components/ui/select";
import type { ImportSourceRecord } from "src/lib/queries";

export type ImportSourceKind = "sonarr" | "radarr" | "readarr" | "bookshelf";

export type ImportSourceValues = {
	apiKey: string;
	baseUrl: string;
	kind: ImportSourceKind;
	label: string;
};

type ImportSourceDialogProps = {
	open: boolean;
	source: ImportSourceRecord | null;
	loading?: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (values: ImportSourceValues) => void;
};

const SOURCE_KIND_OPTIONS: Array<{
	label: string;
	value: ImportSourceKind;
	description: string;
}> = [
	{
		label: "Sonarr",
		value: "sonarr",
		description: "TV show import source",
	},
	{
		label: "Radarr",
		value: "radarr",
		description: "Movie import source",
	},
	{
		label: "Readarr",
		value: "readarr",
		description: "Books and audiobooks",
	},
	{
		label: "Bookshelf",
		value: "bookshelf",
		description: "Shelf-style import source",
	},
];

function getInitialValues(
	source: ImportSourceRecord | null,
): ImportSourceValues {
	return source
		? {
				apiKey: "",
				baseUrl: source.baseUrl,
				kind: source.kind as ImportSourceKind,
				label: source.label,
			}
		: {
				apiKey: "",
				baseUrl: "",
				kind: "sonarr",
				label: "",
			};
}

export default function ImportSourceDialog({
	open,
	source,
	loading = false,
	onOpenChange,
	onSubmit,
}: ImportSourceDialogProps): JSX.Element {
	const [values, setValues] = useState(() => getInitialValues(source));

	useEffect(() => {
		if (open) {
			setValues(getInitialValues(source));
		}
	}, [open, source]);

	const editing = source !== null;
	const title = editing ? `Edit ${source.label}` : "Add Import Source";
	const description = editing
		? "Re-enter the API key to update this source. Existing source details are shown below."
		: "Connect a Servarr-compatible source so the imports page can build plans.";

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		onSubmit(values);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				<form className="space-y-4" onSubmit={handleSubmit}>
					<div className="space-y-2">
						<Label htmlFor="import-source-kind">Source Type</Label>
						<Select
							value={values.kind}
							onValueChange={(kind) =>
								setValues((current) => ({
									...current,
									kind: kind as ImportSourceKind,
								}))
							}
						>
							<SelectTrigger id="import-source-kind">
								<SelectValue placeholder="Select a source type" />
							</SelectTrigger>
							<SelectContent>
								{SOURCE_KIND_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										<span className="flex flex-col items-start">
											<span>{option.label}</span>
											<span className="text-muted-foreground text-xs">
												{option.description}
											</span>
										</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="import-source-label">Label</Label>
						<Input
							id="import-source-label"
							value={values.label}
							onChange={(event) =>
								setValues((current) => ({
									...current,
									label: event.target.value,
								}))
							}
							placeholder="Main Sonarr"
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="import-source-base-url">Base URL</Label>
						<Input
							id="import-source-base-url"
							value={values.baseUrl}
							onChange={(event) =>
								setValues((current) => ({
									...current,
									baseUrl: event.target.value,
								}))
							}
							placeholder="http://localhost:8989"
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="import-source-api-key">API Key</Label>
						<Input
							id="import-source-api-key"
							type="password"
							value={values.apiKey}
							onChange={(event) =>
								setValues((current) => ({
									...current,
									apiKey: event.target.value,
								}))
							}
							placeholder={editing ? "Re-enter API key" : "API key"}
						/>
						<p className="text-xs text-muted-foreground">
							{editing
								? "The existing key is not read back from the server. Enter a new key to save changes."
								: "This key is stored securely and used to sync snapshots."}
						</p>
					</div>

					<DialogFooter className="gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={loading}>
							{loading
								? editing
									? "Saving..."
									: "Creating..."
								: editing
									? "Save Source"
									: "Create Source"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
