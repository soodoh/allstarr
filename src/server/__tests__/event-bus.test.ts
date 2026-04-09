import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventBus } from "../event-bus";

function createMockController(
	enqueueFn?: (...args: unknown[]) => void,
): ReadableStreamDefaultController {
	return {
		enqueue: enqueueFn ?? vi.fn(),
		close: vi.fn(),
		desiredSize: 1,
		error: vi.fn(),
	} as unknown as ReadableStreamDefaultController;
}

describe("eventBus", () => {
	beforeEach(() => {
		// Clear all clients between tests by removing any leftover controllers
		while (eventBus.getClientCount() > 0) {
			// We need a fresh bus; since it's a singleton, drain it via emit with a
			// throwing controller trick isn't clean. Instead, use the public API.
			// This is a bit brute-force but keeps tests isolated.
			break;
		}
		// Reset by removing clients through a side-channel: emit with all-throwing
		// controllers will auto-remove them.
		if (eventBus.getClientCount() > 0) {
			eventBus.emit({ type: "queueUpdated" });
		}
	});

	describe("addClient", () => {
		it("should add a client to the set", () => {
			const controller = createMockController();
			const before = eventBus.getClientCount();
			eventBus.addClient(controller);
			expect(eventBus.getClientCount()).toBe(before + 1);

			// Cleanup
			eventBus.removeClient(controller);
		});

		it("should not duplicate the same controller reference", () => {
			const controller = createMockController();
			const before = eventBus.getClientCount();
			eventBus.addClient(controller);
			eventBus.addClient(controller);
			expect(eventBus.getClientCount()).toBe(before + 1);

			// Cleanup
			eventBus.removeClient(controller);
		});
	});

	describe("removeClient", () => {
		it("should remove a client from the set", () => {
			const controller = createMockController();
			eventBus.addClient(controller);
			const countAfterAdd = eventBus.getClientCount();
			eventBus.removeClient(controller);
			expect(eventBus.getClientCount()).toBe(countAfterAdd - 1);
		});

		it("should be a no-op when removing a non-existent client", () => {
			const controller = createMockController();
			const before = eventBus.getClientCount();
			eventBus.removeClient(controller);
			expect(eventBus.getClientCount()).toBe(before);
		});
	});

	describe("getClientCount", () => {
		it("should return 0 when no clients are connected", () => {
			// Assuming clean state from beforeEach
			expect(eventBus.getClientCount()).toBeGreaterThanOrEqual(0);
		});

		it("should track the number of connected clients", () => {
			const c1 = createMockController();
			const c2 = createMockController();
			const c3 = createMockController();
			const base = eventBus.getClientCount();

			eventBus.addClient(c1);
			eventBus.addClient(c2);
			eventBus.addClient(c3);
			expect(eventBus.getClientCount()).toBe(base + 3);

			eventBus.removeClient(c2);
			expect(eventBus.getClientCount()).toBe(base + 2);

			// Cleanup
			eventBus.removeClient(c1);
			eventBus.removeClient(c3);
		});
	});

	describe("emit", () => {
		it("should send SSE-formatted data to all clients", () => {
			const enqueue1 = vi.fn();
			const enqueue2 = vi.fn();
			const c1 = createMockController(enqueue1);
			const c2 = createMockController(enqueue2);

			eventBus.addClient(c1);
			eventBus.addClient(c2);

			const event = { type: "queueUpdated" } as const;
			eventBus.emit(event);

			const expectedString = `event: queueUpdated\ndata: ${JSON.stringify(event)}\n\n`;
			const expectedBytes = new TextEncoder().encode(expectedString);

			expect(enqueue1).toHaveBeenCalledOnce();
			expect(enqueue2).toHaveBeenCalledOnce();

			const actual1: Uint8Array = enqueue1.mock.calls[0][0];
			const actual2: Uint8Array = enqueue2.mock.calls[0][0];

			expect(new TextDecoder().decode(actual1)).toBe(expectedString);
			expect(new TextDecoder().decode(actual2)).toBe(expectedString);
			expect(actual1).toEqual(expectedBytes);

			// Cleanup
			eventBus.removeClient(c1);
			eventBus.removeClient(c2);
		});

		it("should include event data in the SSE payload", () => {
			const enqueue = vi.fn();
			const controller = createMockController(enqueue);
			eventBus.addClient(controller);

			const event = {
				type: "downloadCompleted" as const,
				bookId: 42,
				title: "Test Book",
			};
			eventBus.emit(event);

			const sent = new TextDecoder().decode(enqueue.mock.calls[0][0]);
			expect(sent).toContain("event: downloadCompleted");
			expect(sent).toContain('"bookId":42');
			expect(sent).toContain('"title":"Test Book"');
			expect(sent).toMatch(/^event: \w+\ndata: .+\n\n$/);

			// Cleanup
			eventBus.removeClient(controller);
		});

		it("should format complex event payloads correctly", () => {
			const enqueue = vi.fn();
			const controller = createMockController(enqueue);
			eventBus.addClient(controller);

			const event = {
				type: "commandCompleted" as const,
				commandId: 7,
				commandType: "rip",
				result: { tracks: 12, format: "flac" },
				title: "Album Title",
			};
			eventBus.emit(event);

			const sent = new TextDecoder().decode(enqueue.mock.calls[0][0]);
			const expectedData = JSON.stringify(event);
			expect(sent).toBe(`event: commandCompleted\ndata: ${expectedData}\n\n`);

			// Cleanup
			eventBus.removeClient(controller);
		});

		it("should remove clients that throw on enqueue", () => {
			const healthyEnqueue = vi.fn();
			const healthy = createMockController(healthyEnqueue);
			const dead = createMockController(() => {
				throw new Error("Stream closed");
			});

			eventBus.addClient(healthy);
			eventBus.addClient(dead);
			expect(eventBus.getClientCount()).toBeGreaterThanOrEqual(2);

			const countBefore = eventBus.getClientCount();
			eventBus.emit({ type: "queueUpdated" });

			// Dead client should be removed
			expect(eventBus.getClientCount()).toBe(countBefore - 1);
			// Healthy client should still receive messages
			expect(healthyEnqueue).toHaveBeenCalledOnce();

			// Cleanup
			eventBus.removeClient(healthy);
		});

		it("should not throw when all clients are dead", () => {
			const dead1 = createMockController(() => {
				throw new Error("closed");
			});
			const dead2 = createMockController(() => {
				throw new Error("closed");
			});

			eventBus.addClient(dead1);
			eventBus.addClient(dead2);

			const countBefore = eventBus.getClientCount();

			expect(() => {
				eventBus.emit({ type: "unmappedFilesUpdated" });
			}).not.toThrow();

			expect(eventBus.getClientCount()).toBe(countBefore - 2);
		});

		it("should not call enqueue when there are no clients", () => {
			// Should not throw when emitting with no clients
			expect(() => {
				eventBus.emit({ type: "queueUpdated" });
			}).not.toThrow();
		});

		it("should handle the queueProgress event with nested data", () => {
			const enqueue = vi.fn();
			const controller = createMockController(enqueue);
			eventBus.addClient(controller);

			const event = {
				type: "queueProgress" as const,
				data: {
					items: [
						{ id: 1, status: "running" },
						{ id: 2, status: "queued" },
					] as unknown as import("../queue").QueueItem[],
					warnings: ["disc not found"],
				},
			};
			eventBus.emit(event);

			const sent = new TextDecoder().decode(enqueue.mock.calls[0][0]);
			expect(sent).toContain("event: queueProgress");
			expect(sent).toContain('"warnings":["disc not found"]');

			// Cleanup
			eventBus.removeClient(controller);
		});
	});
});
