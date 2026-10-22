import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "src/ui",
  plugins: [react()],
  build: { outDir: "../../dist", emptyOutDir: true },
  server: { port: 5173, proxy: { "^/api/": "http://localhost:7420", "/events": "http://localhost:7420", "/mcp": "http://localhost:7420" } },
});
