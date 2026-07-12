> ⚠️ **STORICO — piano già ESEGUITO; non usare come piano.**
> Vedi `docs/stato-repo-2026-07-12.md` §2.

# D2 — Contratto di migrazione 6 funzioni AI → OpenAI diretto

> Reference **verificata con fonti correnti (giugno 2026)** · generata da Cowork.
> **Non è codice da incollare**: è la specifica per chi scrive (Claude Code) + la **checklist di verifica al deploy** (Cowork).
> Endpoint target: `https://api.openai.com/v1/chat/completions` · auth: header `Bearer OPENAI_API_KEY`.
> Gli embedding (`ask-copilot`, `ingest-knowledge`) restano `text-embedding-3-small` (già OpenAI).

---

## Stato

La D2 **non è ancora scritta** (la sessione codice è in plan). Questa reference fissa _come_ va formata la chiamata diretta, così si scrive giusto al primo colpo e Cowork verifica al deploy. La migrazione tocca **solo il blocco chiamata AI** (endpoint + auth + model + parametri); auth gate, role/ownership, parsing, contratto I/O JSON e gestione errori restano **invariati**.

---

## ⚠️ Breaking changes cross-cutting — sono questi che causerebbero 500

| #   | Cambio                                        | Dove                                                            | Dettaglio verificato                                                                                                                                                                                          |
| --- | --------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `max_tokens` → **`max_completion_tokens`**    | `generate-batch-checkins` (`max_tokens:200`) + ovunque presente | Su GPT-5.x `max_tokens` è deprecato e dà errore sull'API diretta.                                                                                                                                             |
| 2   | **Rimuovere `temperature` e `top_p`**         | `generate-batch-checkins` (`temperature:0.7`)                   | I GPT-5.x (reasoning) accettano **solo `temperature=1`**; valori custom → errore/ignorati. `top_p` rimosso. Il gateway Lovable li silenziava, l'API diretta **no**.                                           |
| 3   | **ID modello reali**                          | tutte                                                           | `gpt-5-mini` e `gpt-5-nano` **non risolvono** come ID esatti → usare **`gpt-5.4-mini`** / **`gpt-5.4-nano`**. `gpt-5.2` è valido (ma il frontier attuale è `gpt-5.5`).                                        |
| 4   | `stream_options`                              | `chat-with-coach`                                               | Per il quota tracking dei token in streaming serve **`stream_options:{ include_usage:true }`** (l'ultimo chunk porta `usage` con `choices:[]`). Formato delta invariato: `choices[0].delta.content`.          |
| 5   | Rimuovere `baseURL`                           | `analyze-meal-photo`                                            | `new OpenAI({ apiKey })` usa già `api.openai.com/v1` di default → basta **togliere** l'opzione `baseURL` del gateway. Restare su **Chat Completions** (content-parts vision classico), **non** Responses API. |
| 6   | _(opz.)_ `json_object` → `json_schema` strict | `analyze-meal-photo`, `ask-copilot` (modes)                     | `json_object` resta valido; `json_schema` (strict) garantisce la conformità allo schema. Upgrade **facoltativo**, non bloccante.                                                                              |

---

## Modelli consigliati per funzione (verificati)

| Funzione                   | Tipo chiamata                   | Model gateway attuale           | → Consigliato diretto          | Note                                                                                              |
| -------------------------- | ------------------------------- | ------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `generate-program`         | fetch + tool calling            | `openai/gpt-5.2`                | **`gpt-5.2`** (o `gpt-5.5`)    | Tool calling invariato. `gpt-5.2` valido; `gpt-5.5` è il frontier attuale.                        |
| `analyze-athlete-week`     | fetch + tool calling + DB write | `openai/gpt-5-mini`             | **`gpt-5.4-mini`**             | `gpt-5-mini` non risolve → mini canonico = `gpt-5.4-mini`.                                        |
| `ask-copilot` (RAG)        | fetch (non-stream)              | `openai/gpt-5-mini`             | **`gpt-5.4-mini`**             | idem. Embedding già OpenAI.                                                                       |
| `ask-copilot` (modes JSON) | fetch + `json_object`           | `google/gemini-2.5-flash`       | **`gpt-5.4-mini`** (o `-nano`) | `json_object` ok su GPT-5.x.                                                                      |
| `chat-with-coach`          | fetch **streaming**             | `openai/gpt-5-mini`             | **`gpt-5.4-mini`**             | + `stream_options:{include_usage:true}` per il quota tracking.                                    |
| `analyze-meal-photo`       | OpenAI SDK + vision             | `google/gemini-3-flash-preview` | **`gpt-5.4-mini`**             | Vision-capable; togliere `baseURL`; content-parts `image_url`/base64 invariati.                   |
| `generate-batch-checkins`  | fetch, testo breve              | `google/gemini-2.5-flash`       | **`gpt-5.4-nano`**             | Il più economico ($0.20/1M in). **Togliere `temperature`; `max_tokens`→`max_completion_tokens`.** |

Tutta la famiglia GPT-5.4 (mini e nano inclusi) è **multimodale** → la vision di `analyze-meal-photo` è coperta anche da mini/nano.

---

## Contratto I/O da preservare (invariato per ogni funzione)

Auth gate (`Authorization` → `auth.getUser()`), role/ownership gate, parsing del body, **shape della risposta JSON**, gestione errori (401/403/429/402/500/504), header CORS. Tool calling (`submit_program`, `submit_analysis`): schema `tools`/`tool_choice` **invariato**, nessuna modifica.

---

## Checklist deploy (Cowork, dopo il commit D2)

- [ ] Leggo le 6 dal **commit** (ref immutabile), non dal working tree.
- [ ] Diff: **0** riferimenti a `ai.gateway.lovable.dev` / `LOVABLE_API_KEY`; presenti `api.openai.com` + `OPENAI_API_KEY`.
- [ ] Nessun `max_tokens` residuo; nessuna `temperature`≠1 / `top_p` sui GPT-5.x.
- [ ] ID modello tutti reali (GPT-5.x esistenti).
- [ ] Deploy 6 con `verify_jwt=true` (da `config.toml`).
- [ ] `get_logs` edge-function; invocazione di prova (JWT utente) → atteso **200**.
- [ ] Dipendenza runtime: `OPENAI_API_KEY` reale e con **credito attivo** (altrimenti 401/429), ID modello validi sull'account.

---

## Fonti (giugno 2026)

- Modelli: `developers.openai.com/api/docs/models` · `/models/gpt-5.2` · `/models/gpt-5.4-mini` · `openai.com/index/introducing-gpt-5-4-mini-and-nano/`
- `max_completion_tokens`: `developers.openai.com/api/reference/resources/chat/.../create`
- `temperature`/`top_p` rimossi su GPT-5.x: `community.openai.com/t/gpt-5-removed-parameters-logprob-top-p-temperature/1345768`
- Structured Outputs: `developers.openai.com/api/docs/guides/structured-outputs`
- Vision: `developers.openai.com/api/docs/guides/images-vision`
- Streaming + `stream_options`: `developers.openai.com/api/docs/guides/streaming-responses`
- SDK Node `openai` (6.38.0): `npmjs.com/package/openai`

_Generato da Cowork (sessione connettore/infra), giugno 2026. Da consegnare a Claude Code come spec di implementazione; resta valido come checklist di deploy._
