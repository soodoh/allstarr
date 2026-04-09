import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseStoredSettingValue } from "../settings-value";

const settingsStoreMocks = vi.hoisted(() => {
	const get = vi.fn();
	const where = vi.fn(() => ({
		get,
	}));
	const from = vi.fn(() => ({
		where,
	}));
	const select = vi.fn(() => ({
		from,
	}));
	const run = vi.fn();
	const onConflictDoUpdate = vi.fn(() => ({
		run,
	}));
	const values = vi.fn(() => ({
		onConflictDoUpdate,
	}));
	const insert = vi.fn(() => ({
		values,
	}));
	const eq = vi.fn((left: unknown, right: unknown) => ({ left, right }));

	return {
		eq,
		from,
		get,
		insert,
		onConflictDoUpdate,
		run,
		select,
		values,
		where,
	};
});

vi.mock("drizzle-orm", () => ({
	eq: settingsStoreMocks.eq,
}));

vi.mock("src/db", () => ({
	db: {
		insert: settingsStoreMocks.insert,
		select: settingsStoreMocks.select,
	},
}));

vi.mock("src/db/schema", () => ({
	settings: {
		key: "settings.key",
	},
}));

beforeEach(() => {
	vi.clearAllMocks();
});

describe("parseStoredSettingValue", () => {
	it("unwraps JSON-stringified primitive values", () => {
		expect(parseStoredSettingValue('"viewer"', "requester")).toBe("viewer");
		expect(parseStoredSettingValue("true", false)).toBe(true);
		expect(parseStoredSettingValue("42", 0)).toBe(42);
	});

	it("returns the raw string when parsing fails", () => {
		expect(parseStoredSettingValue("plain-text", "")).toBe("plain-text");
	});

	it("returns the fallback for missing values", () => {
		expect(parseStoredSettingValue(undefined, "fallback")).toBe("fallback");
		expect(parseStoredSettingValue(null, "fallback")).toBe("fallback");
	});
});

describe("settings-store", () => {
	it("reads stored values and falls back when no row exists", async () => {
		settingsStoreMocks.get.mockReturnValueOnce({ value: '"viewer"' });
		settingsStoreMocks.get.mockReturnValueOnce(undefined);

		const { getSettingValue } = await import("../settings-store");

		expect(getSettingValue("auth.defaultRole", "requester")).toBe("viewer");
		expect(getSettingValue("missing.setting", "fallback")).toBe("fallback");

		expect(settingsStoreMocks.select).toHaveBeenCalledTimes(2);
		expect(settingsStoreMocks.from).toHaveBeenCalledTimes(2);
		expect(settingsStoreMocks.where).toHaveBeenCalledTimes(2);
		expect(settingsStoreMocks.get).toHaveBeenCalledTimes(2);
		expect(settingsStoreMocks.eq).toHaveBeenCalledWith(
			"settings.key",
			"auth.defaultRole",
		);
		expect(settingsStoreMocks.eq).toHaveBeenCalledWith(
			"settings.key",
			"missing.setting",
		);
	});

	it("upserts JSON-stringified values", async () => {
		const { upsertSettingValue } = await import("../settings-store");

		upsertSettingValue("ui.theme", { mode: "dark" });

		expect(settingsStoreMocks.insert).toHaveBeenCalledWith({
			key: "settings.key",
		});
		expect(settingsStoreMocks.values).toHaveBeenCalledWith({
			key: "ui.theme",
			value: JSON.stringify({ mode: "dark" }),
		});
		expect(settingsStoreMocks.onConflictDoUpdate).toHaveBeenCalledWith({
			target: "settings.key",
			set: { value: JSON.stringify({ mode: "dark" }) },
		});
		expect(settingsStoreMocks.run).toHaveBeenCalledTimes(1);
	});
});
