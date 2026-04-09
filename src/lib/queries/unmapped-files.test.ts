import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getUnmappedFileCountFn: vi.fn(),
	getUnmappedFilesFn: vi.fn(),
}));

vi.mock("src/server/unmapped-files", () => ({
	getUnmappedFileCountFn: mocks.getUnmappedFileCountFn,
	getUnmappedFilesFn: mocks.getUnmappedFilesFn,
}));

import {
	unmappedFilesCountQuery,
	unmappedFilesListQuery,
} from "./unmapped-files";

describe("unmapped file queries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("builds the default unmapped files list query", async () => {
		mocks.getUnmappedFilesFn.mockResolvedValue([{ id: 1 }]);

		const options = unmappedFilesListQuery();

		expect(options.queryKey).toStrictEqual(["unmappedFiles", "list", {}]);
		await expect(options.queryFn!({} as never)).resolves.toEqual([{ id: 1 }]);
		expect(mocks.getUnmappedFilesFn).toHaveBeenCalledWith({ data: {} });
	});

	it("passes filter params through to the unmapped files list query", async () => {
		mocks.getUnmappedFilesFn.mockResolvedValue([{ id: 2 }]);

		const params = {
			contentType: "movie",
			search: "sample",
			showIgnored: true,
		};
		const options = unmappedFilesListQuery(params);

		expect(options.queryKey).toStrictEqual(["unmappedFiles", "list", params]);
		await expect(options.queryFn!({} as never)).resolves.toEqual([{ id: 2 }]);
		expect(mocks.getUnmappedFilesFn).toHaveBeenCalledWith({ data: params });
	});

	it("builds the unmapped files count query", async () => {
		mocks.getUnmappedFileCountFn.mockResolvedValue(9);

		const options = unmappedFilesCountQuery();

		expect(options.queryKey).toStrictEqual(["unmappedFiles", "count"]);
		await expect(options.queryFn!({} as never)).resolves.toBe(9);
		expect(mocks.getUnmappedFileCountFn).toHaveBeenCalledTimes(1);
	});
});
