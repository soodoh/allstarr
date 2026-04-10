import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { deleteAuthorFn, error, invalidateQueries, success, updateAuthorFn } =
	vi.hoisted(() => ({
		deleteAuthorFn: vi.fn(),
		error: vi.fn(),
		invalidateQueries: vi.fn(),
		success: vi.fn(),
		updateAuthorFn: vi.fn(),
	}));

vi.mock("sonner", () => ({
	toast: {
		error,
		success,
	},
}));

vi.mock("src/server/authors", () => ({
	deleteAuthorFn: (...args: unknown[]) => deleteAuthorFn(...args),
	updateAuthorFn: (...args: unknown[]) => updateAuthorFn(...args),
}));

import { queryKeys } from "src/lib/query-keys";

import { useDeleteAuthor, useUpdateAuthor } from "./authors";

describe("mutations/authors", () => {
	beforeEach(() => {
		vi.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(
			invalidateQueries,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		deleteAuthorFn.mockReset();
		error.mockReset();
		invalidateQueries.mockReset();
		success.mockReset();
		updateAuthorFn.mockReset();
	});

	it("wires update author mutations and success handling", async () => {
		updateAuthorFn.mockResolvedValue({ ok: true });

		const { result } = await renderHook(() => useUpdateAuthor());

		await result.current.mutateAsync({ id: 7 } as never);

		expect(updateAuthorFn).toHaveBeenCalledWith({ data: { id: 7 } });
		expect(success).toHaveBeenCalledWith("Author updated");
		expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
			queryKey: queryKeys.authors.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
			queryKey: queryKeys.dashboard.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(3, {
			queryKey: queryKeys.history.all,
		});
	});

	it("shows an error toast when update author fails", async () => {
		updateAuthorFn.mockRejectedValue(new Error("nope"));

		const { result } = await renderHook(() => useUpdateAuthor());

		await result.current.mutateAsync({ id: 7 } as never).catch(() => {});

		expect(error).toHaveBeenCalledWith("Failed to update author");
		expect(success).not.toHaveBeenCalled();
	});

	it("wires delete author mutations and success handling", async () => {
		deleteAuthorFn.mockResolvedValue({ ok: true });

		const { result } = await renderHook(() => useDeleteAuthor());

		await result.current.mutateAsync(42);

		expect(deleteAuthorFn).toHaveBeenCalledWith({ data: { id: 42 } });
		expect(success).toHaveBeenCalledWith("Author deleted");
		expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
			queryKey: queryKeys.authors.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
			queryKey: queryKeys.books.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(3, {
			queryKey: queryKeys.dashboard.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(4, {
			queryKey: queryKeys.history.all,
		});
	});

	it("shows an error toast when delete author fails", async () => {
		deleteAuthorFn.mockRejectedValue(new Error("boom"));

		const { result } = await renderHook(() => useDeleteAuthor());

		await result.current.mutateAsync(42).catch(() => {});

		expect(error).toHaveBeenCalledWith("Failed to delete author");
		expect(success).not.toHaveBeenCalled();
	});
});
