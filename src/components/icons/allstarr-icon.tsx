import type { JSX } from "react";

export default function AllstarrIcon({
	className,
}: {
	className?: string;
}): JSX.Element {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="currentColor"
			aria-hidden="true"
			className={className}
		>
			{/* Ring */}
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 1.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z"
			/>
			{/* Compass tick marks */}
			<circle cx="12" cy="1.2" r="1" />
			<circle cx="22.8" cy="12" r="1" />
			<circle cx="12" cy="22.8" r="1" />
			<circle cx="1.2" cy="12" r="1" />
			{/* Star */}
			<path d="M12 5 l1.65 4.74 5.01 0.1 -4 3.03 1.45 4.79 L12 14.8 l-4.11 2.86 1.45 -4.79 -4 -3.03 5.01 -0.1 z" />
		</svg>
	);
}
