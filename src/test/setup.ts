import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

class MockResizeObserver {
	disconnect() {}
	observe() {}
	unobserve() {}
}

globalThis.ResizeObserver = MockResizeObserver as typeof ResizeObserver;

afterEach(() => {
	cleanup();
});
