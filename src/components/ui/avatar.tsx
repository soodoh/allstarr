import { Avatar as AvatarPrimitive } from "radix-ui";
import type { ComponentProps, JSX } from "react";

import { cn } from "src/lib/utils";

function Avatar({
	className,
	size = "default",
	...props
}: ComponentProps<typeof AvatarPrimitive.Root> & {
	size?: "default" | "sm" | "lg";
}): JSX.Element {
	return (
		<AvatarPrimitive.Root
			data-slot="avatar"
			data-size={size}
			className={cn(
				"group/avatar relative flex size-8 shrink-0 overflow-hidden rounded-full select-none data-[size=lg]:size-10 data-[size=sm]:size-6",
				className,
			)}
			{...props}
		/>
	);
}

function AvatarFallback({
	className,
	...props
}: ComponentProps<typeof AvatarPrimitive.Fallback>): JSX.Element {
	return (
		<AvatarPrimitive.Fallback
			data-slot="avatar-fallback"
			className={cn(
				"bg-muted text-muted-foreground flex size-full items-center justify-center rounded-full text-sm group-data-[size=sm]/avatar:text-xs",
				className,
			)}
			{...props}
		/>
	);
}

export { Avatar, AvatarFallback };
