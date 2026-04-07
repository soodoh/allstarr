import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
const ignoredNitroWarningCodes = new Set([
  "EVAL",
  "CIRCULAR_DEPENDENCY",
  "THIS_IS_UNDEFINED",
  "EMPTY_BUNDLE",
]);

function shouldIgnoreRollupWarning(warning: {
  code?: string;
  id?: string;
  message: string;
}): boolean {
  return (
    warning.code === "MODULE_LEVEL_DIRECTIVE" &&
    warning.id?.includes("node_modules") === true &&
    warning.message.includes('"use client"')
  );
}

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
      onwarn(warning, defaultHandler) {
        if (shouldIgnoreRollupWarning(warning)) {
          return;
        }

        defaultHandler(warning);
      },
      output: {
        manualChunks: getVendorChunk,
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  nitro: {
    rollupConfig: {
      onwarn(warning, defaultHandler) {
        if (
          ignoredNitroWarningCodes.has(warning.code || "") ||
          shouldIgnoreRollupWarning(warning)
        ) {
          return;
        }

        defaultHandler(warning);
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
  plugins: [
    tailwindcss(),
    tanstackStart(),
    nitro(),
    viteReact(),
  ],
});
