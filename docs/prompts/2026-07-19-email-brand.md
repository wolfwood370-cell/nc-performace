# SPEC — Email brand NC: modulo template condiviso + sender propri + ritiro send-email

**Task:** Unificare le email transazionali sul brand NC: modulo template condiviso + sender propri + ritiro della funzione legacy `send-email`. NIENTE DDL, NIENTE scritture DB, NESSUN file frontend (`src/`) toccato.
**Data:** 2026-07-19
**Strumento di destinazione:** [x] Claude Code
**Branch previsto:** claude/email-brand

Lavori sul repo NC Performance Hub (edge functions = Deno). Piccoli passi: proponi un PIANO e ti FERMI per il mio OK PRIMA di toccare codice. Contratti request/response INVARIATI; il frontend non deve rompersi.

## VERITÀ DI RIFERIMENTO (leggi PRIMA di toccare codice)

- `supabase/functions/invite-athlete/index.ts` — sender GIÀ corretto (`noreply@mail.nctrainingsystems.com`): NON cambiarlo. Cambia SOLO subject+html (dal nuovo modulo) e la risposta d'errore 502 (via `details`). Tutto il resto (auth, ruoli, metadata, ramo user-already-exists) INVARIATO.
- `supabase/functions/forgot-password/index.ts` — whitelist `ALLOWED_HOSTS` e anti-enumeration INVARIATE. Cambiano: `from:` → `"NC Training Systems <noreply@mail.nctrainingsystems.com>"`, subject+html dal modulo, 502 senza `details`.
- `supabase/functions/send-email/` — LEGACY, 0 chiamanti nel frontend (grep verificato 2026-07-19): ELIMINARE la directory e il blocco `[functions.send-email]` da `supabase/config.toml`. Le altre voci del toml restano pinnate come sono.
- `supabase/functions/_shared/apiKeys.ts` — NON toccare.
- Branch remoto/locale `invite-resend-hardening` (4 commit non fusi): dichiara nel PIANO se esiste e se tocca questi file; in caso, proponi riconciliazione o chiusura — mai ignorarlo.
- Il grep di acceptance della migrazione API key (0 riferimenti alle chiavi legacy in functions/) deve restare a 0.

## OBIETTIVO

1. Un modulo condiviso PURO `supabase/functions/_shared/email/templates.ts`: layout unico brand NC + 2 costruttori:
   - `inviteEmail({ firstName, actionLink })` → `{ subject, html }`
   - `recoveryEmail({ actionLink })` → `{ subject, html }`
2. `invite-athlete` e `forgot-password` usano il modulo (l'HTML inline sparisce da entrambe).
3. `send-email` ritirata (dir + toml).
4. Risposte 502: `{ error: "..." }` senza `details`.

## ARCHITETTURA (dove va la logica)

- `_shared/email/templates.ts` = modulo PURO: (params)→stringhe. NIENTE fetch, NIENTE Deno.env, NIENTE Date/Math.random (footer statico, senza anno dinamico) → testabile deterministico.
- `escapeHtml` si SPOSTA nel modulo (da invite-athlete) e viene applicato dentro i costruttori a ogni param testuale; `actionLink` va solo in attributi href quotati e nel testo fallback.
- L'invio (fetch a api.resend.com) RESTA nelle funzioni: il modulo produce contenuto, non fa I/O.

## DESIGN TEMPLATE (brand NC — token reali dell'app)

- Layout tabellare email-safe, larghezza 560, card bianca su fondo `#f1f5f9`, radius 12, charset utf-8, `lang="it"`, niente immagini, niente webfont (stack: -apple-system/Segoe UI/Roboto/Arial).
- Header: banda navy `#003e62`, wordmark testuale bianco «NC TRAINING SYSTEMS» + filetto accent `#226fa3`.
- Corpo: titolo `#0f172a` 20px/700 · testo `#334155` 15px/1.6 · CTA bottone `#003e62` testo bianco radius 8 padding 12/28 · fallback link `#64748b` word-break.
- Footer: divisore `#e2e8f0`; 12px `#94a3b8`: motivo della ricezione + «NC Training Systems · Performance Hub» + «Se non ti aspettavi questa email, puoi ignorarla.»
- Copy (italiano): invito = subject `«{firstName}, il tuo coach ti ha invitato su NC Performance Hub»`, saluto col nome, CTA «Accetta l'invito»; recovery = subject `«Reimposta la tua password — NC Performance Hub»`, CTA «Reimposta password», nota «il link scade a breve» + «se non l'hai richiesta tu, ignora».
- Il riferimento visivo pixel-level è `app/preview-email-brand-2026-07-19.html` (Cowork): replicane la struttura.

## OUTPUT / CONTRATTO

- `invite-athlete`: request/response JSON INVARIATI (`success/email/fullName`, rami `attached/alreadyLinked/409` intatti). Cambia solo il contenuto della mail e il body del 502 (senza `details`).
- `forgot-password`: request/response INVARIATI (`{success:true}` sempre per email valide). Idem 502.
- `send-email`: la funzione NON esiste più nel repo (il deploy la rimuove dal progetto: comando a Nick in Chiusura).

## INVARIANTI DA NON ROMPERE

1. Contratti request/response INVARIATI (solo il body d'errore 502 perde `details` — dichiarato).
2. Gate: escapeHtml su ogni testo utente · whitelist redirectTo INVARIATA · anti-enumeration INVARIATA.
3. Modulo template PURO e deterministico (due run stesso input → output identico).
4. Niente nuove env; `RESEND_API_KEY` letta come oggi, fail-fast come oggi.
5. Stringhe-utente in italiano.
6. config.toml: si RIMUOVE solo `[functions.send-email]`; le altre restano pinnate identiche.

## FILE

- NUOVI: `supabase/functions/_shared/email/templates.ts` · `supabase/functions/_shared/email/templates.test.ts`
- MODIFICATI: `supabase/functions/invite-athlete/index.ts` (import modulo; subject/html; 502) · `supabase/functions/forgot-password/index.ts` (from; import modulo; subject/html; 502) · `supabase/config.toml` (solo rimozione blocco send-email)
- ELIMINATI: `supabase/functions/send-email/` (intera dir)
- VIETATI: `src/**` · `_shared/apiKeys.ts` · `_shared/method/**` · `_shared/nutrition/**` · funzioni Stripe (le chip Lovable lì restano per la fetta billing) · tutto il resto. Niente "while you're here".

## COME LAVORI

- Prima il PIANO (firme del modulo, elenco test, come verifichi ogni pezzo, esito check branch `invite-resend-hardening`) → STOP per il mio OK → poi commit atomici (proposta: 1 modulo+test · 2 forgot-password · 3 invite-athlete · 4 ritiro send-email+toml).
- Test nuovi minimi: escape del nome (input con `<script>` → escapato) · href = actionLink esatto · determinismo · subject attesi. Suite Deno esistente resta verde (send-email non aveva test: il conteggio non scende).
- Commit in italiano + `Co-Authored-By: Claude <noreply@anthropic.com>`. Merge/push = io (Nick) da GitHub Desktop.

---

## Addendum post-piano (decisioni di Nick, 2026-07-19)

- D1 (footer differenziato per email, come da preview) · D2 (documento HTML completo con `lang="it"` + charset) · D3 (`escapeHtml` anche su actionLink) · D4 (firstName required nel costruttore, subject non escapato): **approvate**.
- Branch `claude/invite-resend-hardening`: **parcheggiato** (non chiuso, non toccato). Destino: re-port su main in fetta dedicata.
- Aggiunte allo scope: questa copia della spec in `docs/prompts/` · a chiusura aggiornamento `docs/HANDOFF.md` (incl. allineamento voce stale auth-flow-fix: migration applicata + forgot-password v22 deployata il 19/07) + RETRO in `docs/auto-miglioramento.md`.
