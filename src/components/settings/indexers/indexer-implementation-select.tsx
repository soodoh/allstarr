import type { JSX } from "react";
import { Button } from "src/components/ui/button";

type IndexerImplementation = "Newznab" | "Torznab";
type IndexerProtocol = "usenet" | "torrent";

type Selection = {
	implementation: IndexerImplementation;
	protocol: IndexerProtocol;
};

type IndexerOption = {
	implementation: IndexerImplementation;
	label: string;
	description: string;
	protocol: IndexerProtocol;
};

const USENET_INDEXERS: IndexerOption[] = [
	{
		implementation: "Newznab",
		label: "Newznab",
		description: "Usenet indexer",
		protocol: "usenet",
	},
];

const TORRENT_INDEXERS: IndexerOption[] = [
	{
		implementation: "Torznab",
		label: "Torznab",
		description: "Torrent indexer",
		protocol: "torrent",
	},
];

function OptionButton({
	option,
	onSelect,
}: {
	option: IndexerOption;
	onSelect: (selection: Selection) => void;
}): JSX.Element {
	return (
		<Button
			type="button"
			variant="outline"
			className="h-auto flex-col gap-1 p-4 text-left items-start"
			onClick={() =>
				onSelect({
					implementation: option.implementation,
					protocol: option.protocol,
				})
			}
		>
			<span className="font-semibold text-sm">{option.label}</span>
			<span className="text-xs text-muted-foreground">
				{option.description}
			</span>
		</Button>
	);
}

type IndexerImplementationSelectProps = {
	onSelect: (selection: Selection) => void;
	onCancel: () => void;
};

export default function IndexerImplementationSelect({
	onSelect,
	onCancel,
}: IndexerImplementationSelectProps): JSX.Element {
	return (
		<div className="space-y-6">
			<div className="space-y-3">
				<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
					Usenet
				</h3>
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{USENET_INDEXERS.map((option) => (
						<OptionButton
							key={option.implementation}
							option={option}
							onSelect={onSelect}
						/>
					))}
				</div>
			</div>

			<div className="space-y-3">
				<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
					Torrent
				</h3>
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{TORRENT_INDEXERS.map((option) => (
						<OptionButton
							key={option.implementation}
							option={option}
							onSelect={onSelect}
						/>
					))}
				</div>
			</div>

			<div className="flex justify-end">
				<Button type="button" variant="outline" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</div>
	);
}
