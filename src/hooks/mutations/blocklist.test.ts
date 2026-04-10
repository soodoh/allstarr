import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	bulkRemoveFromBlocklistFn,
	error,
	invalidateQueries,
	removeFromBlocklistFn,
	success,
} = vi.hoisted(() => ({
	bulkRemoveFromBlocklistFn: vi.fn(),
	error: vi.fn(),
	invalidateQueries: vi.fn(),
	removeFromBlocklistFn: vi.fn(),
	success: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		error,
		success,
	},
}));

vi.mock("src/server/blocklist", () => ({
	bulkRemoveFromBlocklistFn: (...args: unknown[]) =>
		bulkRemoveFromBlocklistFn(...args),
	removeFromBlocklistFn: (...args: unknown[]) => removeFromBlocklistFn(...args),
}));

import { queryKeys } from "src/lib/query-keys";

import {
	useBulkRemoveFromBlocklist,
	useRemoveFromBlocklist,
} from "./blocklist";

describe("mutations/blocklist", () => {
	beforeEach(() => {
		vi.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(
			invalidateQueries,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		bulkRemoveFromBlocklistFn.mockReset();
		error.mockReset();
		invalidateQueries.mockReset();
		removeFromBlocklistFn.mockReset();
		success.mockReset();
	});

	it("wires remove-from-blocklist mutations and success handling", async () => {
		removeFromBlocklistFn.mockResolvedValue({ ok: true });

		const { result } = await renderHook(() => useRemoveFromBlocklist());

		await result.current.mutateAsync(11);

		expect(removeFromBlocklistFn).toHaveBeenCalledWith({ data: { id: 11 } });
		expect(success).toHaveBeenCalledWith("Removed from blocklist");
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.blocklist.all,
		});
	});

	it("shows the server error message when remove-from-blocklist fails", async () => {
		removeFromBlocklistFn.mockRejectedValue(new Error("missing item"));

		const { result } = await renderHook(() => useRemoveFromBlocklist());

		await result.current.mutateAsync(11).catch(() => {});

		expect(error).toHaveBeenCalledWith("missing item");
	});

	it("wires bulk remove mutations and success handling", async () => {
		bulkRemoveFromBlocklistFn.mockResolvedValue({ removed: 3 });

		const { result } = await renderHook(() => useBulkRemoveFromBlocklist());

		await result.current.mutateAsync([1, 2, 3]);

		expect(bulkRemoveFromBlocklistFn).toHaveBeenCalledWith({
			data: { ids: [1, 2, 3] },
		});
		expect(success).toHaveBeenCalledWith("Removed 3 items from blocklist");
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.blocklist.all,
		});
	});

	it("falls back to the generic bulk blocklist error toast", async () => {
		bulkRemoveFromBlocklistFn.mockRejectedValue("nope");

		const { result } = await renderHook(() => useBulkRemoveFromBlocklist());

		await result.current.mutateAsync([1, 2, 3]).catch(() => {});

		expect(error).toHaveBeenCalledWith("Failed to remove from blocklist");
	});
});
