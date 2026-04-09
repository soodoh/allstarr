import { act } from "@testing-library/react";
import { renderHook } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	dismiss,
	error,
	getActiveCommandsFn,
	info,
	invalidateQueries,
	loading,
	setQueryData,
	success,
	useQueryClient,
} = vi.hoisted(() => ({
	dismiss: vi.fn(),
	error: vi.fn(),
	getActiveCommandsFn: vi.fn(),
	info: vi.fn(),
	invalidateQueries: vi.fn(),
	loading: vi.fn(),
	setQueryData: vi.fn(),
	success: vi.fn(),
	useQueryClient: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQueryClient: () => useQueryClient(),
	};
});

vi.mock("sonner", () => ({
	toast: {
		dismiss,
		error,
		info,
		loading,
		success,
	},
}));

vi.mock("src/server/commands", () => ({
	getActiveCommandsFn: () => getActiveCommandsFn(),
}));

import { queryKeys } from "src/lib/query-keys";

import { useServerEvents } from "./use-server-events";

type EventListener = (event: { data: string }) => void;

class MockEventSource {
	static instance: MockEventSource | null = null;

	listeners = new Map<string, Set<EventListener>>();
	close = vi.fn();

	constructor(public readonly url: string) {
		MockEventSource.instance = this;
	}

	addEventListener(type: string, listener: EventListener) {
		const listeners = this.listeners.get(type) ?? new Set<EventListener>();
		listeners.add(listener);
		this.listeners.set(type, listeners);
	}

	emit(type: string, data: unknown = {}) {
		for (const listener of this.listeners.get(type) ?? []) {
			listener({ data: JSON.stringify(data) });
		}
	}
}

describe("useServerEvents", () => {
	beforeEach(() => {
		vi.stubGlobal("EventSource", MockEventSource);
		useQueryClient.mockReturnValue({
			invalidateQueries,
			setQueryData,
		});
		getActiveCommandsFn.mockResolvedValue([]);
	});

	afterEach(() => {
		MockEventSource.instance = null;
		vi.unstubAllGlobals();
		dismiss.mockReset();
		error.mockReset();
		getActiveCommandsFn.mockReset();
		info.mockReset();
		invalidateQueries.mockReset();
		loading.mockReset();
		setQueryData.mockReset();
		success.mockReset();
		useQueryClient.mockReset();
	});

	it("connects to the event stream and restores active command toasts", async () => {
		getActiveCommandsFn.mockResolvedValue([
			{ id: 1, name: "Import", progress: "Working..." },
			{ id: 2, name: "Refresh", progress: undefined },
		]);

		const { result } = renderHook(() => useServerEvents());

		expect(MockEventSource.instance?.url).toBe("/api/events");
		expect(result.current.isConnected).toBe(false);

		act(() => {
			MockEventSource.instance?.emit("open");
		});
		await Promise.resolve();

		expect(result.current.isConnected).toBe(true);
		expect(loading).toHaveBeenNthCalledWith(1, "Working...", {
			id: "command-1",
		});
		expect(loading).toHaveBeenNthCalledWith(2, "Running: Refresh", {
			id: "command-2",
		});
	});

	it("ignores failures while restoring active command toasts", async () => {
		getActiveCommandsFn.mockRejectedValue(new Error("boom"));

		const { result } = renderHook(() => useServerEvents());

		act(() => {
			MockEventSource.instance?.emit("open");
		});
		await Promise.resolve();

		expect(result.current.isConnected).toBe(true);
		expect(loading).not.toHaveBeenCalled();
	});

	it("updates connection state and closes the event source on cleanup", () => {
		const { result, unmount } = renderHook(() => useServerEvents());

		act(() => {
			MockEventSource.instance?.emit("open");
		});
		expect(result.current.isConnected).toBe(true);

		act(() => {
			MockEventSource.instance?.emit("error");
		});
		expect(result.current.isConnected).toBe(false);

		const instance = MockEventSource.instance;
		unmount();

		expect(instance?.close).toHaveBeenCalledTimes(1);
	});

	it("handles queue and task invalidation events", () => {
		renderHook(() => useServerEvents());

		MockEventSource.instance?.emit("queueProgress", {
			data: { items: [{ id: 1 }], warnings: ["warn"] },
		});
		MockEventSource.instance?.emit("queueUpdated");
		MockEventSource.instance?.emit("taskUpdated");

		expect(setQueryData).toHaveBeenCalledWith(
			queryKeys.queue.list(),
			expect.objectContaining({ items: [{ id: 1 }], warnings: ["warn"] }),
		);
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.queue.all,
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.tasks.all,
		});
	});

	it("shows download and import notifications and invalidates import detail queries", () => {
		renderHook(() => useServerEvents());

		MockEventSource.instance?.emit("downloadCompleted", { title: "Dune" });
		MockEventSource.instance?.emit("downloadFailed", {
			message: "disk full",
			title: "Dune",
		});
		MockEventSource.instance?.emit("importCompleted", {
			bookId: 7,
			bookTitle: "Dune",
		});
		MockEventSource.instance?.emit("importCompleted", {
			bookId: null,
			bookTitle: "Children of Dune",
		});

		expect(info).toHaveBeenCalledWith("Download completed: Dune");
		expect(error).toHaveBeenCalledWith("Download failed: Dune — disk full");
		expect(success).toHaveBeenCalledWith("Imported: Dune");
		expect(success).toHaveBeenCalledWith("Imported: Children of Dune");
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.books.detail(7),
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.queue.all,
		});
	});

	it("handles command progress, success, failure, and invalidation rules", () => {
		renderHook(() => useServerEvents());

		MockEventSource.instance?.emit("commandProgress", {
			commandId: 5,
			progress: "Halfway",
		});
		MockEventSource.instance?.emit("commandCompleted", {
			commandId: 5,
			commandType: "importAuthor",
			result: { booksAdded: 3 },
			title: "Frank Herbert",
		});
		MockEventSource.instance?.emit("commandCompleted", {
			commandId: 6,
			commandType: "importBook",
			result: {},
			title: "Dune",
		});
		MockEventSource.instance?.emit("commandCompleted", {
			commandId: 7,
			commandType: "addShow",
			result: { seasonCount: 2 },
			title: "Severance",
		});
		MockEventSource.instance?.emit("commandCompleted", {
			commandId: 8,
			commandType: "addMovie",
			result: {},
			title: "Arrival",
		});
		MockEventSource.instance?.emit("commandCompleted", {
			commandId: 9,
			commandType: "refreshBook",
			result: {},
			title: "Dune",
		});
		MockEventSource.instance?.emit("commandCompleted", {
			commandId: 10,
			commandType: "unknown",
			result: {},
			title: "",
		});
		MockEventSource.instance?.emit("commandFailed", {
			commandId: 11,
			commandType: "importBook",
			error: "No match",
			title: "Dune",
		});
		MockEventSource.instance?.emit("commandFailed", {
			commandId: 12,
			commandType: "importBook",
			error: "No match",
			title: "",
		});

		expect(loading).toHaveBeenCalledWith("Halfway", { id: "command-5" });
		expect(dismiss).toHaveBeenCalledWith("command-5");
		expect(success).toHaveBeenCalledWith(
			"Frank Herbert — Imported with 3 books",
		);
		expect(success).toHaveBeenCalledWith("Dune — Imported successfully");
		expect(success).toHaveBeenCalledWith("Severance — Added with 2 seasons");
		expect(success).toHaveBeenCalledWith("Arrival — Added successfully");
		expect(success).toHaveBeenCalledWith("Dune — Metadata refreshed");
		expect(success).toHaveBeenCalledWith("Task completed");
		expect(error).toHaveBeenCalledWith("Dune — No match");
		expect(error).toHaveBeenCalledWith("No match");
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.authors.all,
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.books.all,
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.dashboard.all,
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.history.all,
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.shows.all,
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.movies.all,
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.movieCollections.all,
		});
	});
});
