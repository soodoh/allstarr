import type { Operations } from "unpic";

/**
 * Custom @unpic transformer that routes image requests through the local
 * /api/images/ endpoint with on-the-fly resizing via sharp.
 */
export default function localTransform(
	src: string | URL,
	operations: Operations,
): string {
	const url = typeof src === "string" ? src : src.toString();
	const params = new URLSearchParams();
	if (operations.width) {
		params.set("w", String(operations.width));
	}
	if (operations.height) {
		params.set("h", String(operations.height));
	}
	if (operations.format) {
		params.set("format", String(operations.format));
	}
	if (operations.quality) {
		params.set("q", String(operations.quality));
	}
	const qs = params.toString();
	return qs ? `${url}?${qs}` : url;
}
