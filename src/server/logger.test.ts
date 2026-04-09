import { beforeEach, describe, expect, it, vi } from "vitest";
import { logError, logInfo, logWarn } from "./logger";

beforeEach(() => {
	vi.restoreAllMocks();
});

describe("logInfo", () => {
	it("logs with bracketed scope when scope is not already wrapped", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		logInfo("scheduler", "tick fired");
		expect(spy).toHaveBeenCalledWith("[scheduler] tick fired");
	});

	it("keeps scope unchanged when already wrapped in brackets", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		logInfo("[scheduler]", "tick fired");
		expect(spy).toHaveBeenCalledWith("[scheduler] tick fired");
	});
});

describe("logWarn", () => {
	it("logs with bracketed scope when scope is not already wrapped", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		logWarn("auth", "token expiring soon");
		expect(spy).toHaveBeenCalledWith("[auth] token expiring soon");
	});

	it("keeps scope unchanged when already wrapped in brackets", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		logWarn("[auth]", "token expiring soon");
		expect(spy).toHaveBeenCalledWith("[auth] token expiring soon");
	});
});

describe("logError", () => {
	it("logs with bracketed scope when scope is not already wrapped", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		logError("db", "connection failed");
		expect(spy).toHaveBeenCalledWith("[db] connection failed");
	});

	it("keeps scope unchanged when already wrapped in brackets", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		logError("[db]", "connection failed");
		expect(spy).toHaveBeenCalledWith("[db] connection failed");
	});

	it("logs without error argument when error is omitted", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		logError("db", "query timeout");
		expect(spy).toHaveBeenCalledWith("[db] query timeout");
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it("includes error argument when provided", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const err = new Error("ECONNREFUSED");
		logError("db", "connection failed", err);
		expect(spy).toHaveBeenCalledWith("[db] connection failed", err);
	});

	it("passes non-Error values as the error argument", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		logError("api", "unexpected response", { status: 500 });
		expect(spy).toHaveBeenCalledWith("[api] unexpected response", {
			status: 500,
		});
	});
});
