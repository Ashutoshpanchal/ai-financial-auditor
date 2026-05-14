import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Vite dev proxy target for `/api/*` (host dev: loopback; Docker Compose: backend service). */
const apiProxyTarget = process.env.VITE_PROXY_API_TARGET ?? "http://127.0.0.1:8000";

/** Docker bind mounts often miss fs events; polling makes file saves show up reliably. */
const useDockerWatch =
  process.env.DOCKER === "1" ||
  process.env.CHOKIDAR_USEPOLLING === "1" ||
  process.env.VITE_USE_POLLING === "1";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3002,
    strictPort: true,
    watch: useDockerWatch
      ? {
          usePolling: true,
          interval: 400,
        }
      : undefined,
    // Browser loads the app from host:3002; HMR WebSocket must use the same host:port or updates never apply.
    hmr: {
      host: process.env.VITE_HMR_HOST ?? "localhost",
      port: Number(process.env.VITE_HMR_PORT ?? 3002),
      clientPort: Number(process.env.VITE_HMR_CLIENT_PORT ?? 3002),
    },
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
