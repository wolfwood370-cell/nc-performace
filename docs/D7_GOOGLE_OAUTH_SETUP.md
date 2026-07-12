> ⚠️ **STORICO — piano già ESEGUITO; non usare come piano.**
> Vedi `docs/stato-repo-2026-07-12.md` §2.

# D7 — Setup login Google (coach + atleti su invito)

> Generato da Cowork, 2026-06-14. Progetto Supabase ref `xgxtplqlewpqjzghvbke`.
> Modello scelto: **atleti solo su invito**. Coach = solo Nick.

## Cosa è già pronto (nessuna azione)

- **Pulsante "Accedi con Google" già nel codice** (`src/pages/Auth.tsx` → `signInWithOAuth({ provider: 'google', redirectTo: origin + '/auth' })`).
- **Logica ruoli già corretta** (`handle_new_user`): un nuovo accesso Google diventa **atleta** per default (Google non invia un "ruolo" → nessuno può auto-nominarsi coach via Google). Se l'email è in `invite_tokens` (invito valido) → atleta **collegato automaticamente al coach**.
- Tabella `invite_tokens` presente nel nuovo progetto (verificata).

→ Restano: **(A)** client OAuth su Google Cloud, **(B)** abilitare il provider su Supabase, **(C)** promuovere il tuo profilo a coach una volta, **(D)** invitare gli atleti.

---

## PARTE A — Google Cloud Console (la fai tu)

Sito: https://console.cloud.google.com

1. **Crea/seleziona un progetto** (es. "nc-performance-hub").
2. **OAuth consent screen** (APIs & Services → OAuth consent screen):
   - User type: **External**.
   - App name, email di supporto (la tua), contatto sviluppatore (la tua).
   - **Scope**: lascia quelli base (`email`, `profile`, `openid`). Non aggiungere scope "sensibili" → così **non serve la verifica Google**.
   - Per i test iniziali tienilo in **Testing** e aggiungi come _Test user_ la tua email Google (e quella di un atleta di prova). Quando vorrai far entrare atleti veri, clicca **Publish app** (con questi scope base non c'è revisione).
3. **Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: `http://localhost:8080` (sviluppo). Aggiungerai il dominio di produzione più avanti.
   - **Authorized redirect URIs** (IL valore chiave, incollalo esatto):
     ```
     https://xgxtplqlewpqjzghvbke.supabase.co/auth/v1/callback
     ```
   - Crea → **copia Client ID e Client Secret**.

## PARTE B — Supabase Dashboard (la fai tu)

Progetto `nc-performance-hub` (`xgxtplqlewpqjzghvbke`).

1. **Authentication → Providers (Sign In / Providers) → Google**:
   - **Enable**, incolla **Client ID** e **Client Secret** del punto A3. Salva.
2. **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:8080` (in sviluppo; poi il dominio di produzione).
   - **Redirect URLs**: aggiungi `http://localhost:8080/auth` (e `http://localhost:8080/**`). In produzione aggiungerai `https://<tuo-dominio>/auth`.
   - Salva.

> Il `.env` punta già al progetto giusto, quindi l'app userà questa configurazione appena la riavvii.

## PARTE C — Promuovi il tuo profilo a coach (lo faccio io, una volta)

Al **primo accesso con Google** il tuo profilo nasce come _atleta_. Dimmi la tua **email Google da coach** e — appena il profilo esiste — eseguo un `UPDATE profiles SET role='coach'` sul tuo account (stesso metodo già usato per l'utente di test). Da lì sei coach in modo stabile.

## PARTE D — Invitare gli atleti (flusso normale)

1. Dall'app, da coach, **inviti un atleta inserendo la sua email** (crea una riga in `invite_tokens`).
2. L'atleta **accede con Google usando quella stessa email** → viene creato come **atleta collegato a te** automaticamente.
   - L'email Google dell'atleta deve combaciare con quella dell'invito.

## Verifica (la guido io via Claude in Chrome, ti avviso prima)

- Tu accedi con Google (coach) → io promuovo il profilo a coach.
- Inviti un atleta di prova → l'atleta accede con Google → controllo che risulti `athlete` con `coach_id` = te.

## Nota sicurezza (solo report — D5/Lovable)

Nel signup **email/password** `handle_new_user` si fida del campo `role` nei metadati: in teoria, via email/password, qualcuno potrebbe registrarsi come `coach`. **Con Google non è sfruttabile** (nessun campo role). Se vuoi blindare "coach = solo io" anche per email/password, è una piccola modifica lato codice/migration (ambito Claude Code) — segnalata, non applicata qui.

---

_D7 · Cowork · 2026-06-14. Aggiornare dopo il primo login Google + test invito._
