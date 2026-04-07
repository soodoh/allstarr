import { afterEach, describe, expect, it } from "vitest";
import { resolveImagePath } from "../image-cache";

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
	if (originalDatabaseUrl === undefined) {
		delete process.env.DATABASE_URL;
	} else {
		process.env.DATABASE_URL = originalDatabaseUrl;
	}
});

describe("resolveImagePath", () => {
	it("resolves paths inside the images directory", async () => {
		process.env.DATABASE_URL = "/tmp/allstarr/sqlite.db";

		await expect(resolveImagePath("authors/42.jpg")).resolves.toBe(
			"/tmp/allstarr/images/authors/42.jpg",
		);
	});

	it("rejects path traversal attempts", async () => {
		process.env.DATABASE_URL = "/tmp/allstarr/sqlite.db";

		await expect(resolveImagePath("../secrets.txt")).rejects.toThrow(
			"Invalid image path",
		);
	});
});
