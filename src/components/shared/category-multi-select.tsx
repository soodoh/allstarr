import type { JSX } from "react";
import MultiSelect from "src/components/shared/multi-select";
import { CATEGORY_MAP, INDEXER_CATEGORIES } from "src/lib/categories";

const CATEGORY_ITEMS = INDEXER_CATEGORIES.map((cat) => ({
	key: cat.id,
	label: cat.name,
	secondary: String(cat.id),
}));

export default function CategoryMultiSelect({
	value,
	onChange,
	disabled = false,
}: {
	value: number[];
	onChange?: (ids: number[]) => void;
	disabled?: boolean;
}): JSX.Element {
	return (
		<MultiSelect
			items={CATEGORY_ITEMS}
			value={value}
			onChange={onChange}
			displayMap={CATEGORY_MAP}
			placeholder="Type to search categories..."
			emptyMessage="No categories found."
			disabled={disabled}
		/>
	);
}
