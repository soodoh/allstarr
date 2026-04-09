import { act } from "@testing-library/react";
import { renderHook } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

const { error, grabReleaseFn, searchIndexersFn, success, warning } = vi.hoisted(
	() => ({
		error: vi.fn(),
		grabReleaseFn: vi.fn(),
		searchIndexersFn: vi.fn(),
		success: vi.fn(),
		warning: vi.fn(),
	}),
);

vi.mock("sonner", () => ({
	toast: {
		error,
		success,
		warning,
	},
}));

vi.mock("src/server/indexers", () => ({
	grabReleaseFn: (...args: unknown[]) => grabReleaseFn(...args),
	searchIndexersFn: (...args: unknown[]) => searchIndexersFn(...args),
}));

import { useGrabRelease, useSearchIndexers } from "./indexer-search";

describe("mutations/indexer-search", () => {
	afterEach(() => {
		error.mockReset();
		grabReleaseFn.mockReset();
		searchIndexersFn.mockReset();
		success.mockReset();
		warning.mockReset();
	});

	it("wires search indexers mutations and surfaces warnings", async () => {
		searchIndexersFn.mockResolvedValue({
			warnings: ["missing release date", "low confidence"],
		});

		const { result } = renderHook(() => useSearchIndexers(7));

		await act(async () => {
			await result.current.mutateAsync({ query: "Dune" } as never);
		});

		expect(searchIndexersFn).toHaveBeenCalledWith({
			data: { query: "Dune" },
		});
		expect(warning).toHaveBeenNthCalledWith(1, "missing release date");
		expect(warning).toHaveBeenNthCalledWith(2, "low confidence");
	});

	it("shows the search error toast when indexer search fails", async () => {
		searchIndexersFn.mockRejectedValue(new Error("search exploded"));

		const { result } = renderHook(() => useSearchIndexers());

		await act(async () => {
			await result.current
				.mutateAsync({ query: "Dune" } as never)
				.catch(() => {});
		});

		expect(error).toHaveBeenCalledWith("search exploded");
	});

	it("shows the grab release fallback error toast", async () => {
		grabReleaseFn.mockRejectedValue("nope");

		const { result } = renderHook(() => useGrabRelease());

		await act(async () => {
			await result.current
				.mutateAsync({ releaseId: 22 } as never)
				.catch(() => {});
		});

		expect(error).toHaveBeenCalledWith("Failed to grab release");
	});
});
