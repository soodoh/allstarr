import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { JSX, ReactNode, ThHTMLAttributes } from "react";
import { TableHead } from "src/components/ui/table";
import type { SortDirection } from "src/hooks/use-table-state";
import { cn } from "src/lib/utils";

type SortableTableHeadProps = {
	column: string;
	sortColumn: string | undefined;
	sortDirection: SortDirection;
	onSort: (col: string) => void;
	children: ReactNode;
} & ThHTMLAttributes<HTMLTableCellElement>;

export default function SortableTableHead({
	column,
	sortColumn,
	sortDirection,
	onSort,
	children,
	className,
	...props
}: SortableTableHeadProps): JSX.Element {
	const isActive = sortColumn === column;

	let Icon = ArrowUpDown;
	if (isActive) {
		Icon = sortDirection === "asc" ? ArrowUp : ArrowDown;
	}

	return (
		<TableHead
			className={cn("cursor-pointer select-none", className)}
			onClick={() => onSort(column)}
			{...props}
		>
			<span className="inline-flex items-center gap-1.5">
				{children}
				<Icon
					className={cn(
						"h-3.5 w-3.5 shrink-0",
						isActive ? "text-foreground" : "text-muted-foreground/60",
					)}
				/>
			</span>
		</TableHead>
	);
}
