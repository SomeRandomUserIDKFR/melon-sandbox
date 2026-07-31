import { defineConfig } from "vite";
import { melonMultiplayer } from "./vite-plugin-melon-mp.js";

export default defineConfig({
  plugins: [melonMultiplayer()],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    // Tunnels (cloudflare / localtunnel) hit Vite with a public Host header
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
});
