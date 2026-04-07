import { createFileRoute } from "@tanstack/react-router";
import requireApiKey from "src/server/api-key-auth";

export const Route = createFileRoute("/api/v1/system/status")({
	server: {
		handlers: {
			GET: async ({ request }: { request: Request }) => {
				await requireApiKey(request);
				const { getSystemAbout } = await import("src/server/system-info");
				const about = await getSystemAbout();
				const [osName, ...osVersionParts] = about.osInfo.split(" ");
				const osVersion = osVersionParts.join(" ");

				return Response.json(
					{
						version: about.version,
						buildTime: about.startTime,
						isDebug: process.env.NODE_ENV !== "production",
						isProduction: process.env.NODE_ENV === "production",
						isAdmin: true,
						isUserLoggedIn: true,
						startupPath: process.cwd(),
						appData: about.databasePath,
						osName,
						osVersion,
						isNetCore: true,
						isMono: false,
						isLinux: osName === "Linux",
						isOsx: osName === "Darwin",
						isWindows: osName === "Windows_NT",
						isDocker: about.isDocker,
						mode: "console",
						branch: "main",
						authentication: "apiKey",
						sqliteVersion: about.sqliteVersion,
						migrationVersion: 1,
						urlBase: process.env.BETTER_AUTH_URL || "",
						runtimeVersion: about.runtimeVersion,
						runtimeName: "Bun",
						appName: "Allstarr",
						instanceName: "Allstarr",
						packageVersion: about.version,
						packageAuthor: "",
						packageUpdateMechanism: "builtIn",
					},
					{ status: 200 },
				);
			},
		},
	},
});
