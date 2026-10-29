import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // fsevents stalls Vite's startup on this machine (Node 24 / macOS): the
      // server never listens, so `tauri dev` waits on :1420 forever.
      useFsEvents: false,
      ignored: ["**/src-tauri/**"],
    },
  },
}));
