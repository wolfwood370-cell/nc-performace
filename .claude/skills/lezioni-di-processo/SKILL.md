---
name: lezioni-di-processo
description: Interroga il Log delle retrospettive di docs/auto-miglioramento.md prima di toccare aree con storia — billing, Stripe, webhook, edge function, migration, RLS, hook, mutation testing, cache TanStack — e prima di dichiarare acceptance superata, «ho finito» o «è verde».
---

# Lezioni di processo — interrogare il Log delle retrospettive

A boot si caricano SOLO le sezioni-istruzione di `docs/auto-miglioramento.md` (righe 1-73).
Il Log delle retrospettive — 51 voci datate al 2026-08-16, da riga 74 in poi, append-only —
NON si carica mai per intero: si interroga in modo mirato con le chiavi qui sotto.

## Chiavi di ricerca (Grep su docs/auto-miglioramento.md)

Ogni voce del Log ha un'intestazione `### <data> — fetta <nome>: <titolo> (branch claude/<slug>)`.

- **Per argomento**: Grep dei termini del task (es. `stripe-webhook`, `billing`, `fixture`,
  `mutante`, `queryKey`, `RLS`) con `-n` e qualche riga di contesto; poi Read con `offset`
  sull'intestazione `###` della voce trovata, per leggerla intera — e solo quella.
- **Per fetta o branch**: Grep di `fetta <nome>` oppure del ramo `claude/<slug>`.
- **Per data**: Grep di `### 2026-` come indice cronologico, poi la voce che interessa.

## Quando interrogarlo (non opzionale)

- PRIMA di toccare un'area con storia (billing/Stripe/webhook, edge function, migration,
  tipi generati, cache TanStack persistita): cerca le voci del Log che la citano.
- PRIMA di dichiarare chiuso un lavoro (acceptance, «ho finito», «è verde»): verifica nelle
  voci pertinenti quali gate quell'area considera vincolanti, e di averli eseguiti davvero.

Fonte unica: `docs/auto-miglioramento.md`. Le voci non si ricopiano mai qui né altrove:
si leggono dal file, che resta l'originale append-only.
