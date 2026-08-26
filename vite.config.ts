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

export default defineConfig(() => {
  // Build identity for the persisted-cache buster (src/main.tsx). Stamped
  // once per build (this factory runs once per `vite build` / dev-server
  // start), so every deploy ships a DIFFERENT literal and the TanStack
  // cache written by a previous build is discarded on restore instead of
  // rehydrating yesterday's object shapes into today's components. The
  // wall clock is allowed here: this is build tooling, not an app module —
  // the app only ever reads the injected constant. Not the git hash on
  // purpose: two builds of the same commit must still differ.
  const buildId = `ncph-${Date.now().toString(36)}`;

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [react()],
    define: {
      __BUILD_ID__: JSON.stringify(buildId),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
