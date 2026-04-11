import { renderHook } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebounce } from "./use-debounce";

describe("useDebounce", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("returns the initial value immediately and updates after the delay", async () => {
		const { result, rerender } = await renderHook(
			(props) => useDebounce(props?.value ?? "first", props?.delay ?? 200),
			{
				initialProps: { delay: 200, value: "first" },
			},
		);

		expect(result.current).toBe("first");

		rerender({ delay: 200, value: "second" });
		expect(result.current).toBe("first");

		await vi.advanceTimersByTimeAsync(200);

		expect(result.current).toBe("second");
	});

	it("cancels the previous timer when the value changes again", async () => {
		const { result, rerender } = await renderHook(
			(props) => useDebounce(props?.value ?? "first", props?.delay ?? 200),
			{
				initialProps: { delay: 200, value: "first" },
			},
		);

		rerender({ delay: 200, value: "second" });

		await vi.advanceTimersByTimeAsync(150);

		rerender({ delay: 200, value: "third" });

		await vi.advanceTimersByTimeAsync(199);

		expect(result.current).toBe("first");

		await vi.advanceTimersByTimeAsync(1);

		await vi.waitFor(() => {
			expect(result.current).toBe("third");
		});
	});
});
