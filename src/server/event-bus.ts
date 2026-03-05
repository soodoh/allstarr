// oxlint-disable no-console -- Event bus logs are intentional server-side diagnostics

export type ServerEvent =
  | { type: "queueUpdated" }
  | { type: "taskUpdated"; taskId: string }
  | { type: "downloadCompleted"; bookId: number | null; title: string }
  | {
      type: "downloadFailed";
      bookId: number | null;
      title: string;
      message: string;
    }
  | { type: "importCompleted"; bookId: number | null; bookTitle: string };

class EventBus {
  private clients = new Set<ReadableStreamDefaultController>();

  addClient(controller: ReadableStreamDefaultController): void {
    this.clients.add(controller);
  }

  removeClient(controller: ReadableStreamDefaultController): void {
    this.clients.delete(controller);
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
