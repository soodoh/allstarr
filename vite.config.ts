import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import path from "node:path";

const shimPath = path.resolve("src/lib/better-sqlite3-browser-shim.ts");

export default defineConfig({
  server: {
    port: 3000,
    host: true, // bind to 0.0.0.0 so the dev server is reachable inside Docker
    allowedHosts: ["allstarr", "host.docker.internal"],
  },
  // Prevent better-sqlite3 (native Node addon) from crashing client hydration.
  // The esbuild plugin redirects pre-bundling to a no-op shim, and the Vite
  // plugin handles unbundled client imports. SSR uses the real module.
  optimizeDeps: {
    esbuildOptions: {
      plugins: [
        {
          name: "better-sqlite3-shim",
          setup(build) {
            build.onResolve({ filter: /^better-sqlite3$/ }, () => ({
              path: shimPath,
            }));
          },
        },
      ],
    },
  },
  plugins: [
    {
      name: "better-sqlite3-browser-shim",
      enforce: "pre",
      resolveId(id, _importer, options) {
        if (id === "better-sqlite3" && !options?.ssr) {
          return shimPath;
        }
      },
    },
    tailwindcss(),
    tsconfigPaths(),
    tanstackStart(),
    nitro(),
    viteReact(),
  ],
});
