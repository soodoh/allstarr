import { db } from "src/db";
import { downloadClients } from "src/db/schema";
import { eq } from "drizzle-orm";
import getProvider from "src/server/download-clients/registry";
import type { ConnectionConfig } from "src/server/download-clients/types";
import { registerTask } from "../registry";
import type { TaskResult } from "../registry";

registerTask({
  id: "refresh-downloads",
  name: "Refresh Downloads",
  description: "Poll download clients for current download status.",
  defaultInterval: 60, // 1 minute
  handler: async (): Promise<TaskResult> => {
    const enabledClients = db
      .select()
      .from(downloadClients)
      .where(eq(downloadClients.enabled, true))
      .all();

    if (enabledClients.length === 0) {
      return { success: true, message: "No enabled download clients" };
    }

    let totalItems = 0;
    let errors = 0;

    const results = await Promise.allSettled(
      enabledClients.map(async (client) => {
        const provider = getProvider(client.implementation);
        const config: ConnectionConfig = {
          implementation:
            client.implementation as ConnectionConfig["implementation"],
          host: client.host,
          port: client.port,
          useSsl: client.useSsl,
          urlBase: client.urlBase,
          username: client.username,
          password: client.password,
          apiKey: client.apiKey,
          category: client.category,
          settings: client.settings as Record<string, unknown> | null,
        };
        return provider.getDownloads(config);
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        totalItems += result.value.length;
      } else {
        errors += 1;
      }
    }

    return {
      success: errors === 0,
      message: `${totalItems} download(s) across ${enabledClients.length} client(s)${errors > 0 ? `, ${errors} error(s)` : ""}`,
    };
  },
});
