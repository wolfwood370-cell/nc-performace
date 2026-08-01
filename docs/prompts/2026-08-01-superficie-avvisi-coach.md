# 2026-08-01 — La superficie degli avvisi: far arrivare al coach quello che il sistema gli scrive

> Prompt-file della fetta. Spec di origine: `app/spec-superficie-avvisi-coach-2026-08-01.md`.
> Nasce dal censimento `docs/CENSIMENTO-AVVISI-COACH.md` (12 `type` scritti in `coach_alerts`, zero superfici che ne mostrano il testo).

---

**Task:** far vedere al coach il TESTO degli avvisi che il sistema gli scrive già in `coach_alerts`, e ritirare il triage morto di `useCoachData.tsx`.
**Data:** 2026-08-01
**Strumento di destinazione:** ☑ Claude Code
**Branch previsto:** `claude/superficie-avvisi-coach`

## 1. Obiettivo (perché)

Il coach apre l'applicazione e **legge** gli avvisi che lo riguardano: tipo, gravità, testo, atleta, quando — e può segnarli letti. È l'ultimo miglio del canale di escalation del CORE §0 (watchdog RPE, semaforo intake, gate del rilascio autonomo, sicurezza nutrizionale): oggi quella catena termina in un contatore sul badge, e il badge apre una pagina alimentata da tutt'altra fonte.

Nessun segnale nuovo: si mostra ciò che è già scritto.

## 2. Contratto (il patto verificabile)

- **Input:** `coach_alerts` via `src/hooks/useCoachAlerts.ts` (esportato `:25`, join sul profilo atleta `:38`, realtime INSERT `:53-99`, mutazioni `dismissAlert :108` e `markAsRead :121`, `unreadCount :134`). Nessuna query nuova.
- **Output atteso:**
  - `src/components/coach/CoachAlertsPanel.tsx` — lista presentazionale (tipo · gravità · **testo** · nome atleta · data relativa), ordinata non-letti → gravità → data, con «Segna come letto» e «Vedi atleta».
  - `src/lib/coachAlerts.ts` — regola d'ordinamento pura, coperta da vitest.
  - Il pannello montato su `CoachHome`; il badge della sidebar spostato da _Inbox_ a _Dashboard_ e agganciato a `unreadCount`.
  - `src/hooks/useCoachData.tsx` ridotto al solo `useCoachAthletes`.
- **Invarianti da non rompere:**
  1. Nessun segnale nuovo.
  2. Il testo di un avviso è dato sanitario (art. 9): mai in un URL, mai in un log, mai in analytics.
  3. «Letto» non è «risolto»: `markAsRead` lascia la riga al suo posto.
  4. Se questa interfaccia si rompe, gli avvisi restano scritti: la UI non è mai l'unica copia.
  5. Zero modifiche sotto `supabase/**`. Nessuna migration.
  6. Il conteggio eslint non sale rispetto a `.eslint-baseline`. La superficie si usa da tastiera.
  7. Stringhe utente in italiano.
  8. RLS invariata: la lista legge con i permessi del coach.

## 3. File

- **Da toccare:** `src/lib/coachAlerts.ts` (nuovo) · `src/lib/__tests__/coachAlerts.test.ts` (nuovo) · `src/components/coach/CoachAlertsPanel.tsx` (nuovo) · `src/utils/translations.ts` · `src/pages/coach/CoachHome.tsx` · `src/components/coach/CoachSidebar.tsx` · `src/hooks/useCoachAlerts.ts` (una riga, v. §7) · `src/hooks/useCoachData.tsx` (ritiro) · `src/components/coach/athlete/HealthProfileTab.tsx` (commit separato).
- **VIETATI:** tutto `supabase/**` · `.eslint-baseline` · `.github/**`.
- **Scope guard:** niente «già che ci sono». Fuori-scope → chip, non codice.

## 4. Acceptance (criteri falsificabili)

- ☐ **Ultimo miglio (guardia C9):** la persona è **il coach**; il gesto è **aprire `/coach` e leggere il testo dell'avviso col nome dell'atleta**, senza cambiare pagina.
- ☐ **Criterio principale, su dato vero:** l'avviso `nutrition_safety` del 2026-08-01 08:20:49 («Nicolò Castello: segnale di dolore nell'ultimo check-in…») compare nella lista **col suo testo**.
- ☐ «Segna come letto» funziona e il contatore del badge **scende**.
- ☐ Il numero sul badge e la pagina che apre si riferiscono alla stessa cosa.
- ☐ `useCoachDashboardData` e `useCoachData` non esistono più; `useCoachAthletes` intatto e `CoachAnalytics` funzionante.
- ☐ `npx tsc --noEmit -p tsconfig.app.json` verde · `npx vitest run` verde · eslint ≤ `.eslint-baseline`.
- ☐ La lista si usa senza mouse.
- ☐ `git diff --name-only main..HEAD`: zero file sotto `supabase/`.

## 5. Verifica (come si controlla, non a memoria)

- **Build-gate:** `npx tsc --noEmit -p tsconfig.app.json`
- **Unit:** `npx vitest run` (l'ordinamento della lista è coperto in `src/lib/__tests__/coachAlerts.test.ts`)
- **Lint:** conteggio errori eslint **escludendo `.claude/worktrees/**`\*\* — la CI non li vede, in locale gonfiano il totale
- **Diff reale:** `git diff --name-only main..HEAD`
- **Browser:** Nick apre `/coach` come coach e dice se legge il testo dell'avviso. È la prova che conta: non «la query torna una riga», ma una persona che legge una frase.
- **DB:** conteggio dei non-letti prima/dopo — lo fa Nick/Cowork, non Code.

## 6. Decisioni prese nel PIANO (approvate da Nick il 2026-08-01)

| #   | Decisione                                                          | Perché                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | La lista vive su **CoachHome**, non su una rotta dedicata          | `CoachBottomNav.tsx:8-13` ha 4 voci senza Inbox e la sidebar è `hidden md:flex` (`CoachLayout.tsx:105`): una rotta nuova sarebbe irraggiungibile da telefono, e cablarla richiederebbe 3 file di routing invece dei 2 concessi |
| 2   | Il badge si sposta da _Inbox_ a _Dashboard_ e conta `unreadCount`  | Il numero e la destinazione devono riferirsi alla stessa cosa. Con `alerts.length` (filtrato solo su `dismissed`) il contatore non sarebbe sceso mai dopo «segna letto»                                                        |
| 3   | «Segna letto» = `markAsRead` (`:121`), non `dismissAlert` (`:108`) | `dismissAlert` scrive `dismissed:true` e fa sparire la riga dalla query: è archiviare, non leggere                                                                                                                             |
| 4   | Vocabolari di gravità **non** riconciliati                         | DB `high\|medium\|low` vs client `critical\|warning\|info`: mapparli qui inventerebbe una corrispondenza che nei dati non esiste                                                                                               |
| 5   | «Vedi atleta» dentro la fetta                                      | Un canale che segnala un problema ma non porta alla persona è mezzo ultimo miglio (guardia C9)                                                                                                                                 |
| 6   | Le zone doloranti mostrano i **nomi**, non l'intensità             | Il valore di `soreness_map` ha contratti contraddittori (v. §8): un valore ambiguo mostrato è peggio di un valore non mostrato                                                                                                 |

## 7. Deroga concessa su un file VIETATO

`src/hooks/useCoachAlerts.ts` — **una riga additiva**: `staleTime: 30_000`.

Motivo, misurato: la query non aveva `staleTime` proprio, quindi ereditava `staleTime: Infinity` (`src/main.tsx:16`) e veniva reidratata dal persister IndexedDB a 24h (`src/main.tsx:32-36`) sotto `networkMode: 'offlineFirst'`. Il coach che riapriva l'app veniva servito dalla cache e **non rifaceva mai la query**; la sottoscrizione realtime copre solo gli INSERT a tab aperta. Gli avvisi scritti mentre l'app era chiusa restavano invisibili — cioè il criterio di accettazione principale sarebbe stato un testa-o-croce. Non tocca query, RLS, realtime né mutazioni.

## 8. Fuori scope — registrati come chip, non toccati

1. Il `message` (dato art. 9) finisce in IndexedDB per 24h: le `persistOptions` non hanno `shouldDehydrateQuery`. Preesistente — il hook girava già su ogni pagina coach.
2. `dismissAlert` resta non cablato: la lista è capped a 20 (`useCoachAlerts.ts:44`).
3. Il trigger watchdog non ha dedupe: la lista mostrerà eventuali duplicati. Fedeltà al dato, non difetto della UI.
4. Coach con zero atleti: `CoachHome` ritorna prima della griglia, il pannello non si monta.
5. **`soreness_map` ha tre contratti in conflitto** — v. verifica del 2026-08-01: `useAthleteHealthProfile.ts:219` casta a `Record<string, number>`, `DailyCheckin.tsx:280,:382` scrive `mild|moderate|severe`, `src/types/database.ts:64` dichiara `0|1|2|3|4|5` (tipo mai importato). **L'aritmetica di `DailyCheckin.tsx:342-347` è corretta** (indicizza una mappa con la stringa, non somma stringhe): nessun NaN. Il difetto è solo nel cast del lettore, oggi senza conseguenze perché nessuno rende i valori. Da riprendere in una fetta a sé.
6. I 4 segnali da check-in senza equivalente vivo (`high_stress`, `low_mood`, `digestion_issues`, zone del dolore su CoachHome) restano fuori: sono utili, non urgenti.

## 9. Chiusura

- Tre commit atomici in italiano con `Co-Authored-By: Claude <noreply@anthropic.com>`, verifica-commit immediata dopo ognuno.
- Review indipendente del diff prima di dichiarare chiusa.
- **Merge/push = Nick, via Pull request.** Su `main` non si spinge diretto.
- RETRO in `docs/auto-miglioramento.md` con la risposta esplicita alla guardia C9.
