import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxyTarget = process.env.VITE_PROXY_TARGET || "http://localhost:8080";

export default defineConfig({
  root: "platform",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify("/api")
  },
  server: {
    port: 5180,
    strictPort: true,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  },
  build: {
    outDir: "../dist-platform",
    emptyOutDir: true
  }
});
