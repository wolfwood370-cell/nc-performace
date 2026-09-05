# Task — rag-una-libreria · 2026-09-02

> Prompt-file della fetta, conservato come da task (`docs/prompts/2026-09-02-rag-una-libreria.md`).
> Fonte: misura di Cowork del 02/09 (10:45–10:55, DB vivo chiamato). Esito in `docs/ULTIMO-RITORNO.md`.
> Eseguito il 2026-09-05 su `origin/main` = `be5fe9c` (il prompt dice `ccf1450`: `main` è avanzato con la PR #70 il 03/09).

**DOVE SI LANCIA: Claude Code** — nella cartella del repo `nc-performace-hub`, su un ramo NUOVO `claude/rag-una-libreria` creato da `origin/main` (`ccf1450`).

**Task:** il RAG del prodotto ha due indici, due funzioni e una porta aperta, ed è rotto in produzione dal 25/05. Alla fine ce n'è **uno**: `knowledge_documents` + `knowledge_chunks` letti da `match_knowledge_chunks`, resa indipendente dal `search_path`, eseguibile solo da chi è autenticato; `match_documents` e `coach_knowledge_base` spariscono; `chat-with-coach` legge dalla libreria viva e fallisce forte quando non può leggere. Una migrazione, una edge, due cancelli derivati. Poi push e il link della PR nel ritorno.
**Data:** 2026-09-02
**Strumento di destinazione:** [x] Claude Code
**Branch previsto:** claude/rag-una-libreria

## RITUALE D'APERTURA (prima di toccare codice)

Le `deny` sono provate 13 su 16; restano le tre `mcp__github__*`, il cui server finora non si connetteva. Se stavolta si connette, provale e riporta l'esito; altrimenti scrivi «non connesso» nel ritorno. Nient'altro da provare.

## LA MISURA (Cowork, 02/09 10:45–10:55, DB vivo chiamato — non letto — e `main` = `ccf1450`)

1. **Rotte.** `match_knowledge_chunks(vettore nullo, 0.0, 5)` chiamata come coach autenticato (claims settati, oltre il controllo `auth.uid()`) → `ERROR 42883: operator does not exist: extensions.vector <=> extensions.vector` alla `RETURN QUERY`. `match_documents` → lo stesso errore. L'operatore vive nello schema `extensions`; entrambe hanno `search_path=public, pg_temp`.
2. **Causa.** `20260525120100_security_advisor_definer_hardening.sql:45-80` pinna `search_path = public, pg_temp` su OGNI `SECURITY DEFINER` («idempotent, zero-risk»); il repo per `match_knowledge_chunks` dice `public, extensions` (`20260430125629:105`). Il DB diverge dal repo dal 25/05. Il controllo finale della migrazione (`:86-107`) guarda solo che il `search_path` esista.
3. **Porta.** La stessa migrazione fa `REVOKE FROM PUBLIC` + `GRANT authenticated` (`:71-72`): inefficace contro `anon`, che ha `EXECUTE` **esplicito** dai default privileges di Supabase. ACL di entrambe: `anon=X, authenticated=X, service_role=X`. `match_documents` prende il coach **come parametro**, nessun `auth.uid()`.
4. **Libreria morta.** `coach_knowledge_base`: 0 righe, **nessuno scrittore** nel repo (solo `types.ts:766` e due migrazioni). `chat-with-coach:171-176` legge SOLO da lei via `match_documents` → l'atleta non riceverebbe mai i manuali del coach. Su `matchError` (`:178-180`) e su errore di embedding (`:193-194`) **prosegue senza contesto** e risponde «Non ho ancora informazioni»: un fallimento travestito da assenza. `ask-copilot:378` usa già la funzione giusta, con soglia 0.75 (`:44`), e su errore risponde 500 (`:385-390`).
5. **Righe vive:** `knowledge_documents` 0 · `knowledge_chunks` 0 · `coach_knowledge_base` 0 · `ai_usage_tracking` 0. Le policy RLS di `knowledge_*` sono **solo del coach proprietario**: l'atleta legge i chunk del suo coach SOLO attraverso la funzione `SECURITY DEFINER` — che è quindi il perimetro di sicurezza.

## COSA FAI

1. **Migrazione** `supabase/migrations/<timestamp reale>_rag_una_libreria.sql`, in quest'ordine: **(a)** `CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(...)` con lo **stesso corpo** di oggi e l'operatore **qualificato in entrambe le occorrenze** — `1 - (kc.embedding OPERATOR(extensions.<=>) query_embedding)` e `ORDER BY kc.embedding OPERATOR(extensions.<=>) query_embedding` — mantenendo `SET search_path = public, pg_temp` (era la parte giusta dell'hardening; con l'operatore qualificato nessun pin futuro la rompe più); **(b)** `REVOKE EXECUTE ON FUNCTION public.match_knowledge_chunks(extensions.vector, double precision, integer) FROM PUBLIC, anon;` e `GRANT EXECUTE … TO authenticated, service_role;` — esplicite, perché `CREATE OR REPLACE` conserva l'ACL vecchia; **(c)** `DROP FUNCTION public.match_documents(extensions.vector, uuid, double precision, integer);` e `DROP TABLE public.coach_knowledge_base;`. Commento in testa alla migrazione con la misura (punti 1–3) in tre righe.
2. **`supabase/functions/chat-with-coach/index.ts`:** la RPC diventa `match_knowledge_chunks` con `{ query_embedding, match_threshold: 0.5, match_count: 3 }` — **senza `p_coach_id`** (il coach lo risolve la funzione da `auth.uid()`, atleta → `coach_id`); la fonte citata è `document_title`; su `matchError` e nel `catch` dell'embedding → **`500`** con messaggio esplicito («Errore nel recupero della knowledge base»), mai «proseguo senza contesto». Il controllo «Nessun coach associato» (`:110-114`) resta. La formattazione del contesto va in una **funzione pura** con test Deno (es. `chat-with-coach/rag/formatContext.ts`): lista vuota → stringa vuota; una voce → `[Chunk 1 (Fonte: <document_title>) — Similarità: NN%]` + contenuto. Le soglie 0.5 e 0.75 **restano** quelle di oggi: dichiaralo, non unificarle.
3. **`src/integrations/supabase/types.ts`:** via `coach_knowledge_base` (`:766`) e `match_documents` (`:3447`), nella forma esatta che `supabase gen types` produrrebbe (Cowork confronta col generato dopo l'applicazione).
4. **Due cancelli derivati (vitest, con `readFileSync` come i test «determinismo del modulo puro»):** **(a)** ogni `supabase/migrations/*.sql` con timestamp **≥ quello della tua migrazione** che contiene `<=>`, `<->` o `<#>` **non** preceduti da `OPERATOR(extensions.` → rosso, con file e riga; la soglia è una costante col perché accanto (le due migrazioni storiche con `<=>` nudo non si riscrivono: sono applicate). **(b)** `supabase/functions/**/index.ts`: **0** occorrenze di `rpc("match_documents"` e **≥ 1** di `rpc("match_knowledge_chunks"` in `chat-with-coach`.
5. **Documenti e igiene:** le 6 righe che nominano `match_documents` (`docs/PRODUCT_SPEC.md:125,200` · `docs/DB_MIGRATION.md:53,61` · `docs/stato-repo-2026-07-12.md:215,342`) dicono «una libreria, `match_knowledge_chunks`»; `.gitignore` += `supabase/.temp/`.
6. **Nient'altro.** `ask-copilot`, `ingest-knowledge`, `KnowledgeBase.tsx`, `useCopilotChat.ts`, le policy RLS, i prompt delle due edge: **0 righe**. `is_room_member` e `shares_room_with` (eseguibili da `anon`, senza `auth.uid()`) li **nomini** nel ritorno e non li tocchi: fetta a sé.

## FILE

- **NUOVI:** la migrazione · `chat-with-coach/rag/formatContext.ts` (+ `.test.ts`) · i due test-cancello (dove stanno gli altri test che leggono i sorgenti).
- **MODIFICATI:** `supabase/functions/chat-with-coach/index.ts` · `src/integrations/supabase/types.ts` · `docs/PRODUCT_SPEC.md` · `docs/DB_MIGRATION.md` · `docs/stato-repo-2026-07-12.md` · `.gitignore` · `docs/ULTIMO-RITORNO.md` · `docs/prompts/2026-09-02-rag-una-libreria.md` (questo prompt, conservato).
- **VIETATI (zero righe di diff):** `supabase/functions/ask-copilot/**` · `supabase/functions/ingest-knowledge/**` · `src/pages/coach/KnowledgeBase.tsx` · `src/hooks/useCopilotChat.ts` · ogni migrazione già esistente · `supabase/functions/_shared/program/**`.

## ACCEPTANCE (ognuno può bocciare)

1. La migrazione ha i tre passi nell'ordine, l'operatore qualificato **2 volte**, `REVOKE` e `GRANT` esplicite, i due `DROP` (o il `DROP TABLE` commentato con la data, se Nicolò ha detto di tenerla).
2. 🔴 **Prove rosse, tutte nelle due direzioni con ripristino byte-identico:** cancello (a) su una fixture con `<=>` nudo e timestamp sopra soglia → **rosso**; cancello (b) con la RPC riportata a `match_documents` → **rosso**; `formatContext` con la fonte tolta → il suo test **rosso**.
3. `grep -rn "match_documents" src supabase/functions` → **0 righe**; `grep -rn "p_coach_id" supabase/functions/chat-with-coach` → **0**.
4. Il ramo `matchError` e il `catch` dell'embedding rispondono `500`: mostrali nel diff con le righe.
5. I cinque cancelli: `tsc` 0 · vitest (+ i test nuovi) · eslint 64 = baseline · `build` · `verify:css` 243/243; `deno test` verde sulle cartelle toccate e `deno check` sulle due edge (`chat-with-coach` e, per controllo, `ask-copilot`).
6. `git diff --name-only` = solo i FILE sopra; i VIETATI a 0 righe.

## COSA RIMANDI INDIETRO

`docs/ULTIMO-RITORNO.md` sovrascritto per questa fetta: ramo e hash · rituale d'apertura · manifesto dei file e vietati a 0 · acceptance col comando e l'output · le tre prove rosse coi loro output · le divergenze (soglie non unificate; `DROP` sì/no; ciò che hai visto e non toccato, `is_room_member`/`shares_room_with` compresi) · il link per aprire la PR · **le due righe per Nicolò, nell'ordine:** prima `npx supabase@2.116.0 db push` (la migrazione), poi il deploy di `chat-with-coach` (v28 → v29). `ask-copilot` non si ri-deploya. Commit con `Co-Authored-By: Claude <noreply@anthropic.com>`.
