import { createFileRoute } from "@tanstack/react-router";
import requireApiKey from "src/server/api-key-auth";

export const Route = createFileRoute("/api/v1/system/status")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        await requireApiKey(request);
        return Response.json(
          {
            version: "1.0.0",
            buildTime: new Date().toISOString(),
            isDebug: false,
            isProduction: true,
            isAdmin: true,
            isUserLoggedIn: true,
            startupPath: "/",
            appData: "/data",
            osName: "linux",
            osVersion: "",
            isNetCore: true,
            isMono: false,
            isLinux: true,
            isOsx: false,
            isWindows: false,
            isDocker: false,
            mode: "console",
            branch: "main",
            authentication: "apiKey",
            sqliteVersion: "3.0.0",
            migrationVersion: 1,
            urlBase: "",
            runtimeVersion: "",
            runtimeName: "Node",
            appName: "Allstarr",
            instanceName: "Allstarr",
            packageVersion: "1.0.0",
            packageAuthor: "",
            packageUpdateMechanism: "builtIn",
          },
          { status: 200 },
        );
      },
    },
  },
});
