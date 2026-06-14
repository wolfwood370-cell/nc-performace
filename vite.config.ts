import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// NOTE: PWA / Service Worker support has been REMOVED from this project.
// A previously-shipped service worker registered by `vite-plugin-pwa`
// intercepted every navigation on the Lovable preview origin and produced
// HTTP 412 errors that blocked login for both the coach platform and the
// athlete app. The static kill-switch workers in `public/sw.js` and
// `public/service-worker.js` clean the SW out of any browser that already
// installed it. See those files before re-introducing PWA features.

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
