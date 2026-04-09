import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatBytes, formatRelativeTime } from "./format";

describe("formatBytes", () => {
	it("returns zero bytes without doing logarithmic math", () => {
		expect(formatBytes(0)).toBe("0 B");
	});

	it("formats larger byte values with the expected unit", () => {
		expect(formatBytes(1_536)).toBe("1.5 KB");
		expect(formatBytes(1_073_741_824)).toBe("1 GB");
	});
});

describe("formatRelativeTime", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-08T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("formats times within the last minute as just now", () => {
		expect(formatRelativeTime(Date.parse("2026-04-08T11:59:45Z"))).toBe(
			"just now",
		);
	});

	it("formats minute, hour, and day differences", () => {
		expect(formatRelativeTime(Date.parse("2026-04-08T11:55:00Z"))).toBe(
			"5m ago",
		);
		expect(formatRelativeTime(Date.parse("2026-04-08T10:00:00Z"))).toBe(
			"2h ago",
		);
		expect(formatRelativeTime(Date.parse("2026-04-05T12:00:00Z"))).toBe(
			"3d ago",
		);
	});
});
