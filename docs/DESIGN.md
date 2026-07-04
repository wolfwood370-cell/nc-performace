# DESIGN.md — Corsia Claude Design

> La corsia **Claude Design** del progetto: cosa fa, come si aggancia al repo, come passa il lavoro a Claude Code.
> Complementa `CLAUDE.md` (Code) e `COWORK.md` (Cowork). Design **non scrive nel repo**: produce design system + prototipi e li **consegna via handoff a Code**, che passa dal giro di verifica.

---

## 1. Chi è Design (lane)

| Fa                                                                                         | Non fa                                                                |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Design system (import dal repo) · schermate chiave · prototipi · varianti · handoff → Code | Scrivere nel repo · toccare logica/DB · micro-edit a raffica (budget) |

Il codice generato entra **solo** attraverso l'handoff a Claude Code (§4), così passa da build-gate + review. Percorso primario **Design → Code**; "Send to Lovable" resta per emergenze visuali.

---

## 2. Setup (una tantum, poi verifica ogni sessione)

1. **Importa il design system dal repo** (GitHub import o `/design-sync` dal checkout via Claude Code) e **pubblicalo** nelle org settings. La fedeltà dell'output **dipende dalla qualità della sorgente**: prima l'import, poi si genera.
2. **`/design-sync` è uno snapshot:** va **rilanciato dopo ogni modifica** a token/componenti nel repo, altrimenti Design lavora su una sorgente vecchia.
3. **Tema doppio Coach/Athlete:** verifica come viene catturato (Aura per Coach, `.theme-athlete` per Athlete). Non documentato ufficialmente → controlla che entrambi gli scope arrivino, non solo uno.
4. **Budget** (quota condivisa con chat/Code/Cowork): canvas edit diretto per le rifiniture (zero rigenerazione), 2-3 varianti in un colpo, feedback specifici ("spaziatura 8px", componenti per nome), partire semplice.

**Checklist rapida di verifica (la fa Nick):** progetto sull'org giusta · esiste un design system per il Hub ed è **Published** · l'Export mostra la destinazione handoff verso Claude Code.

---

## 3. Kickoff prompt (lo rigenera Cowork a ogni sessione Design)

> Prima mossa di ogni sessione Design: **stato**, non generazione. Cowork rigenera questo prompt allineandolo allo stato del design system nel repo.

```
Prima di generare qualsiasi cosa, dimmi:
(1) quale design system è attivo in questo progetto e da quale sorgente proviene (repo GitHub / file / sync da codebase);
(2) quando è stato aggiornato l'ultima volta;
(3) quali componenti e token principali contiene (colori, font, componenti chiave), per Coach (Aura) e per Athlete (.theme-athlete);
(4) se rilevi che il design system è assente o generico, dichiaralo esplicitamente invece di procedere con uno stile inventato.
Non creare nulla in questa richiesta: solo lo stato.
```

Se risponde **assente/generico** → il primo task Design è l'**import dal repo Hub** (GitHub o `/design-sync` da Claude Code), NON la generazione di schermate.

---

## 4. Handoff Design → Code (il contratto)

- **Uscita = "Send to local coding agent"** (handoff bundle a Claude Code).
- Il bundle diventa l'**input** di `methodology/04-DESIGN-TO-CODE.md`: mapping colori/typography/spacing → token Aura/`.theme-athlete`, generazione TSX, audit post-implementazione (niente hex raw, namespace corretto, build-gate).
- **Color/spacing non mappabile** dal handoff ai token → **STOP & ASK** (`CLAUDE.md §5`), non inventare un valore.
- Code lavora su **branch** e committa; il **merge è di Nick**.

---

## 5. Confini

- Design **non** decide scope di prodotto né logica: propone UI su design system reale.
- Design **non** tocca dati/DB/security.
- In conflitto tra handoff Design e istruzioni di `CLAUDE.md`/`00-CORE.md` → vince il metodo del repo, e Code fa **STOP & ASK** (`CLAUDE.md §5`, "user dice X, DESIGN.md dice Y").
