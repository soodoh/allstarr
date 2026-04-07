import type { QueueItem } from "./queue";

export type ServerEvent =
	| { type: "queueUpdated" }
	| { type: "queueProgress"; data: { items: QueueItem[]; warnings: string[] } }
	| { type: "taskUpdated"; taskId: string }
	| { type: "downloadCompleted"; bookId: number | null; title: string }
	| {
			type: "downloadFailed";
			bookId: number | null;
			title: string;
			message: string;
	  }
	| { type: "importCompleted"; bookId: number | null; bookTitle: string }
	| { type: "commandProgress"; commandId: number; progress: string }
	| {
			type: "commandCompleted";
			commandId: number;
			commandType: string;
			result: Record<string, unknown>;
			title: string;
	  }
	| {
			type: "commandFailed";
			commandId: number;
			commandType: string;
			error: string;
			title: string;
	  }
	| { type: "unmappedFilesUpdated" };

class EventBus {
	private clients = new Set<ReadableStreamDefaultController>();

	addClient(controller: ReadableStreamDefaultController): void {
		this.clients.add(controller);
	}

	removeClient(controller: ReadableStreamDefaultController): void {
		this.clients.delete(controller);
	}

	getClientCount(): number {
		return this.clients.size;
	}

	emit(event: ServerEvent): void {
		const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
		for (const controller of this.clients) {
			try {
				controller.enqueue(new TextEncoder().encode(data));
			} catch {
				this.clients.delete(controller);
			}
		}
	}
}

export const eventBus = new EventBus();
