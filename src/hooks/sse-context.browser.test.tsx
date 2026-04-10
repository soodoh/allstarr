import { renderHook } from "src/test/render";
import { describe, expect, it } from "vitest";

import { SSEContext, useSSEConnection } from "./sse-context";

describe("useSSEConnection", () => {
	it("returns the default disconnected state without a provider", async () => {
		const { result } = await renderHook(() => useSSEConnection());

		expect(result.current).toEqual({ isConnected: false });
	});

	it("reads the current value from the SSE context provider", async () => {
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<SSEContext.Provider value={{ isConnected: true }}>
				{children}
			</SSEContext.Provider>
		);

		const { result } = await renderHook(() => useSSEConnection(), { wrapper });

		expect(result.current).toEqual({ isConnected: true });
	});
});
