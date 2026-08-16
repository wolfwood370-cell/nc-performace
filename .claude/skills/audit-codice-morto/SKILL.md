---
name: audit-codice-morto
description: Routine di audit del codice morto — scatta su richieste di audit, dead code, pulizia, ottimizza, knip, depcheck, ts-prune o rimozione di moduli scollegati.
---

# Audit codice morto — la routine sta in un solo posto

Leggi `.claude/methodology/05-DEAD-CODE-AUDIT.md` e segui la sua procedura: strumenti
(knip, depcheck, grep mirato), ordine dei passi, come si prova che un modulo è davvero
morto e come lo si rimuove senza rompere i gate.

Non improvvisare la rimozione: quel file dichiara anche i limiti della copertura test
del repo, che rendono pericoloso fidarsi del solo «non è importato da nessuno».
