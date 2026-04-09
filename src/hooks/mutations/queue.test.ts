import { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { renderHook } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { error, invalidateQueries, removeFromQueueFn, success } = vi.hoisted(
	() => ({
		error: vi.fn(),
		invalidateQueries: vi.fn(),
		removeFromQueueFn: vi.fn(),
		success: vi.fn(),
	}),
);

vi.mock("sonner", () => ({
	toast: {
		error,
		success,
	},
}));

vi.mock("src/server/queue", () => ({
	removeFromQueueFn: (...args: unknown[]) => removeFromQueueFn(...args),
}));

import { queryKeys } from "src/lib/query-keys";

import { useRemoveFromQueue } from "./queue";

describe("mutations/queue", () => {
	beforeEach(() => {
		vi.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(
			invalidateQueries,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		error.mockReset();
		invalidateQueries.mockReset();
		removeFromQueueFn.mockReset();
		success.mockReset();
	});

	it("wires queue removals and invalidates all dependent caches", async () => {
		removeFromQueueFn.mockResolvedValue({ ok: true });

		const { result } = renderHook(() => useRemoveFromQueue());

		await act(async () => {
			await result.current.mutateAsync({ id: 9 } as never);
		});

		expect(removeFromQueueFn).toHaveBeenCalledWith({ data: { id: 9 } });
		expect(success).toHaveBeenCalledWith("Removed from queue");
		expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
			queryKey: queryKeys.queue.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
			queryKey: queryKeys.blocklist.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(3, {
			queryKey: ["indexers", "releaseStatus"],
		});
	});

	it("shows the fallback error toast when queue removal fails", async () => {
		removeFromQueueFn.mockRejectedValue("nope");

		const { result } = renderHook(() => useRemoveFromQueue());

		await act(async () => {
			await result.current.mutateAsync({ id: 9 } as never).catch(() => {});
		});

		expect(error).toHaveBeenCalledWith("Failed to remove from queue");
	});
});
