**Task:** costruire il modulo **intake/onboarding** dell'Hub: un questionario config-driven per `coaching_mode` (Coached/Autonoma) che scrive sul profilo dell'atleta AUTENTICATO (mai submission anonime), consolida l'invito nativo Supabase, registra i consensi in `consents`, mappa gli infortuni in `injuries`, e ritira `nc-questionnaire`. **Additivo sullo schema** (nessun DROP di tabelle esistenti dell'Hub; le nuove colonne/enum sono nullable/additive). Backbone dati+sicurezza+invito+submit in Fase 1; il rendering config-driven del form in Fase 2.
**Data:** 2026-07-13
**Strumento di destinazione:** [x] Claude Code
**Branch previsto:** claude/intake-redesign

Lavori sul repo NC Performance Hub (frontend Vite SPA; edge functions = Deno; migrazioni Supabase in supabase/migrations/). Piccoli passi: proponi un PIANO (ordine migrazioni, naming esatto, come testi ogni pezzo) e ti FERMI per il mio OK PRIMA di scrivere codice/DDL. Mantieni INVARIATO tutto l'esistente: questa fetta è additiva.

## VERITÀ DI RIFERIMENTO (leggi PRIMA di toccare codice)

- Schema REALE Hub (verificato live 2026-07-13, NON a memoria): `profiles` (colonne in §1), enum `coaching_mode{coached,autonomous}`/`tier{premium,monthly}`/`consent_type`(7 valori)/`entitlement_feature`; tabelle `consents`(append-only)/`tier_entitlements`(10 righe)/`audit_log`/`injuries`(status CHECK in_rehab|recovered|chronic)/`athlete_cycle_settings`/`daily_readiness`/`coach_alerts`; helper `is_coach_of_athlete(athlete_id)`; trigger `handle_new_user`.
- `supabase/functions/invite-athlete/index.ts` — l'edge fn d'invito (Part A): NON rompere il contratto; estendere per passare `coaching_mode`/`tier` in user_metadata.
- `src/.../OnboardingWizard.tsx` + `analyzeOnboarding` — l'impianto esistente (save/resume, StepIndicator, coach_alerts, calcolo red-flag/neurotipo): RIUSARE, non ricostruire.
- `repos/nc-questionnaire/docs/intake-contract.md` (B0–B8 + PARTE C) — la FONTE del contenuto (domande/enum/scoring). NON portare lo schema `submissions`; portare le domande e la logica di sicurezza.
- `zoneMap.ts` (`ZONE_MAP` chiavi = zone canoniche) — la lista del selettore regione-corpo. NON toccare la zoneMap.
- Contratti da NON rompere: `generate-program/*`, `zoneMap.ts`, `stripe-webhook/*`, `program_blocks`/albero-programmi, `daily_readiness`, `profiles.subscription_tier` (legacy).

## OBIETTIVO

Dopo la fetta: un cliente invitato da Nick (con `coaching_mode`/`tier` già settati) fa login, compila UN questionario che si adatta alla modalità, e al submit: il suo `profiles` è popolato (anagrafica in onboarding_data + colonne tipizzate), i consensi sono righe in `consents`, gli infortuni noti sono righe in `injuries` (zone canoniche + stato), i segnali di sicurezza sono catturati e — se scattano — generano `coach_alerts` + instradamento FUORI, `onboarding_completed=true`, una riga in `audit_log`. Nessuna submission anonima; `nc-questionnaire` ritirato.

## ARCHITETTURA (dove va la logica)

- **Modulo PURO (niente rete/Date/Math.random), testabile:** (a) il calcolo **semaforo idoneità** (PAR-Q+ · pain_now · dolore-gesto · campanelli → 🔴🟡🟢) — deterministico sui campi strutturati; (b) lo **screening DCA** (2–3 item SCOFF → flag) — soglia deterministica, mai diagnosi; (c) il **routing-out** (DCA/gravidanza/patologia/minore → esito instrada-fuori); (d) la **normalizzazione `main_goal`→`objective`/arena** (seed via `regola-obiettivo-arena`); (e) lo **scoring neurotipo** 30-Q (oggi `scoring-neurotipo.py` coach-side → portato server-side, deterministico).
- **Modulo I/O (edge function / RPC `submit_intake`):** valida il payload al confine (schema_version), scrive in transazione su `profiles`/`consents`/`injuries`/`athlete_cycle_settings`, genera `coach_alerts` + `audit_log`. Errori **sanitizzati** (mai loggare dati salute nel messaggio d'errore — lezione nc-questionnaire 0004, art. 9).
- Perché così: la logica-sicurezza si verifica con fixture, senza rete; la scrittura è un solo confine con RLS.

## A) MODELLO «una forma, due profili» (config-driven su coaching_mode)

Un CORE condiviso (identità + sicurezza + baseline) + uno strato-modalità sottile. `coaching_mode` è già sul profilo (settato all'invito) → il form lo legge dalla 1ª schermata e rende il profilo:

- **Coached** → tiene la ricchezza a **testo libero** (la legge il coach); i campi strutturati Autonoma sono opzionali/nascosti.
- **Autonoma** → accende i **campi strutturati** che il motore consuma (objective, attrezzatura, righelli, segnali-sicurezza espliciti, scoring automatico) e usa gate **automatici + più conservativi** (nel dubbio → escala a Nick, mai proseguire in silenzio).
  La condizionalità è la stessa già usata per la Nutrizione (mostrata su consenso), qui su `coaching_mode`. **Fase 2 (UI):** il rendering config-driven (show/hide per modalità, save/resume, mobile-first) — Code lo pianifica dopo il backbone.

## B) MAPPA CAMPI → Hub (il contratto — la matrice diventa legge)

Classe: 🟦 CORE (identico, entrambe) · 🟩 Coached-rich (testo libero) · 🟧 Autonoma-strutturato · ➕ nuovo.

| Campo (fonte)                                                                                        | Classe | Destinazione Hub                                                                                                 | Regola                                      |
| ---------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| full_name                                                                                            | 🟦     | `profiles.full_name`                                                                                             | —                                           |
| email                                                                                                | 🟦     | `auth.users` (identità)                                                                                          | dall'invito                                 |
| CF, indirizzo                                                                                        | 🟦     | `profiles.tax_code`, `profiles.address`                                                                          | presenti                                    |
| sex, birth_date, phone, pronoun, height_cm, weight_kg                                                | 🟦     | `profiles.onboarding_data.intake` (jsonb)                                                                        | **non tipizzati**; `birth_date`→gate-minori |
| consensi ×6 + versione                                                                               | 🟦     | **righe `consents`** (append-only)                                                                               | §D                                          |
| PAR-Q+ ×7, pain_now, safety_allergy                                                                  | 🟦     | `onboarding_data.intake` + calcolo semaforo                                                                      | §0; strutturati                             |
| conditions_meds                                                                                      | 🟧➕   | `onboarding_data.intake` (forzato sì/no+dettaglio)                                                               | vuoto ≠ nessun farmaco                      |
| past_injuries, pain_where                                                                            | 🟦→🟧  | **righe `injuries`** (zona canonica + stato + note)                                                              | §F (Delta 2)                                |
| pregnancy, cycle_status                                                                              | 🟦     | `athlete_cycle_settings` (+§Gap)                                                                                 | §0 popolazione speciale                     |
| enum stile-vita/allenamento (stress, sonno, neat, esperienza, workload, recupero, giorni, work_mode) | 🟦     | `experience_level`(col) + resto `onboarding_data.intake`                                                         | enum = parametro                            |
| **objective/arena**                                                                                  | 🟨🟧➕ | **`profiles.objective`** (enum nuovo, §3e)                                                                       | Autonoma: obbligatorio                      |
| **attrezzatura strutturata**                                                                         | 🟧➕   | `onboarding_data.intake.equipment` (lista)                                                                       | Autonoma: obbligatoria                      |
| **righelli prontezza** (importanza/fiducia 0-10)                                                     | 🟧➕   | `onboarding_data.intake.readiness`                                                                               | segnale aderenza                            |
| **screening DCA**                                                                                    | 🟦➕   | `onboarding_data.intake.dca` + flag                                                                              | §E; entrambe; mai diagnosi                  |
| motivazione (why_now, ostacoli, successo, past_coaching)                                             | 🟩     | `onboarding_data.intake` (testo)                                                                                 | contesto coach; F7 a valle                  |
| storia sport/pesi, recent_maxes                                                                      | 🟩     | `onboarding_data.intake` (+ `one_rm_data` se numerico)                                                           | contesto                                    |
| nutrizione (se consenso)                                                                             | 🟩     | `onboarding_data.intake.nutrition`                                                                               | consent-gated                               |
| neurotipo 30-Q                                                                                       | 🟧     | scoring→`profiles.neurotype`; grezzo→`onboarding_data.intake.neurotype`                                          | §J; seed con confidenza                     |
| red-flag / clearance / zone-escluse / calibrazione                                                   | 🟦     | `medical_clearance_required`, `fms_exclusion_zones`, `calibration_requirements`, `red_flags` (colonne esistenti) | calcolati al submit                         |
| FMS                                                                                                  | —      | NON dal questionario (coach → `fms_assessments`)                                                                 | resta gated                                 |

## C) INVITO & IDENTITÀ (consolidamento — Part A di integrazione-2026-07-05)

- Invito = **nativo Supabase** (`generateLink type:invite`) + email dal dominio verificato `mail.nctrainingsystems.com`. Ritira il flusso `invite_tokens` manuale (resta al più «copia link» di ripiego).
- **Estendi `invite-athlete`**: oltre a `coach_id`, passa **`coaching_mode` e `tier`** in `user_metadata`; il trigger `handle_new_user` li scrive su `profiles` alla creazione — **il trigger va ESTESO: oggi collega solo `coach_id`** (verificare live la sua definizione prima). Così la modalità è nota dalla 1ª schermata e legata al record.
- Consenso salute (art. 9) legato a **identità vera** (post-login), non a submission anonima.
- **Accettazione:** coach invita (nome+email+modalità+tier) → email dal dominio verificato → atleta imposta password → primo accesso → gate `onboarding_completed=false` → questionario della modalità giusta.

## D) CONSENSI → registro `consents` (append-only)

Un **rigo per consenso** (mai booleani su una tabella-stato). Mappa: `consent_health`→`health_required` · `consent_disclaimer`→`non_medical_disclaimer` · `consent_nutrition`→`nutrition_advice` · `consent_photos`→`photos_measurements` · `consent_share_medical`→`medical_sharing` · `consent_marketing`→`marketing` · (+ `ai_processing` quando una feature IA si espone — CORE §6, oggi parcheggiata). Ogni riga: `granted` + `version` (versione testo consensi) + `source='intake'`. **Cancello:** senza `health_required=true` + `non_medical_disclaimer=true` l'intake non prosegue. Marketing **mai** in pacchetto con la salute. Stato «attuale» = riga più recente per `(athlete_id, consent_type)`. **Mai UPDATE/DELETE.**

## E) SICUREZZA STRUTTURATA (i segnali che in Autonoma nessun coach legge)

- **Dolore-gesto:** domanda esplicita «dolore ricorrente legato a un movimento?» (+ quale). Sì → semaforo **🟡** su quel pattern (co-gestione), anche con PAR-Q tutti-no. NON crea `injuries` da solo.
- **Calo-peso involontario:** flag esplicito «calo di peso non voluto negli ultimi mesi?» → campanello → rinvio/valutazione medica **prima** del carico (specie >65). NON è un dato per un deficit.
- **conditions_meds forzato:** risposta obbligatoria (sì/no + dettaglio); il vuoto non è un dato.
- **Screening DCA (entrambe le modalità):** 2–3 item stile **SCOFF** → soglia deterministica → **flag** → **instrada FUORI** (professionista) + `coach_alert`. **Mai** una diagnosi, mai un punteggio clinico esposto. Vive nel CORE-sicurezza (single-source).
- **Gate minori:** `birth_date` (da onboarding_data) < 18 → instrada FUORI (non servito in autonomia). La logica è nuova lato-Hub (il dato c'è).
- **Patologie note:** PAR-Q+ positivo / `conditions_meds` che indica patologia → `medical_clearance_required=true` + co-gestione (rinvio professionista); nessun carico prima della clearance (§0).
- **Popolazioni speciali:** `pregnancy`=sì → instrada FUORI (lato clinico) + coaching in-scope se pertinente; `cycle_status` perimenopausa/menopausa-sintomatica/amenorrea → rinvio ginecologo/endocrinologo + coaching female-lifecycle in-scope (§0).
- Tutti i segnali che scattano → **`coach_alerts`** (Autonoma: la rete-di-sicurezza è Nick) + riga `audit_log`. In Autonoma: nel dubbio **escala**, non prosegue.

## F) INFORTUNI STRUTTURATI (Delta 2 — zoneMap v18)

- **Selettore regione-corpo** = **zone canoniche** di `ZONE_MAP` (14 zone; single-source zoneMap; entrambe le modalità). Per ogni zona scelta: **stato** ∈ `{in_rehab, recovered, chronic}` (CHECK esistente) + `injury_date` (opz.) + **nota libera** (`injuries.notes`/`description`) per il coach.
- **Regola-cardine:** **dolore ATTUALE = STOP/rinvio, NON auto-`in_rehab`** (§0). L'infortunio _noto da proteggere_ (passato/cronico/in rehab) → riga `injuries`; il dolore _attuale_ → semaforo + escalation, non una riga auto-etichettata.
- Nota: il gate legge `injuries` con `status ∈ {in_rehab, chronic}` (`recovered` non arriva al gate — voluto). Scrivere `recovered` è sicuro (storia, non esclusione).

## G) OBJECTIVE / ARENA (Autonoma obbligatorio)

`main_goal` (testo libero) oggi lo mappa Nick a mano a un enum-arena (`regola-obiettivo-arena`). In Autonoma nessuno fa il ponte → **selettore strutturato obbligatorio** → **`profiles.objective`** (enum NUOVO, §3e). Coached: tiene anche la narrativa (`onboarding_data`). Valori enum = **da `regola-obiettivo-arena.md`** (Cowork li estrae; placeholder in §3e).

## J) NEUROTIPO (scoring server-side)

Le 30 risposte (A–E) restano; lo **scoring** (oggi `scoring-neurotipo.py` che lancia Nick) va **automatizzato server-side** (funzione pura deterministica) → `profiles.neurotype` + grezzo in `onboarding_data`. **Validare la funzione contro l'output dello script attuale su casi noti (regressione).** Resta **seed con confidenza** (~8/10 = indizio), **down-pesato** su fragili/clinici (regola C3): non scavalca il dato misurato né i semafori.

## OUTPUT / CONTRATTO

- **`submit_intake` (RPC `SECURITY DEFINER`, chiamabile solo dall'atleta autenticato per il PROPRIO profilo — check `athlete_id = auth.uid()`):** input = payload validato (`{schema_version, intake:{...}, consents:[...], injuries:[...], cycle:{...}}`); effetto = scritture §B in transazione (all-or-nothing) + calcolo **semaforo/red-flag**: se 🔴/red-flag → imposta `medical_clearance_required=true` + `red_flags` (così il **gate del motore blocca a valle**) + `onboarding_completed=true` + `coach_alerts` sui segnali + `audit_log`. Ritorno = `{ ok, gate?:{level, routedOut?, reason} }` — un gate bloccante ritorna **risposta bloccante esplicita**, MAI un successo silenzioso.
- **Verifica-live prima del build:** che le RLS di `injuries`/`athlete_cycle_settings` permettano la scrittura owner **oppure** che tutte le scritture passino dalla RPC `SECURITY DEFINER` (via service-role interno) con il check di ownership — non lasciare un buco di scrittura né un submit che fallisce per RLS.
- Stringhe-utente in **italiano**; valori-macchina (enum) in **inglese** (coerenza F0 §3).
- Additivo: nessun contratto esistente cambia forma.

## INVARIANTI DA NON ROMPERE

1. **Additivo:** nessun DROP/rename di tabelle/colonne esistenti; nuove colonne/enum nullable. `profiles.subscription_tier` resta legacy (non toccare).
2. Il gate di sicurezza si **ESTENDE**, non si indebolisce; hard-stop deterministici sui campi strutturati, IA solo-alza-cautela.
3. `consents` e `audit_log` **append-only**: mai UPDATE/DELETE.
4. RLS **deny-by-default**: l'atleta scrive/legge solo le proprie righe (`athlete_id/id = auth.uid()`); coach via `is_coach_of_athlete`. Submit via utente **autenticato** (mai anon).
5. Errori **sanitizzati** (nessun dato salute nei messaggi d'errore — art. 9).
6. Parametri-metodo = DATO: l'enum `objective` e la lista zone vengono da fonte (`regola-obiettivo-arena`, `zoneMap`), non hard-coded arbitrari.
7. FMS resta FUORI dal questionario (coach → `fms_assessments`).
8. Determinismo nei moduli puri (semaforo/DCA/scoring): due run stesso input → output identico.
9. **Nessuna chiamata LLM sui dati salute all'intake:** semaforo/DCA/objective/neurotipo sono deterministici. Se un domani si parsa testo-libero con IA → **pseudonimizzare prima** (CORE §6) e solo-alza-cautela, mai decidere idoneità.

## FILE

- **NUOVI:** `supabase/migrations/<ts>_intake_redesign.sql` (enum `objective` + `profiles.objective` + `athlete_cycle_settings.pregnancy`/`cycle_status` §Gap, additivi) · moduli puri `src/lib/intake/{semaforo,dca,objective,neurotype}.ts` + test · edge fn/RPC `submit_intake` (Hub) · `docs/prompts/2026-07-13-intake-redesign.md`.
- **MODIFICATI:** `invite-athlete/index.ts` (coaching_mode/tier in user_metadata) · `InviteAthleteDialog.tsx` (chiama l'edge fn) · `OnboardingWizard.tsx`/`analyzeOnboarding` (set 30-Q + nuovi campi + modalità) · `src/integrations/supabase/types.ts` (rigenera dopo migrazione) · doc Hub (`CLAUDE.md`/methodology) se citano l'onboarding.
- **VIETATI:** `generate-program/*` · `zoneMap.ts` · `stripe-webhook/*` · `program_blocks`/albero · `daily_readiness` · `profiles.subscription_tier` · le FK-hardening (fetta a parte). Niente «già che ci sono».

## COME LAVORI

- Prima il PIANO (naming enum/colonne, forma payload `submit_intake`, come testi ogni modulo puro, Fase 1 backbone vs Fase 2 UI) → STOP per il mio OK → poi esegui: commit atomici.
- **Review indipendente a fine fetta (FISSO):** lancia `supabase-rls-auditor` sulle nuove policy (deny-by-default · append-only su consents/audit · submit autenticato). Riporta l'esito nel commit/RETRO.
- Commit in italiano + `Co-Authored-By: Claude <noreply@anthropic.com>`. Merge/push = Nick da GitHub Desktop.

---

## ADDENDUM ESECUZIONE (Claude Code, 2026-07-13) — deviazioni/decisioni approvate all'OK

- **OK di Nick con correzioni (2026-07-13):** A = edge fn `submit-intake` + RPC privata service-role · B = 🟡 alert-high e procede, dolore-gesto **cattura la zona canonica** (senza zona in Autonoma → HOLD per Nick), cycle_status 🟡 alert-only · C = minori: reject **senza persistenza** dati salute · D = moduli puri in `supabase/functions/submit-intake/intake/` (non `src/lib/intake/`) · E = `consent_version='hub-v1'` (bump col testo legale G9); apply migrazioni = Cowork via connettore, Code committa i file-gemelli.
- **Correzione conditions_meds:** split `condition` (patologia diagnosticata → 🔴 hold + `coach_alert`, escalation a Nick, NO referral automatico) vs `medications` (farmaci/integratori → nota, mai gate).
- **Zone canoniche = 15**, non 14 (zoneMap v18 ha splittato dorsale/toracica); parità garantita da test via `resolveZone`.
- **`fms_exclusion_zones` NON scritta dall'intake** (deviazione dalla matrice §B, coerente con invariante 7: FMS = strumento coach; gli infortuni noti passano da `injuries`).
- **`calibration_requirements` NON scritta in Fase 1**: il motore non la consuma (zero occorrenze in `supabase/functions/`); derivarla da `objective` = Fase 2 se serve.
- **`red_flags` resta canonica a 4 chiavi** (forma consumata dal gate del motore); i codici rossi entrano in `medical_yes_questions`, i segnali gialli in `onboarding_data.intake.safety`.
- **experience_level:** `novizio`→`principiante`, `master`→`avanzato` alla scrittura colonna (EXPERIENCE_MAP del motore non li copre; motore VIETATO); valore grezzo conservato nel jsonb.
- **DEBITO GO-LIVE (Fase 2, prima di clienti reali):** estendere `prevent_profile_privilege_escalation` a `coaching_mode`/`tier`/`medical_clearance_required`/`red_flags` — oggi un atleta può riscriverli via UPDATE own-row; l'hardening va sequenziato DOPO il rewire del wizard su `submit_intake` (il wizard attuale scrive quelle colonne client-side).
