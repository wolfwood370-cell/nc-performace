import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execFileSync } from "node:child_process";

// NOTE: PWA / Service Worker support has been REMOVED from this project.
// A previously-shipped service worker registered by `vite-plugin-pwa`
// intercepted every navigation on the Lovable preview origin and produced
// HTTP 412 errors that blocked login for both the coach platform and the
// athlete app. The static kill-switch workers in `public/sw.js` and
// `public/service-worker.js` clean the SW out of any browser that already
// installed it. See those files before re-introducing PWA features.

const SHA_RE = /^[0-9a-f]{7,40}$/i;

// Build identity for the persisted-cache buster (src/main.tsx): the COMMIT
// the build was made from, so the TanStack cache written by a previous
// deploy is discarded on restore — and, just as deliberately, a REBUILD of
// the same commit injects the SAME literal and the asset hashes stay put
// (measured: a wall-clock id churned 124/143 asset names per build, forcing
// every client to re-download an unchanged bundle). Wanted property: changes
// when the code changes, does NOT change when it doesn't.
//
// Source chain, declared:
//   1. VERCEL_GIT_COMMIT_SHA — what Vercel deploys is a commit; the env var
//      is present on every Vercel build.
//   2. `git rev-parse --short=12 HEAD` — local builds and CI checkouts.
//      Running a command is fine HERE (build tooling); the app itself only
//      ever reads the injected literal.
//   3. No silent constant fallback ON PURPOSE: a belt that dies silently is
//      the exact defect class this slice repairs. With neither source the
//      build FAILS naming both — every real build environment of this repo
//      (Vercel, local checkout, GitHub Actions) has one of the two.
function resolveBuildId(): string {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (vercelSha && SHA_RE.test(vercelSha)) return vercelSha.slice(0, 12).toLowerCase();
  try {
    const sha = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
    }).trim();
    if (SHA_RE.test(sha)) return sha.toLowerCase();
  } catch {
    // fall through to the explicit failure below
  }
  throw new Error(
    "[vite.config] Identità del build non determinabile: né VERCEL_GIT_COMMIT_SHA né " +
      "`git rev-parse` disponibili. Il buster della cache persistita (main.tsx) non può " +
      "essere iniettato — build interrotto invece di spedire una cintura morta in silenzio.",
  );
}

export default defineConfig(() => {
  const buildId = `ncph-${resolveBuildId()}`;

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
