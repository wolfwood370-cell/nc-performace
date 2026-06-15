// =============================================================================
// src/lib/coachQueries.ts
// =============================================================================
// Opzioni condivise per le query che leggono il ROSTER atleti del coach
// (`profiles` … role=athlete).
//
// Il default globale (src/main.tsx) è `staleTime: Infinity` + persist IndexedDB
// 24h: ottimo per i dati workout offline-first dell'atleta, ma fa sì che il
// roster coach non si rinfreschi MAI — un atleta aggiunto/collegato non compare
// finché la cache non scade (nemmeno al reload, perché PersistQueryClient
// ripristina la cache "fresh"). Queste opzioni, applicate via spread sulle sole
// query roster, forzano un refresh quando il coach apre/riapre la pagina.
//
// `refetchOnMount: "always"` è intenzionale: busta anche una cache GIÀ persistita
// (es. una lista vuota salvata prima che l'atleta si collegasse).
//
// FE-only: niente realtime su `profiles` (schema managed / security = Lovable, D5).
// =============================================================================

export const COACH_ROSTER_QUERY_OPTS = {
  staleTime: 30_000,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: true,
};
