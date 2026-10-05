import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:3002",
      "/health": "http://127.0.0.1:3002",
    },
  },
  resolve: { alias: { "@": resolve(projectRoot, "src") }, tsconfigPaths: true },
  plugins: [tanstackRouter({ target: "react" }), tailwindcss(), react()],
});
