import { jobRuns } from "src/db/schema";
import { describe, expect, it } from "vitest";

describe("jobRuns schema", () => {
	it("exports the durable job run table", () => {
		expect(jobRuns).toBeDefined();
		expect(jobRuns.id).toBeDefined();
		expect(jobRuns.status).toBeDefined();
		expect(jobRuns.lastHeartbeatAt).toBeDefined();
	});
});
