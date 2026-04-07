import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import path from "node:path";

const shimPath = path.resolve("src/lib/bun-sqlite-browser-shim.ts");

function getVendorChunk(id: string): string | undefined {
  if (!id.includes("node_modules")) {
    return;
  }

  if (
    id.includes("/node_modules/react/") ||
    id.includes("/node_modules/react-dom/") ||
    id.includes("/node_modules/scheduler/")
  ) {
    return "react-vendor";
  }

  if (
    id.includes("/node_modules/@radix-ui/") ||
    id.includes("/node_modules/@floating-ui/") ||
    id.includes("/node_modules/cmdk/") ||
    id.includes("/node_modules/sonner/") ||
    id.includes("/node_modules/next-themes/")
  ) {
    return "ui-vendor";
  }

  if (id.includes("/node_modules/@dnd-kit/")) {
    return "dnd-vendor";
  }

  if (id.includes("/node_modules/better-call/")) {
    return "better-call-vendor";
  }

  if (id.includes("/node_modules/@better-fetch/")) {
    return "better-fetch-vendor";
  }

  if (id.includes("/node_modules/@better-auth/utils/")) {
    return "better-auth-utils-vendor";
  }

  if (id.includes("/node_modules/better-auth/dist/client/")) {
    return "better-auth-client-vendor";
  }

  if (id.includes("/node_modules/better-auth/dist/plugins/")) {
    return "better-auth-plugins-vendor";
  }

  if (
    id.includes("/node_modules/better-auth/") ||
    id.includes("/node_modules/@better-auth/")
  ) {
    return "better-auth-vendor";
  }

  if (
    id.includes("/node_modules/jose/") ||
    id.includes("/node_modules/@noble/")
  ) {
    return "crypto-vendor";
  }

  if (id.includes("/node_modules/lucide-react/")) {
    return "icons-vendor";
  }

  if (id.includes("/node_modules/zod/")) {
    return "schema-vendor";
  }
}

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: getVendorChunk,
      },
    },
  },
  ssr: {
    external: ["sharp"],
  },
  server: {
    port: Number(process.env.PORT) || 3000,
    host: true, // bind to 0.0.0.0 so the dev server is reachable inside Docker
    allowedHosts: ["allstarr", "host.docker.internal"],
  },
  // Prevent bun:sqlite from crashing client hydration.
  // The esbuild plugin redirects pre-bundling to a no-op shim, and the Vite
  // plugin handles unbundled client imports. SSR uses the real module.
  optimizeDeps: {
    esbuildOptions: {
      plugins: [
        {
          name: "bun-sqlite-shim",
          setup(build) {
            build.onResolve({ filter: /^bun:sqlite$/ }, () => ({
              path: shimPath,
            }));
          },
        },
      ],
    },
  },
  plugins: [
    {
      name: "bun-sqlite-browser-shim",
      enforce: "pre",
      resolveId(id, _importer, options) {
        if (id === "bun:sqlite" && !options?.ssr) {
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
