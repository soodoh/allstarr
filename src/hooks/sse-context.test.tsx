import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SSEContext, useSSEConnection } from "./sse-context";

describe("useSSEConnection", () => {
	it("returns the default disconnected state without a provider", () => {
		const { result } = renderHook(() => useSSEConnection());

		expect(result.current).toEqual({ isConnected: false });
	});

	it("reads the current value from the SSE context provider", () => {
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<SSEContext.Provider value={{ isConnected: true }}>
				{children}
			</SSEContext.Provider>
		);

		const { result } = renderHook(() => useSSEConnection(), { wrapper });

		expect(result.current).toEqual({ isConnected: true });
	});
});
