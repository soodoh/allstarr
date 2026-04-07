import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps, JSX } from "react";

import { cn } from "src/lib/utils";

function Popover({
	...props
}: ComponentProps<typeof PopoverPrimitive.Root>): JSX.Element {
	return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
	...props
}: ComponentProps<typeof PopoverPrimitive.Trigger>): JSX.Element {
	return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
	className,
	align = "center",
	sideOffset = 4,
	...props
}: ComponentProps<typeof PopoverPrimitive.Content>): JSX.Element {
	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Content
				data-slot="popover-content"
				align={align}
				sideOffset={sideOffset}
				className={cn(
					"bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
					className,
				)}
				{...props}
			/>
		</PopoverPrimitive.Portal>
	);
}

function PopoverHeader({
	className,
	...props
}: ComponentProps<"div">): JSX.Element {
	return (
		<div
			data-slot="popover-header"
			className={cn("flex flex-col gap-1 text-sm", className)}
			{...props}
		/>
	);
}

function PopoverTitle({
	className,
	...props
}: ComponentProps<"h2">): JSX.Element {
	return (
		<div
			data-slot="popover-title"
			className={cn("font-medium", className)}
			{...props}
		/>
	);
}

export { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger };
