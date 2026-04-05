import type { FormEvent, JSX } from "react";
import { useState } from "react";
import { Button } from "src/components/ui/button";
import Checkbox from "src/components/ui/checkbox";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "src/components/ui/select";
import validateForm from "src/lib/form-validation";
import { sizeMode } from "src/lib/format-size-calc";
import {
	createDownloadFormatSchema,
	customFormatContentTypes,
} from "src/lib/validators";

const CONTENT_TYPE_LABELS: Record<string, string> = {
	movie: "Movie",
	tv: "TV",
	ebook: "Ebook",
	audiobook: "Audiobook",
};

type DownloadFormatFormValues = {
	title: string;
	weight: number;
	color: string;
	minSize: number;
	maxSize: number;
	preferredSize: number;
	noMaxLimit: number;
	noPreferredLimit: number;
	contentTypes: Array<"ebook" | "movie" | "tv" | "audiobook">;
	source: string | null;
	resolution: number;
};

type DownloadFormatFormProps = {
	initialValues?: DownloadFormatFormValues;
	defaultContentTypes: Array<"ebook" | "movie" | "tv" | "audiobook">;
	onSubmit: (values: DownloadFormatFormValues) => void;
	onCancel: () => void;
	loading?: boolean;
};

const COLORS = [
	{ value: "gray", label: "Gray" },
	{ value: "green", label: "Green" },
	{ value: "blue", label: "Blue" },
	{ value: "amber", label: "Amber" },
	{ value: "yellow", label: "Yellow" },
	{ value: "purple", label: "Purple" },
	{ value: "cyan", label: "Cyan" },
	{ value: "orange", label: "Orange" },
];

const VIDEO_SOURCES = [
	{ value: "Television", label: "Television" },
	{ value: "Web", label: "Web" },
	{ value: "WebRip", label: "WebRip" },
	{ value: "Bluray", label: "Bluray" },
	{ value: "BlurayRaw", label: "Bluray Raw" },
	{ value: "DVD", label: "DVD" },
	{ value: "Unknown", label: "Unknown" },
] as const;

const VIDEO_RESOLUTIONS = [
	{ value: 0, label: "Unknown" },
	{ value: 480, label: "480p" },
	{ value: 576, label: "576p" },
	{ value: 720, label: "720p" },
	{ value: 1080, label: "1080p" },
	{ value: 2160, label: "2160p (4K)" },
] as const;

const COLOR_CLASSES: Record<string, string> = {
	gray: "bg-gray-500",
	green: "bg-green-500",
	blue: "bg-blue-500",
	amber: "bg-amber-500",
	yellow: "bg-yellow-500",
	purple: "bg-purple-500",
	cyan: "bg-cyan-500",
	orange: "bg-orange-500",
};

function defaultMaxSize(mode: "ebook" | "audio" | "video"): number {
	if (mode === "audio") {
		return 350;
	}
	if (mode === "video") {
		return 1000;
	}
	return 100;
}

function SizeLimitField({
	id,
	label,
	value,
	noLimit,
	onValueChange,
	onNoLimitChange,
}: {
	id: string;
	label: string;
	value: number;
	noLimit: boolean;
	onValueChange: (v: number) => void;
	onNoLimitChange: (checked: boolean) => void;
}): JSX.Element {
	return (
		<div className="space-y-1">
			<Label className="text-xs text-muted-foreground">{label}</Label>
			<Input
				type="number"
				value={value}
				disabled={noLimit}
				onChange={(e) => onValueChange(Number(e.target.value))}
			/>
			<div className="flex items-center gap-1.5">
				<Checkbox
					id={id}
					checked={noLimit}
					onCheckedChange={(v) => onNoLimitChange(v === true)}
				/>
				<label
					htmlFor={id}
					className="text-xs text-muted-foreground cursor-pointer"
				>
					No Limit
				</label>
			</div>
		</div>
	);
}

function VideoFields({
	source,
	resolution,
	onSourceChange,
	onResolutionChange,
}: {
	source: string;
	resolution: number;
	onSourceChange: (v: string) => void;
	onResolutionChange: (v: number) => void;
}): JSX.Element {
	return (
		<div className="grid grid-cols-2 gap-4">
			<div className="space-y-2">
				<Label htmlFor="video-source">Source</Label>
				<Select value={source} onValueChange={onSourceChange}>
					<SelectTrigger id="video-source" className="w-full">
						<SelectValue placeholder="Any source" />
					</SelectTrigger>
					<SelectContent>
						{VIDEO_SOURCES.map((s) => (
							<SelectItem key={s.value} value={s.value}>
								{s.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="space-y-2">
				<Label htmlFor="video-resolution">Resolution</Label>
				<Select
					value={String(resolution)}
					onValueChange={(v) => onResolutionChange(Number(v))}
				>
					<SelectTrigger id="video-resolution" className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{VIDEO_RESOLUTIONS.map((r) => (
							<SelectItem key={r.value} value={String(r.value)}>
								{r.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}

function useBasicFormFields(
	initialValues: DownloadFormatFormValues | undefined,
	defaultContentTypes: DownloadFormatFormValues["contentTypes"],
) {
	const [contentTypes, setContentTypes] = useState<
		DownloadFormatFormValues["contentTypes"]
	>(initialValues?.contentTypes ?? defaultContentTypes);
	const [title, setTitle] = useState(initialValues?.title ?? "");
	const [weight, setWeight] = useState(initialValues?.weight ?? 1);
	const [color, setColor] = useState(initialValues?.color ?? "gray");
	const [source, setSource] = useState<string>(initialValues?.source ?? "");
	const [resolution, setResolution] = useState<number>(
		initialValues?.resolution ?? 0,
	);

	const handleContentTypeToggle = (
		ct: DownloadFormatFormValues["contentTypes"][number],
		checked: boolean,
	) => {
		if (checked) {
			setContentTypes((prev) => [...prev, ct]);
		} else {
			setContentTypes((prev) => prev.filter((t) => t !== ct));
		}
	};

	return {
		contentTypes,
		handleContentTypeToggle,
		title,
		setTitle,
		weight,
		setWeight,
		color,
		setColor,
		source,
		setSource,
		resolution,
		setResolution,
	};
}

function useSizeFormFields(
	initialValues: DownloadFormatFormValues | undefined,
	defaultContentTypes: string[],
) {
	const mode = sizeMode(initialValues?.contentTypes ?? defaultContentTypes);
	const [minSize, setMinSize] = useState(initialValues?.minSize ?? 0);
	const [maxSize, setMaxSize] = useState<number>(
		initialValues?.maxSize ?? defaultMaxSize(mode),
	);
	const [maxNoLimit, setMaxNoLimit] = useState<boolean>(
		Boolean(initialValues?.noMaxLimit),
	);
	const [preferredSize, setPreferredSize] = useState<number>(
		initialValues?.preferredSize ?? defaultMaxSize(mode),
	);
	const [errors, setErrors] = useState<Record<string, string>>({});
	return {
		minSize,
		setMinSize,
		maxSize,
		setMaxSize,
		maxNoLimit,
		setMaxNoLimit,
		preferredSize,
		setPreferredSize,
		errors,
		setErrors,
	};
}

export default function DownloadFormatForm({
	initialValues,
	defaultContentTypes,
	onSubmit,
	onCancel,
	loading,
}: DownloadFormatFormProps): JSX.Element {
	const {
		contentTypes,
		handleContentTypeToggle,
		title,
		setTitle,
		weight,
		setWeight,
		color,
		setColor,
		source,
		setSource,
		resolution,
		setResolution,
	} = useBasicFormFields(initialValues, defaultContentTypes);

	const {
		minSize,
		setMinSize,
		maxSize,
		setMaxSize,
		maxNoLimit,
		setMaxNoLimit,
		preferredSize,
		setPreferredSize,
		errors,
		setErrors,
	} = useSizeFormFields(initialValues, defaultContentTypes);

	const currentMode = sizeMode(contentTypes);

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		const payload: DownloadFormatFormValues = {
			title,
			weight,
			color,
			minSize,
			maxSize,
			preferredSize,
			noMaxLimit: maxNoLimit ? 1 : 0,
			noPreferredLimit: 0,
			contentTypes,
			source: source || null,
			resolution,
		};
		const result = validateForm(createDownloadFormatSchema, payload);
		if (!result.success) {
			setErrors(result.errors);
			return;
		}
		setErrors({});
		onSubmit(payload);
	};

	return (
		<form
			onSubmit={handleSubmit}
			className="space-y-4 max-h-[70vh] overflow-y-auto pr-1"
		>
			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-2">
					<Label htmlFor="def-title">Title</Label>
					<Input
						id="def-title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Format name"
					/>
					{errors.title && (
						<p className="text-sm text-destructive">{errors.title}</p>
					)}
				</div>
				<div className="space-y-2">
					<Label htmlFor="def-weight">Weight</Label>
					<Input
						id="def-weight"
						type="number"
						value={weight}
						onChange={(e) => setWeight(Number(e.target.value))}
					/>
				</div>
			</div>

			{/* Content Types */}
			<div className="space-y-2">
				<Label>Content Types</Label>
				<div className="flex flex-wrap gap-4">
					{customFormatContentTypes.map((ct) => (
						<div key={ct} className="flex items-center gap-2">
							<Checkbox
								id={`def-ct-${ct}`}
								checked={contentTypes.includes(ct)}
								onCheckedChange={(checked) =>
									handleContentTypeToggle(ct, checked === true)
								}
							/>
							<Label htmlFor={`def-ct-${ct}`} className="text-sm font-normal">
								{CONTENT_TYPE_LABELS[ct] ?? ct}
							</Label>
						</div>
					))}
				</div>
				{errors.contentTypes && (
					<p className="text-sm text-destructive">{errors.contentTypes}</p>
				)}
			</div>

			<div className="space-y-2">
				<Label>Color</Label>
				<Select value={color} onValueChange={setColor}>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{COLORS.map((c) => (
							<SelectItem key={c.value} value={c.value}>
								<div className="flex items-center gap-2">
									<div
										className={`h-3 w-3 rounded-full ${COLOR_CLASSES[c.value]}`}
									/>
									{c.label}
								</div>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="space-y-2">
				<Label>Size Limits (MB)</Label>
				<div className="grid grid-cols-3 gap-2">
					<div className="space-y-1">
						<Label className="text-xs text-muted-foreground">Min</Label>
						<Input
							type="number"
							value={minSize}
							onChange={(e) => setMinSize(Number(e.target.value))}
						/>
					</div>
					<div className="space-y-1">
						<Label className="text-xs text-muted-foreground">Preferred</Label>
						<Input
							type="number"
							value={preferredSize}
							onChange={(e) => setPreferredSize(Number(e.target.value))}
						/>
					</div>
					<SizeLimitField
						id="max-no-limit"
						label="Max"
						value={maxSize}
						noLimit={maxNoLimit}
						onValueChange={setMaxSize}
						onNoLimitChange={(checked) => {
							setMaxNoLimit(checked);
							if (!checked) {
								setMaxSize(defaultMaxSize(currentMode));
							}
						}}
					/>
				</div>
			</div>

			{currentMode === "video" && (
				<VideoFields
					source={source}
					resolution={resolution}
					onSourceChange={setSource}
					onResolutionChange={setResolution}
				/>
			)}

			<div className="flex justify-end gap-2 pt-2">
				<Button type="button" variant="outline" onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" disabled={loading}>
					{loading ? "Saving..." : "Save"}
				</Button>
			</div>
		</form>
	);
}
