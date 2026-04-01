import { Progress as ProgressPrimitive } from "radix-ui";
import type { ComponentProps, JSX } from "react";

import { cn } from "src/lib/utils";

export default function Progress({
	className,
	value,
	...props
}: ComponentProps<typeof ProgressPrimitive.Root>): JSX.Element {
	return (
		<ProgressPrimitive.Root
			data-slot="progress"
			className={cn(
				"relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
				className,
			)}
			{...props}
		>
			<ProgressPrimitive.Indicator
				data-slot="progress-indicator"
				className="h-full w-full flex-1 bg-primary transition-all"
				style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
			/>
		</ProgressPrimitive.Root>
	);
}
