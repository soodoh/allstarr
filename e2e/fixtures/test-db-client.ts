/**
 * HTTP client for the app server's test DB endpoint.
 * Routes all DB operations through the app's bun:sqlite connection,
 * eliminating cross-driver visibility issues.
 */
// oxlint-disable-next-line prefer-default-export -- Named export matches project convention
export class TestDbClient {
  private appUrl: string;

  constructor(appUrl: string) {
    this.appUrl = appUrl;
  }

  async insert(
    table: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.appUrl}/api/__test-db`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "insertReturning", table, data }),
    });
    const json = (await res.json()) as {
      ok: boolean;
      data?: Record<string, unknown>;
      error?: string;
    };
    if (!json.ok) {
      throw new Error(`insert(${table}) failed: ${json.error}`);
    }
    return json.data!;
  }

  async select(table: string): Promise<Array<Record<string, unknown>>> {
    const res = await fetch(`${this.appUrl}/api/__test-db`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "select", table }),
    });
    const json = (await res.json()) as {
      ok: boolean;
      data?: Array<Record<string, unknown>>;
      error?: string;
    };
    if (!json.ok) {
      throw new Error(`select(${table}) failed: ${json.error}`);
    }
    return json.data!;
  }

  async deleteAll(table: string): Promise<void> {
    const res = await fetch(`${this.appUrl}/api/__test-db`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", table }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) {
      throw new Error(`deleteAll(${table}) failed: ${json.error}`);
    }
  }

  async update(table: string, data: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${this.appUrl}/api/__test-db`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", table, data }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) {
      throw new Error(`update(${table}) failed: ${json.error}`);
    }
  }

  async resetCaches(): Promise<void> {
    await fetch(`${this.appUrl}/api/__test-db`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resetCaches" }),
    }).catch(() => {
      // Ignore errors — cache reset is best-effort
    });
  }

  /** Clean all test-relevant tables in FK-safe order. */
  async cleanAll(): Promise<void> {
    const tables = [
      "trackedDownloads",
      "history",
      "bookFiles",
      "blocklist",
      "editionDownloadProfiles",
      "authorDownloadProfiles",
      "booksAuthors",
      "editions",
      "books",
      "authors",
      "downloadClients",
      "indexers",
      "syncedIndexers",
      "downloadProfiles",
    ];
    for (const table of tables) {
      await this.deleteAll(table);
    }
  }
}
