# ROADMAP — nc-performance-hub → production-grade

> **Stato:** RC6 · **Data:** 2026-06-12 · **Obiettivo:** portare l'app da "RC funzionante su Lovable Cloud" a **prodotto di qualità** che i coach usano per allenare clienti paganti e gli atleti usano per allenarsi.
> Piano a fasi sequenziate. Dettaglio della Fase 1 in [`DB_MIGRATION.md`](./DB_MIGRATION.md).

---

## 0. Cosa significa "production-grade" qui

Non è un progetto-vetrina: è software che gestisce **persone reali e dati di salute**. La barra di qualità (Definition of Done a livello prodotto):

- **Affidabile**: errori tracciati e gestiti, niente schermate bianche, sync allenamenti robusto anche offline.
- **Sicuro**: RLS e auth solide, secrets fuori dal repo, backup automatici — e ora **di tua proprietà**, non di Lovable.
- **Conforme**: dati di salute trattati secondo GDPR (consenso, export, cancellazione, retention).
- **Curato (UX/UI)**: design system coerente sui due temi (Aura coach / athlete), accessibile, zero stati "grezzi".
- **Manutenibile**: test + CI che bloccano i merge rotti; cambiare codice non fa paura.
- **Misurabile**: performance e qualità monitorate, non "a sensazione".

---

## 1. Stato attuale (sintesi ricognizione 2026-06-12)

| Area            | Oggi                                                                                 | Gap verso "prodotto"                                                           |
| --------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Backend/host    | Lovable Cloud (Supabase gestito)                                                     | Migrare al **tuo** Supabase (Fase 1)                                           |
| Codice          | 213 file `.ts/.tsx`, TS strict, Vite 5, TanStack Query, Zustand — solido             | OK, base sana                                                                  |
| Design system   | Doc athlete dettagliato (`UX_UI_DESIGN_SYSTEM.md` v1.0), tema Aura coach, dual-theme | Manca doc Aura pari livello, QA UI sistematico, accessibilità                  |
| Test            | **1 E2E** (`core-auth.spec.ts`), **0 unit/component**, nessun vitest                 | Gap critico: rete di sicurezza assente                                         |
| CI/CD           | **Assente** (solo Husky pre-commit + lint-staged)                                    | GitHub Actions con build gate + test bloccanti                                 |
| Monitoring      | **Non cablato** (`logger.ts` predisposto per Sentry, TODO)                           | Error tracking + alerting in prod                                              |
| Security/backup | **Di Lovable** (Security Agent + backup gestiti)                                     | Diventano **tuoi** — ownership + automazione                                   |
| Privacy/GDPR    | Base presente: consenso onboarding (`LegalStep`), `PrivacyPolicy` page, footer       | Mancano export/cancellazione account, retention, DPA, sub-processor aggiornati |
| PWA/offline     | **Rimossa** per bug login (412) — vedi `vite.config.ts`                              | Decisione aperta: ripensare per uso in palestra                                |

---

## 2. Chi fa cosa (modello di lavoro)

| Simbolo | Strumento                 | Ruolo                                                                                                                       |
| ------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 🤖      | **Cowork** (qui)          | Pianificazione, infra via connettore Supabase, audit, design/UX, ricerca, documentazione, scaffold                          |
| 💻      | **Claude Code (Fable 5)** | Implementazione in worktree seguendo `CLAUDE.md`: codice, refactor, test, build gate                                        |
| 👤      | **Tu**                    | Credenziali/chiavi, merge via GitHub Desktop, azioni dashboard (Supabase/Stripe/hosting), decisioni estetiche e di business |

Regola d'oro: un solo "scrittore" alla volta su repo e DB. Stato condiviso = coordinamento esplicito.

---

## 3. Le fasi

### Fase 1 — Fondazione: backend di proprietà 🟥 _sblocca tutto_

**Obiettivo:** uscire da Lovable Cloud, l'app gira sul tuo Supabase, fuori dal sistema a crediti.
**Task** (dettaglio in `DB_MIGRATION.md`): creare progetto + applicare schema via connettore · deploy 15 edge functions + secrets · codice: OAuth Google nativo + rimozione `@lovable.dev/cloud-auth-js` e `lovable-tagger` · env al nuovo progetto · rigenerare `types.ts` · build gate · scollegare Lovable.
**Owner:** 🤖 infra (connettore) · 💻 codice · 👤 credenziali + 2 click dashboard Lovable.
**Done quando:** login email+Google ok sul tuo Supabase, `tsc` verde, Lovable Cloud scollegato.
**Dipendenze:** nessuna. **Va per prima.**

### Fase 2 — Security & backup ownership 🟥

**Obiettivo:** ciò che era di Lovable diventa tuo, ben fatto.
**Task:** audit RLS completo (53 tabelle) · re-verify auth edge/ownership · backup automatici DB (PITR/scheduled nel dashboard) · secrets management · risolvere advisor Supabase critici · aggiornare `CLAUDE.md` legge #11 (security ora tua — diff in `DB_MIGRATION.md` App.A).
**Perché ora:** DB fresco e **zero utenti reali** = momento ideale per hardening prima dei clienti.
**Owner:** 💻 RLS/edge (worktree) · 👤 abilita backup nel dashboard · 🤖 audit + checklist.
**Done:** RLS verificata su tutte le tabelle, backup attivi, 0 advisor critici, secrets non nel repo.
**Dipendenze:** Fase 1.

### Fase 3 — Rete di sicurezza: test + CI 🟧

**Obiettivo:** rendere ogni cambiamento sicuro prima di costruire altro.
**Task:** aggiungere **vitest + @testing-library** (unit su `lib/`, `hooks/`, `utils/`; component sui flussi chiave) · ampliare **Playwright E2E** sui percorsi critici (auth, onboarding, assegna programma, log workout, checkout Stripe) · **GitHub Actions**: `tsc --noEmit` + `eslint` + test **bloccanti** su PR · script npm mancanti (`typecheck`, `test`, `gen:types`).
**Owner:** 💻 test + workflow · 🤖 strategia test + scaffold CI.
**Done:** CI obbligatoria e verde al merge; flussi critici coperti E2E; unit sui moduli core.
**Dipendenze:** Fase 1 (env stabile).

### Fase 4 — Observability & resilienza 🟧

**Obiettivo:** sapere cosa si rompe in produzione, subito.
**Task:** integrare **Sentry** FE (il `logger.ts` ha già il punto d'innesto unico) + edge functions · source maps · alerting · review error boundaries · health check.
**Owner:** 💻 integrazione · 👤 account Sentry · 🤖 piano + soglie alert.
**Done:** errori in prod tracciati con alert e stack leggibili; nessun errore silenzioso.
**Dipendenze:** Fase 1.

### Fase 5 — UX/UI di eccellenza 🟧 _la tua priorità — avviabile in parallelo dalla Fase 1_

**Obiettivo:** interfaccia da prodotto premium, coerente e accessibile.
**Task:** portare il design system **Aura (coach)** allo stesso livello del doc athlete · libreria componenti coerente · **audit UI per ruolo** (coach web responsive / athlete mobile-first) · **accessibilità WCAG 2.1 AA** sui flussi chiave · sistematizzare stati **loading/empty/error** · motion coerente (Framer Motion) · **visual regression** (screenshot Playwright) in CI.
**Owner:** 🤖 audit UI + design system docs + mockup + ricerca pattern · 💻 implementazione componenti · 👤 direzione estetica.
**Done:** design system documentato per entrambi i temi; a11y AA sui flussi chiave; zero stati grezzi; visual regression in CI.
**Dipendenze:** la parte audit/design parte **subito**; la visual regression in CI richiede Fase 3.

### Fase 6 — Athlete PWA & offline 🟨

**Obiettivo:** l'atleta usa l'app in palestra, anche senza rete.
**Task:** ripensare il **service worker** (rimosso per il bug 412) con criterio · offline-first per il log allenamenti (coda IndexedDB; TanStack persist già nello stack) · **Wake Lock** durante le sessioni · install prompt.
**Owner:** 💻 implementazione · 🤖 piano architetturale SW (evitare la regressione login).
**Done:** sessione in palestra usabile offline, sync al ritorno online, login mai bloccato.
**Dipendenze:** Fase 2 (auth stabile) + Fase 3 (test del flusso offline).

### Fase 7 — Privacy & compliance 🟥 _prima del primo cliente reale_

**Obiettivo:** trattare dati di salute a norma.
**Task:** **export dati** account · **cancellazione account** (right to be forgotten) · **data retention** policy · cookie/consent banner se introduci analytics · **DPA** con Supabase/Stripe/OpenAI/Resend · aggiornare `PrivacyPolicy` con i nuovi sub-processor.
**Perché ora:** stai per onboardare persone reali con dati sensibili.
**Owner:** 🤖 checklist GDPR + testi/policy · 💻 funzioni export/delete · 👤 firma DPA.
**Done:** l'utente può esportare e cancellare i propri dati; retention definita; policy aggiornata; DPA archiviati.
**Dipendenze:** Fase 1; da chiudere **prima** del go-live.

### Fase 8 — Performance 🟨

**Obiettivo:** veloce su mobile e in palestra (3G).
**Task:** performance budget · code-splitting/lazy (già usato in `App.tsx`) esteso · ottimizzazione query (no `select *`) · indici DB sulle query calde · Lighthouse mobile · bundle analysis.
**Owner:** 💻 ottimizzazioni · 🤖 audit + budget.
**Done:** Lighthouse mobile ≥ target concordato; query critiche indicizzate; bundle sotto budget.
**Dipendenze:** Fase 1.

### Fase 9 — Go-live 🟥

**Obiettivo:** in produzione, su dominio tuo, monitorata.
**Task:** hosting frontend (Vercel/Netlify/Cloudflare) · dominio · env **prod/staging separati** · Stripe **live mode** + webhook prod · runbook di lancio · monitoraggio post-lancio · beta con pochi atleti reali.
**Owner:** 👤 hosting/dominio/Stripe live · 🤖 runbook · 💻 config build prod.
**Done:** app in produzione, pagamenti live, errori e metriche monitorati.
**Dipendenze:** 1–4 e 7 almeno.

---

## 4. Vista d'insieme

| Fase | Tema                 | Priorità   | Effort | Owner principale | Dipende da                  |
| ---- | -------------------- | ---------- | ------ | ---------------- | --------------------------- |
| 1    | Backend di proprietà | 🟥 Critica | M      | 🤖 + 💻 + 👤     | —                           |
| 2    | Security & backup    | 🟥 Critica | M      | 💻 + 👤          | 1                           |
| 3    | Test + CI            | 🟧 Alta    | L      | 💻               | 1                           |
| 4    | Observability        | 🟧 Alta    | S      | 💻 + 👤          | 1                           |
| 5    | UX/UI eccellenza     | 🟧 Alta    | L      | 🤖 + 💻          | 1 (audit) / 3 (visual reg.) |
| 6    | PWA & offline        | 🟨 Media   | M      | 💻               | 2, 3                        |
| 7    | Privacy & GDPR       | 🟥 Critica | M      | 🤖 + 💻 + 👤     | 1 (pre go-live)             |
| 8    | Performance          | 🟨 Media   | S–M    | 💻               | 1                           |
| 9    | Go-live              | 🟥 Critica | M      | 👤 + 🤖          | 1–4, 7                      |

_Effort: S=piccolo, M=medio, L=grande._

---

## 5. Sequenza consigliata

```
Fase 1 (fondazione)
   ├─► Fase 2 (security/backup)
   ├─► Fase 3 (test + CI) ──► Fase 6 (PWA/offline)
   ├─► Fase 4 (observability)
   ├─► Fase 5 (UX/UI)  ← audit/design parte subito, CI-visual dopo Fase 3
   ├─► Fase 7 (privacy)  ← chiudere prima del go-live
   └─► Fase 8 (performance)
                      └─────────────► Fase 9 (go-live)
```

Le Fasi 4, 5 e 8 possono procedere **in parallelo** dopo la Fase 1, perché toccano aree diverse. Le Fasi 2, 3 e 7 sono i cancelli "critici" prima di aprire ai clienti.

---

## 6. Quick win immediati (basso costo, alto valore)

- Aggiungere script npm: `typecheck` (`tsc --noEmit -p tsconfig.app.json`), `test`, `gen:types`.
- Scaffold GitHub Actions con il build gate già esistente (anche prima dei test).
- Cablare Sentry nel punto già predisposto in `logger.ts`.

## 7. Prossimo passo

Riprendere la **Fase 1** con il connettore Supabase già collegato: creo/scelgo il progetto → applico lo schema (125 migrazioni) → poi codice + env + types. Tutto il resto della roadmap poggia su questa.
