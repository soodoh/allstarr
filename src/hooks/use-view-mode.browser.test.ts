import { renderHook } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mutate, useQuery } = vi.hoisted(() => ({
	mutate: vi.fn(),
	useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: (...args: Parameters<typeof actual.useQuery>) =>
			useQuery(...args),
	};
});

vi.mock("src/hooks/mutations/user-settings", () => ({
	useUpsertUserSettings: () => ({
		mutate,
	}),
}));

vi.mock("src/lib/queries/user-settings", () => ({
	userSettingsQuery: (tableId: string) => ({
		queryFn: vi.fn(),
		queryKey: ["user-settings", tableId],
	}),
}));

import useViewMode from "./use-view-mode";

describe("useViewMode", () => {
	afterEach(() => {
		mutate.mockReset();
		useQuery.mockReset();
	});

	it("falls back to the page default when settings are absent", async () => {
		useQuery.mockReturnValue({ data: undefined });

		const { result } = await renderHook(() => useViewMode("movies"));

		expect(result.current[0]).toBe("grid");
	});

	it("falls back to table for pages without an explicit default", async () => {
		useQuery.mockReturnValue({ data: undefined });

		const { result } = await renderHook(() => useViewMode("author-books"));

		expect(result.current[0]).toBe("table");
	});

	it("uses saved settings when present and persists updates", async () => {
		useQuery.mockReturnValue({ data: { viewMode: "grid" } });

		const { result } = await renderHook(() => useViewMode("authors"));

		expect(result.current[0]).toBe("grid");

		result.current[1]("table");

		expect(mutate).toHaveBeenCalledWith({
			tableId: "authors",
			viewMode: "table",
		});
	});
});
