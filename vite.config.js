import { defineConfig } from "vite";
import { melonMultiplayer } from "./vite-plugin-melon-mp.js";

export default defineConfig({
  plugins: [melonMultiplayer()],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: true,
    port: 5173,
  },
});
