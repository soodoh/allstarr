import { BookMarked, Film, Tv } from "lucide-react";
import type { JSX } from "react";
import { Button } from "src/components/ui/button";

export type ContentType = "all" | "books" | "tv" | "movies";

type ContentTypeFilterProps = {
	value: ContentType;
	onChange: (value: ContentType) => void;
};

const options: Array<{
	value: ContentType;
	label: string;
	icon?: JSX.Element;
}> = [
	{ value: "all", label: "All" },
	{
		value: "books",
		label: "Books",
		icon: <BookMarked className="h-4 w-4" />,
	},
	{
		value: "tv",
		label: "TV Shows",
		icon: <Tv className="h-4 w-4" />,
	},
	{
		value: "movies",
		label: "Movies",
		icon: <Film className="h-4 w-4" />,
	},
];

export default function ContentTypeFilter({
	value,
	onChange,
}: ContentTypeFilterProps): JSX.Element {
	return (
		<div className="flex items-center gap-1">
			{options.map((option) => (
				<Button
					key={option.value}
					variant={value === option.value ? "default" : "outline"}
					size="sm"
					onClick={() => onChange(option.value)}
					className="gap-1.5"
				>
					{option.icon}
					{option.label}
				</Button>
			))}
		</div>
	);
}
