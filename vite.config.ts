import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir:
      process.env.VITE_DESKTOP_TEST === "1" ? "work/desktop-dist" : "dist",
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/target/**", "**/work/**", "**/release/**"],
    },
  },
});
