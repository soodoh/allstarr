/**
 * Format a byte count as a human-readable string (e.g. "1.5 GB").
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) {
		return "0 B";
	}
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format an ISO date string as a human-readable relative age
 * (e.g. "3 days ago", "2 months ago").
 */
export function formatAge(publishDate: string | undefined): string {
	if (!publishDate) {
		return "Unknown";
	}
	const pubMs = new Date(publishDate).getTime();
	const nowMs = Date.now();
	const diffMs = nowMs - pubMs;
	if (diffMs < 0) {
		return "Unknown";
	}
	const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
	if (days === 0) {
		return "Today";
	}
	if (days === 1) {
		return "1 day ago";
	}
	if (days < 30) {
		return `${days} days ago`;
	}
	const months = Math.floor(days / 30);
	if (months === 1) {
		return "1 month ago";
	}
	if (months < 12) {
		return `${months} months ago`;
	}
	const years = Math.floor(months / 12);
	if (years === 1) {
		return "1 year ago";
	}
	return `${years} years ago`;
}

/**
 * Format a timestamp as a short relative time string (e.g. "5m ago", "2h ago", "3d ago").
 */
export function formatRelativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}
