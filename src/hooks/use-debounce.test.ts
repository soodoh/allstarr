import { act } from "@testing-library/react";
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

	it("returns the initial value immediately and updates after the delay", () => {
		const { result, rerender } = renderHook(
			({ delay, value }) => useDebounce(value, delay),
			{
				initialProps: { delay: 200, value: "first" },
			},
		);

		expect(result.current).toBe("first");

		rerender({ delay: 200, value: "second" });
		expect(result.current).toBe("first");

		act(() => {
			vi.advanceTimersByTime(200);
		});

		expect(result.current).toBe("second");
	});

	it("cancels the previous timer when the value changes again", () => {
		const { result, rerender } = renderHook(
			({ delay, value }) => useDebounce(value, delay),
			{
				initialProps: { delay: 200, value: "first" },
			},
		);

		rerender({ delay: 200, value: "second" });

		act(() => {
			vi.advanceTimersByTime(150);
		});

		rerender({ delay: 200, value: "third" });

		act(() => {
			vi.advanceTimersByTime(199);
		});

		expect(result.current).toBe("first");

		act(() => {
			vi.advanceTimersByTime(1);
		});

		expect(result.current).toBe("third");
	});
});
