import { act } from "@testing-library/react";
import { renderHook } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
	importHardcoverAuthorFn,
	importHardcoverBookFn,
	refreshAuthorMetadataFn,
	refreshBookMetadataFn,
	error,
	loading,
	dismiss,
} = vi.hoisted(() => ({
	importHardcoverAuthorFn: vi.fn(),
	importHardcoverBookFn: vi.fn(),
	refreshAuthorMetadataFn: vi.fn(),
	refreshBookMetadataFn: vi.fn(),
	error: vi.fn(),
	loading: vi.fn(),
	dismiss: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		dismiss,
		error,
		loading,
	},
}));

vi.mock("src/server/import", () => ({
	importHardcoverAuthorFn: (...args: unknown[]) =>
		importHardcoverAuthorFn(...args),
	importHardcoverBookFn: (...args: unknown[]) => importHardcoverBookFn(...args),
	refreshAuthorMetadataFn: (...args: unknown[]) =>
		refreshAuthorMetadataFn(...args),
	refreshBookMetadataFn: (...args: unknown[]) => refreshBookMetadataFn(...args),
}));

import {
	useImportHardcoverAuthor,
	useImportHardcoverBook,
	useRefreshAuthorMetadata,
	useRefreshBookMetadata,
} from "./import";

describe("mutations/import", () => {
	afterEach(() => {
		dismiss.mockReset();
		error.mockReset();
		importHardcoverAuthorFn.mockReset();
		importHardcoverBookFn.mockReset();
		loading.mockReset();
		refreshAuthorMetadataFn.mockReset();
		refreshBookMetadataFn.mockReset();
	});

	it("wires author imports and dismisses the in-flight toast on success", async () => {
		importHardcoverAuthorFn.mockResolvedValue({ ok: true });
		loading.mockReturnValue("submit-import-author");

		const { result } = renderHook(() => useImportHardcoverAuthor());

		await act(async () => {
			await result.current.mutateAsync({
				downloadProfileIds: [1, 2],
				foreignAuthorId: 17,
				searchOnAdd: true,
			} as never);
		});

		expect(importHardcoverAuthorFn).toHaveBeenCalledWith({
			data: {
				downloadProfileIds: [1, 2],
				foreignAuthorId: 17,
				searchOnAdd: true,
			},
		});
		expect(loading).toHaveBeenCalledWith("Starting author import...", {
			id: "submit-import-author",
		});
		expect(dismiss).toHaveBeenCalledWith("submit-import-author");
	});

	it("shows the author import fallback error toast when the mutation fails", async () => {
		importHardcoverAuthorFn.mockRejectedValue("nope");
		loading.mockReturnValue("submit-import-author");

		const { result } = renderHook(() => useImportHardcoverAuthor());

		await act(async () => {
			await result.current
				.mutateAsync({
					downloadProfileIds: [1],
					foreignAuthorId: 17,
				} as never)
				.catch(() => {});
		});

		expect(error).toHaveBeenCalledWith("Failed to add author.", {
			id: "submit-import-author",
		});
	});

	it("wires book imports and dismisses the in-flight toast on success", async () => {
		importHardcoverBookFn.mockResolvedValue({ ok: true });
		loading.mockReturnValue("submit-import-book");

		const { result } = renderHook(() => useImportHardcoverBook());

		await act(async () => {
			await result.current.mutateAsync({
				downloadProfileIds: [9],
				foreignBookId: 88,
				monitorSeries: true,
			} as never);
		});

		expect(importHardcoverBookFn).toHaveBeenCalledWith({
			data: {
				downloadProfileIds: [9],
				foreignBookId: 88,
				monitorSeries: true,
			},
		});
		expect(loading).toHaveBeenCalledWith("Starting book import...", {
			id: "submit-import-book",
		});
		expect(dismiss).toHaveBeenCalledWith("submit-import-book");
	});

	it("shows the book import server error when the mutation fails with an Error", async () => {
		importHardcoverBookFn.mockRejectedValue(new Error("bad import"));
		loading.mockReturnValue("submit-import-book");

		const { result } = renderHook(() => useImportHardcoverBook());

		await act(async () => {
			await result.current
				.mutateAsync({
					downloadProfileIds: [9],
					foreignBookId: 88,
				} as never)
				.catch(() => {});
		});

		expect(error).toHaveBeenCalledWith("bad import", {
			id: "submit-import-book",
		});
	});

	it("wires author metadata refreshes and surfaces server errors", async () => {
		refreshAuthorMetadataFn.mockResolvedValue({ ok: true });

		const { result } = renderHook(() => useRefreshAuthorMetadata());

		await act(async () => {
			await result.current.mutateAsync(31);
		});

		expect(refreshAuthorMetadataFn).toHaveBeenCalledWith({
			data: { authorId: 31 },
		});

		refreshAuthorMetadataFn.mockRejectedValue("nope");

		await act(async () => {
			await result.current.mutateAsync(31).catch(() => {});
		});

		expect(error).toHaveBeenCalledWith("Failed to refresh metadata.");
	});

	it("wires book metadata refreshes and surfaces server errors", async () => {
		refreshBookMetadataFn.mockResolvedValue({ ok: true });

		const { result } = renderHook(() => useRefreshBookMetadata());

		await act(async () => {
			await result.current.mutateAsync(44);
		});

		expect(refreshBookMetadataFn).toHaveBeenCalledWith({
			data: { bookId: 44 },
		});

		refreshBookMetadataFn.mockRejectedValue(new Error("boom"));

		await act(async () => {
			await result.current.mutateAsync(44).catch(() => {});
		});

		expect(error).toHaveBeenCalledWith("boom");
	});
});
