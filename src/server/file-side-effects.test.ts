import { describe, expect, it, vi } from "vitest";
import { createFileSideEffectRecorder } from "./file-side-effects";

describe("createFileSideEffectRecorder", () => {
	it("cleans recorded created files in reverse order", () => {
		const removeFile = vi.fn();
		const recorder = createFileSideEffectRecorder({ removeFile });

		recorder.recordCreatedFile("/library/first.epub");
		recorder.recordCreatedFile("/library/second.epub");

		const failures = recorder.cleanup();

		expect(failures).toEqual([]);
		expect(removeFile).toHaveBeenNthCalledWith(1, "/library/second.epub");
		expect(removeFile).toHaveBeenNthCalledWith(2, "/library/first.epub");
	});

	it("does not clean up after commit", () => {
		const removeFile = vi.fn();
		const recorder = createFileSideEffectRecorder({ removeFile });

		recorder.recordCreatedFile("/library/book.epub");
		recorder.commit();

		expect(recorder.cleanup()).toEqual([]);
		expect(removeFile).not.toHaveBeenCalled();
	});

	it("continues cleanup after a removal fails and reports failures", () => {
		const error = new Error("permission denied");
		const removeFile = vi.fn((filePath: string) => {
			if (filePath === "/library/second.epub") {
				throw error;
			}
		});
		const recorder = createFileSideEffectRecorder({ removeFile });

		recorder.recordCreatedFile("/library/first.epub");
		recorder.recordCreatedFile("/library/second.epub");

		const failures = recorder.cleanup();

		expect(removeFile).toHaveBeenCalledTimes(2);
		expect(failures).toEqual([{ path: "/library/second.epub", error }]);
	});

	it("rolls back one created file and leaves other recorded files for later cleanup", () => {
		const removeFile = vi.fn();
		const recorder = createFileSideEffectRecorder({ removeFile });

		recorder.recordCreatedFile("/library/first.epub");
		recorder.recordCreatedFile("/library/second.epub");

		expect(recorder.rollbackCreatedFile("/library/second.epub")).toBeNull();
		expect(removeFile).toHaveBeenCalledWith("/library/second.epub");

		recorder.cleanup();

		expect(removeFile).toHaveBeenCalledTimes(2);
		expect(removeFile).toHaveBeenNthCalledWith(2, "/library/first.epub");
	});

	it("runs recorded cleanup actions before file cleanup", () => {
		const calls: string[] = [];
		const recorder = createFileSideEffectRecorder({
			removeFile: (filePath) => calls.push(`file:${filePath}`),
		});

		recorder.recordCreatedFile("/library/book.epub");
		recorder.recordCleanup("book row", () => calls.push("row:book"));

		expect(recorder.cleanup()).toEqual([]);
		expect(calls).toEqual(["row:book", "file:/library/book.epub"]);
	});

	it("skips file cleanup when a dependent cleanup action fails", () => {
		const error = new Error("row delete failed");
		const removeFile = vi.fn();
		const recorder = createFileSideEffectRecorder({ removeFile });

		recorder.recordCreatedFile("/library/book.epub");
		recorder.recordCleanup("book row", () => {
			throw error;
		});

		expect(recorder.cleanup()).toEqual([{ path: "book row", error }]);
		expect(removeFile).not.toHaveBeenCalled();
	});
});
