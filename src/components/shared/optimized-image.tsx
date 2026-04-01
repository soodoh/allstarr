import { Image } from "@unpic/react";
import {
	BookOpen,
	BookOpenText,
	Film,
	ImageIcon,
	ImageOff,
	Tv,
} from "lucide-react";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { cn } from "src/lib/utils";

type ImageType = "book" | "movie" | "show" | "author" | "manga" | "generic";

type OptimizedImageProps = {
	src: string | null;
	alt: string;
	type: ImageType;
	width: number;
	height: number;
	priority?: boolean;
	className?: string;
	imageClassName?: string;
};

const fallbacks: Record<ImageType, { icon: typeof Film; label: string }> = {
	book: { icon: BookOpen, label: "No cover" },
	movie: { icon: Film, label: "No poster" },
	show: { icon: Tv, label: "No poster" },
	manga: { icon: BookOpenText, label: "No cover" },
	author: { icon: ImageOff, label: "No photo" },
	generic: { icon: ImageIcon, label: "No image" },
};

export default function OptimizedImage({
	src,
	alt,
	type,
	width,
	height,
	priority = false,
	className,
	imageClassName,
}: OptimizedImageProps): JSX.Element {
	const [imageFailed, setImageFailed] = useState(false);

	useEffect(() => {
		setImageFailed(false);
	}, []);

	const { icon: FallbackIcon, label } = fallbacks[type];

	return (
		<div
			className={cn(
				"overflow-hidden rounded-xl border bg-muted shadow-sm",
				className,
			)}
		>
			{src && !imageFailed ? (
				<Image
					src={src}
					alt={alt}
					width={width}
					height={height}
					layout="constrained"
					loading={priority ? "eager" : undefined}
					fetchpriority={priority ? "high" : undefined}
					className={cn("h-full w-full object-cover", imageClassName)}
					onError={() => setImageFailed(true)}
				/>
			) : (
				<div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
					<FallbackIcon className="h-8 w-8" />
					<span className="text-xs">{label}</span>
				</div>
			)}
		</div>
	);
}
