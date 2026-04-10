import { renderHook } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useIsMobile } from "./use-mobile";

type MatchMediaListener = (event: MediaQueryListEvent) => void;

describe("useIsMobile", () => {
	let listeners: MatchMediaListener[] = [];
	let originalMatchMedia: typeof window.matchMedia;
	let removeEventListener: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		listeners = [];
		originalMatchMedia = window.matchMedia;
		removeEventListener = vi.fn(
			(_type: string, listener: MatchMediaListener) => {
				listeners = listeners.filter((entry) => entry !== listener);
			},
		);

		Object.defineProperty(window, "innerWidth", {
			configurable: true,
			value: 500,
			writable: true,
		});

		window.matchMedia = vi.fn().mockImplementation(() => ({
			addEventListener: (_type: string, listener: MatchMediaListener) => {
				listeners.push(listener);
			},
			addListener: vi.fn(),
			dispatchEvent: vi.fn(),
			matches: true,
			media: "(max-width: 767px)",
			onchange: null,
			removeEventListener,
			removeListener: vi.fn(),
		}));
	});

	afterEach(() => {
		window.matchMedia = originalMatchMedia;
		vi.restoreAllMocks();
	});

	it("reads the initial mobile state from innerWidth", async () => {
		const { result } = await renderHook(() => useIsMobile());

		expect(result.current).toBe(true);
	});

	it("updates when the media query listener fires", async () => {
		const { result } = await renderHook(() => useIsMobile());

		window.innerWidth = 1024;
		for (const listener of listeners) {
			listener({ matches: false } as MediaQueryListEvent);
		}

		await vi.waitFor(() => {
			expect(result.current).toBe(false);
		});
	});

	it("removes the media query listener on unmount", async () => {
		const { unmount } = await renderHook(() => useIsMobile());

		expect(listeners).toHaveLength(1);

		unmount();

		expect(removeEventListener).toHaveBeenCalledWith(
			"change",
			expect.any(Function),
		);
		expect(listeners).toHaveLength(0);
	});
});
