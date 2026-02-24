import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  server: {
    port: 3000,
    host: true, // bind to 0.0.0.0 so the dev server is reachable inside Docker
    allowedHosts: ["allstarr"], // allow Prowlarr (via gluetun Docker network) to reach this dev server
    watch: {
      usePolling: true, // macOS bind mounts don't propagate inotify events to Docker
    },
  },
  plugins: [tailwindcss(), tsconfigPaths(), tanstackStart(), nitro(), viteReact()],
});
