/// <reference types="vite/client" />

/** Build identity injected by vite.config.ts (`define`): a fresh value per
 *  build, wired into the TanStack persist `buster` in src/main.tsx. */
declare const __BUILD_ID__: string;
