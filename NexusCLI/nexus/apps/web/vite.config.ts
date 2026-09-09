import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

/** Dev server proxies /api to the Nexus API server, so the browser makes same-origin requests. */
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.NEXUS_WEB_PORT ?? 5319),
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.NEXUS_PORT ?? 4319}`,
        changeOrigin: false,
        // Server-sent events must not be buffered by the proxy.
        ws: false,
      },
    },
  },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: true },
})
