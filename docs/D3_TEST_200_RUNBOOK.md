# D3 — Runbook TEST 200 (6 funzioni AI → OpenAI diretto)

> **Generato da Cowork (sessione connettore/infra), 2026-06-14.** Reference operativa per portare le 6 funzioni AI da **500** a **200**.
> Stato deploy verificato in questa sessione; il TEST 200 è **gated** su azioni dashboard che restano a Nick (vedi §4).
> Progetto Supabase ref `xgxtplqlewpqjzghvbke` · URL `https://xgxtplqlewpqjzghvbke.supabase.co` · publishable key (pubblica) `sb_publishable_Hr-lQDDqFZZXZgfjLK999A_JkCfRg1f`.

---

## 1. Stato verificato (read-only, via connettore)

| Verifica                                  | Esito                                                                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Progetto                                  | `ACTIVE_HEALTHY` · eu-central-1 · Postgres 17.6                                                                                                                                                         |
| 6 funzioni AI deployate                   | **v3, `verify_jwt=true`** tutte (`analyze-athlete-week`, `analyze-meal-photo`, `ask-copilot`, `chat-with-coach`, `generate-batch-checkins`, `generate-program`)                                         |
| `verify_jwt` vs `config.toml`             | **Coerente al 100%** su tutte le 15 funzioni (le 6 AI a `true`; eccezioni `stripe-webhook`+`forgot-password` a `false`)                                                                                 |
| Fedeltà sorgente deployato (contratto D2) | **PASS** — 0 residui `ai.gateway.lovable.dev`/`LOVABLE_API_KEY`; presente `api.openai.com`; 0 `max_tokens` letterali; 0 `temperature`/`top_p`; `stream_options.include_usage` solo in `chat-with-coach` |
| Model ID deployati                        | `gpt-5.4-mini` (×4), `gpt-5.4-nano` (`generate-batch-checkins`), `gpt-5.2` (`generate-program`), `text-embedding-3-small` (embeddings)                                                                  |
| Secret referenziati dalle 6               | `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`                                                                                                                      |
| Log edge-function (24h)                   | **vuoti** → nessuna invocazione ancora → nessun 500 reale registrato; frontend non ancora puntato                                                                                                       |
| Advisor security                          | **0 ERROR**, ~42 WARN (deferiti D5)                                                                                                                                                                     |
| Advisor performance                       | **0 ERROR**, 354 lint INFO/WARN (deferiti D5)                                                                                                                                                           |

**Nota secret:** `SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY` sono iniettati automaticamente dal runtime Supabase (sempre presenti). **L'unico secret da impostare a mano per le 6 AI è `OPENAI_API_KEY`.** Via connettore **non** posso leggere i _valori_ dei secret (nessun tool list-secrets): presenza e credito di `OPENAI_API_KEY` si confermano **solo col test runtime** (canary §3).

**Debito doc minore:** in `generate-program` e `analyze-meal-photo` un commento nel sorgente recita ancora `verify_jwt = false`, mentre metadati + `config.toml` sono `true`. Solo disallineamento testuale (il runtime fa comunque `auth.getUser()`); da ripulire lato Claude Code, non bloccante.

---

## 2. Mappa delle 6 funzioni per il test

| Funzione                    | Body minimo                                                                        | Auth/ruolo                                         | Scrive su DB?                                         | Classe test                      |
| --------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- | -------------------------------- |
| **ask-copilot**             | `{"message":"Cos'è il VBT?"}`                                                      | qualsiasi utente loggato                           | No                                                    | **CANARY (smoke facile)**        |
| **chat-with-coach**         | `{"query":"Come gestisco il deload?"}`                                             | utente con `role='coach'` o `coach_id` valorizzato | Sì (`ai_usage_tracking`, +quota) · risposta **SSE**   | Quasi-smoke                      |
| **analyze-meal-photo**      | `{"imageBase64":"<base64>","mimeType":"image/jpeg"}`                               | qualsiasi utente loggato                           | No                                                    | Richiede **[IMG]** reale         |
| **generate-program**        | `{"athlete_id":"<UUID>","focus_goal":"Ipertrofia","days_per_week":4,"mode":"new"}` | coach **proprietario** dell'atleta                 | No                                                    | Richiede **[ID REALE]**          |
| **analyze-athlete-week**    | `{"athlete_id":"<UUID>"}`                                                          | coach **proprietario** dell'atleta                 | **Sì** (insert `athlete_ai_insights`)                 | Richiede **[ID REALE]**          |
| **generate-batch-checkins** | `{}`                                                                               | coach (itera su tutto il roster)                   | **Sì** (upsert `weekly_checkins`) + **N chiamate AI** | ⚠️ Fan-out: NON lanciare a vuoto |

---

## 3. Procedura test (ordine consigliato)

**Strategia:** prima il **canary** read-only (prova end-to-end del path OpenAI senza scrivere né servire dati reali); poi `chat-with-coach`; le 4 data-dipendenti si verificano durante lo **smoke test dell'app** con fixture reali (NON con curl alla cieca). Ogni model ID è validato solo quando la sua funzione viene colpita: il canary valida `gpt-5.4-mini`+embeddings; `gpt-5.2` solo con `generate-program`; `gpt-5.4-nano` solo con `generate-batch-checkins`.

### 3a. Ottenere un JWT utente (email/password — non serve Google)

```bash
curl -s "https://xgxtplqlewpqjzghvbke.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: sb_publishable_Hr-lQDDqFZZXZgfjLK999A_JkCfRg1f" \
  -H "Content-Type: application/json" \
  -d '{"email":"<coach-di-test>","password":"<password>"}'
# → copia il campo "access_token" dalla risposta
```

(Utente di test creabile via signup nell'app oppure Supabase Dashboard → Authentication → Users → Add user.)

### 3b. Canary — `ask-copilot` (atteso 200)

```bash
JWT="<access_token>"
curl -i -X POST "https://xgxtplqlewpqjzghvbke.supabase.co/functions/v1/ask-copilot" \
  -H "Authorization: Bearer $JWT" \
  -H "apikey: sb_publishable_Hr-lQDDqFZZXZgfjLK999A_JkCfRg1f" \
  -H "Content-Type: application/json" \
  -d '{"message":"Cos'\''è il VBT?"}'
```

Interpretazione: **200** = OpenAI live (key+credito OK). **401** = JWT non valido. **429** = quota/credito OpenAI esaurito. **500** = key mancante o errore runtime (vedi log §5).

### 3c. Script Node turnkey (nessuna dipendenza, Node 18+)

```js
// test-ai-200.mjs — esegui: SB_EMAIL=... SB_PASSWORD=... node test-ai-200.mjs
const BASE = "https://xgxtplqlewpqjzghvbke.supabase.co";
const ANON = "sb_publishable_Hr-lQDDqFZZXZgfjLK999A_JkCfRg1f";

const login = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: process.env.SB_EMAIL, password: process.env.SB_PASSWORD }),
});
if (!login.ok) {
  console.error("LOGIN FALLITO", login.status, await login.text());
  process.exit(1);
}
const { access_token } = await login.json();
console.log("JWT ottenuto ✔");

async function call(slug, body) {
  const res = await fetch(`${BASE}/functions/v1/${slug}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      apikey: ANON,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const tag = res.status === 200 ? "✅ 200" : `❌ ${res.status}`;
  const preview = (await res.text()).slice(0, 200);
  console.log(`${tag}  ${slug}  ${preview}`);
}

// CANARY read-only
await call("ask-copilot", { message: "Cos'è il VBT?" });
// Quasi-smoke (serve utente coach-risolvibile; risposta SSE → qui mostra solo lo status)
await call("chat-with-coach", { query: "Come gestisco il deload?" });

// --- DATA-DIPENDENTI: scommenta solo con fixture reali ---
// await call("generate-program", { athlete_id: "<UUID-REALE>", focus_goal: "Ipertrofia", days_per_week: 4, mode: "new" });
// await call("analyze-athlete-week", { athlete_id: "<UUID-REALE>" }); // SCRIVE athlete_ai_insights
// await call("analyze-meal-photo", { imageBase64: "<BASE64-REALE>", mimeType: "image/jpeg" });
// ⚠️ generate-batch-checkins: NON a vuoto — fa upsert + 1 chiamata AI per ogni atleta del roster.
```

---

## 4. Azioni dashboard che restano a Nick

**Bloccano il TEST 200 (canary):**

1. **`OPENAI_API_KEY` con credito** — Supabase Dashboard → progetto `xgxtplqlewpqjzghvbke` → **Edge Functions → Secrets** (Manage secrets): imposta `OPENAI_API_KEY = sk-...`. Verifica sul lato OpenAI: billing/credito attivo **e** che la key abiliti i model ID usati (`gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.2`). _Questo è IL blocco per il 200._
2. **Utente di test** per ottenere il JWT (email/password): signup nell'app oppure Dashboard → Authentication → Users → Add user. Per il canary basta un utente qualsiasi.

**Servono per il test completo / smoke (non per il solo canary):** 3. **`.env` frontend** (locale + host): `VITE_SUPABASE_URL=https://xgxtplqlewpqjzghvbke.supabase.co` + `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_Hr-lQDDqFZZXZgfjLK999A_JkCfRg1f`. Serve per login da UI e smoke delle feature. 4. **Google OAuth** (solo per il login Google): provider Google in Supabase → Auth + OAuth client in Google Cloud (redirect URIs). **Non** serve per il canary email/password. 5. **Fixture reali** per le 4 data-dipendenti: l'utente di test con `profiles.role='coach'` e almeno un atleta con `coach_id` = quell'utente (per `generate-program`/`analyze-athlete-week`), più un'immagine pasto (per `analyze-meal-photo`).

**Indipendente dal test AI:** 6. **`STRIPE_WEBHOOK_SECRET`** — riguarda `stripe-webhook`, non le funzioni AI. Da impostare quando si testano i pagamenti.

---

## 5. Cosa fa Cowork dopo il tuo "via" (post-test)

- `get_logs` service=edge-function subito dopo il canary → isolo per-funzione **200 / 401 / 429 / 500** e, sui non-200, estraggo il messaggio d'errore dal log.
- `get_advisors` security + performance refresh (solo report — D5).
- Se i log mostrano 500 da key/modello, te lo indico puntualmente (quale funzione, quale causa).

**Loop operativo:** tu imposti `OPENAI_API_KEY`+credito (§4.1) e crei l'utente di test (§4.2) → lanci il canary (§3b o §3c) → mi dai il "via" → io leggo i log e refertо 200 vs 500/429. In alternativa, se preferisci, incollami un `access_token` di test e guido io le invocazioni canary.

---

## 6. Esiti TEST 200 (2026-06-14, via Claude-in-Chrome)

Metodo effettivo: il connettore non ha un tool di invoke e la sandbox non raggiunge `*.supabase.co` → test eseguiti pilotando Chrome sull'origine del progetto (`fetch` relativi, no CORS). Utente: `test@test.com` (promosso a `coach`).

| Funzione                | Esito      | Note                                                                               |
| ----------------------- | ---------- | ---------------------------------------------------------------------------------- |
| ask-copilot             | ✅ 200     | RAG su KB vuota, `sources:[]`; valida gpt-5.4-mini + embeddings                    |
| analyze-meal-photo      | ✅ 200     | immagine sintetica (canvas) → JSON valido; valida vision + SDK senza baseURL       |
| chat-with-coach         | ✅ 200     | stream SSE reale, `model: gpt-5.4-mini-2026-03-17`                                 |
| generate-batch-checkins | ✅ 200     | `{message:"No athletes found",count:0}`; AI non esercitata (0 atleti)              |
| generate-program        | ⏳ da fare | serve `athlete_id` reale nel roster (gpt-5.2, unico modello non ancora esercitato) |
| analyze-athlete-week    | ⏳ da fare | serve `athlete_id` reale; scrive `athlete_ai_insights`                             |

**Conclusione:** chiave OpenAI + credito OK; validati i percorsi chat (stream e non), embeddings/RAG, vision/SDK e i gate coach. Restano 2 funzioni che richiedono un atleta reale → da validare nello smoke UI con un coach+atleta veri.

---

_D3 runbook · Cowork · 2026-06-14. 4/6 validate; aggiornare con generate-program + analyze-athlete-week dopo lo smoke UI._
