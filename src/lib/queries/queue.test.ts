import { requireValue } from "src/test/require-value";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getQueueFn: vi.fn(),
}));

vi.mock("src/server/queue", () => ({
	getQueueFn: mocks.getQueueFn,
}));

import { queueListQuery } from "./queue";

describe("queue queries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("builds the queue list query", async () => {
		mocks.getQueueFn.mockResolvedValue([{ id: 1 }]);

		const options = queueListQuery();

		expect(options.queryKey).toStrictEqual(["queue", "list"]);
		const queryFn = requireValue(options.queryFn);
		await expect(queryFn({} as never)).resolves.toEqual([{ id: 1 }]);
		expect(mocks.getQueueFn).toHaveBeenCalledTimes(1);
	});
});
