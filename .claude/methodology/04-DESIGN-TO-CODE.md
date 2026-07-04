# 04 — Design-to-Code (handoff Claude Design → TSX)

> Metodologia per implementare design forniti da **Claude Design** (handoff bundle: HTML/CSS o spec + screenshot) in TSX che rispetta i token Aura (Coach) o `.theme-athlete` (Athlete). Corsia Design: `docs/DESIGN.md`.
>
> Attivata quando arriva un handoff Design ("Send to local coding agent") o l'utente fornisce design + target da implementare.

---

## Indice

1. [Input atteso dall'utente](#1-input)
2. [Pipeline operativa step-by-step](#2-pipeline)
3. [Mapping: colori del design → token](#3-colors)
4. [Mapping: elementi HTML → primitive shadcn](#4-elements)
5. [Mapping: typography del design → tokens](#5-typography)
6. [Mapping: spacing del design → Tailwind scale](#6-spacing)
7. [Generazione TSX](#7-tsx-gen)
8. [Audit post-implementazione](#8-audit)
9. [Failure modes — quando STOP & ASK](#9-failures)
10. [Esempio end-to-end](#10-example)

---

<a id="1-input"></a>

## 1. Input atteso dall'utente

L'utente fornisce, in genere in 1-3 messaggi:

| Input                     | Format                                                        | Note                                          |
| ------------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| **Handoff Claude Design** | Bundle "Send to local coding agent" (HTML/CSS o spec + asset) | Solo styling — la logica resta nostra         |
| **Screenshot**            | Immagine PNG/JPG                                              | Reference visivo (di solito già nell'handoff) |
| **Target**                | "Questo va in `/coach/inbox`" o "Sostituisci `CoachHome.tsx`" | Indica dove implementare                      |
| **Vincoli**               | "Mantieni la logica esistente di X"                           | Opzionale                                     |

Se il design system è cambiato, la sorgente è l'**handoff aggiornato** (Design ha già rifatto `/design-sync` — vedi `docs/DESIGN.md §2`), non un file da incollare.

Se l'input è incompleto (es. solo screenshot senza HTML/spec, o target vago), **STOP & ASK** con AskUserQuestion.

<a id="2-pipeline"></a>

## 2. Pipeline operativa step-by-step

```
1. PARSE input
   - Leggi l'handoff Design (HTML/CSS o spec)
   - Leggi screenshot (visual reference)
   - Identifica target (Coach o Athlete? quale route/componente?)

2. ANALISI HTML
   - Layout structure (grid, flex, sezioni)
   - Elementi semantici (button, card, input, badge, ...)
   - Colori usati (lista hex)
   - Typography (font-family, size, weight)
   - Spacing (padding, margin, gap)
   - Radius + shadow
   - Animation / transition (se presente)

3. MAPPING (vedi sezioni 3-6)
   - Hex del design → token Aura / .theme-athlete
   - <button> / <div class="card"> → primitive shadcn
   - Font-family → font-display / font-sans
   - px values → Tailwind scale (4px = 1, 8px = 2, 16px = 4, ecc.)

4. STOP & ASK se:
   - Color non mappabile (hex non esiste in token palette)
   - Component custom del design senza equivalente shadcn (es. carousel particolare)
   - Layout confligge con responsive existing
   - Logica esistente cambia (devo solo cambiare styling o anche behavior?)

5. WRITE TSX
   - File nuovo in src/pages/coach/... o src/components/coach/...
   - O Edit del file esistente (se sostituzione)
   - Preserva logica esistente (hook, state, handlers)
   - Usa SOLO token, MAI hex raw
   - Componenti shadcn invece di div+style
   - Lazy import + auth guard se è una nuova route

6. AUDIT
   - Grep hex / Tailwind palette generica → deve essere 0 hits
   - Grep token sbagliato (Athlete in Coach, Coach in Athlete) → 0
   - Hook order check (§00-CORE §8)
   - Build gate: tsc --noEmit

7. COMMIT
   - Prefisso `design:` o `style:`
   - Msg italiano: "implementa da handoff Design <area> con token Aura"
   - Co-Authored-By: Claude <noreply@anthropic.com>
```

<a id="3-colors"></a>

## 3. Mapping: colori del design → token

### 3.1 Coach (Aura palette)

| Hex tipico del design | Token Aura                                          | CSS var                       |
| --------------------- | --------------------------------------------------- | ----------------------------- |
| `#003e62` / `#003C62` | `bg-primary` / `text-primary`                       | `--primary`                   |
| `#005685`             | `bg-primary-container`                              | `--primary-container`         |
| `#91cbff`             | `text-on-primary-container`                         | `--on-primary-container`      |
| `#f5faff`             | `bg-background` / `bg-surface`                      | `--background`                |
| `#ffffff`             | `bg-card` / `bg-surface-container-lowest`           | `--card`                      |
| `#eaf5ff`             | `bg-surface-container-low` / `bg-muted`             | `--surface-container-low`     |
| `#def0ff`             | `bg-surface-container`                              | `--surface-container`         |
| `#d2ecff`             | `bg-surface-container-high`                         | `--surface-container-high`    |
| `#cbe6fb`             | `bg-surface-container-highest`                      | `--surface-container-highest` |
| `#b2d8ff`             | `bg-secondary` / `bg-accent`                        | `--secondary`                 |
| `#385f81`             | `text-on-secondary-container`                       | (var manuale)                 |
| `#001e2d`             | `text-foreground` / `text-on-surface`               | `--foreground`                |
| `#41474f`             | `text-on-surface-variant` / `text-muted-foreground` | `--on-surface-variant`        |
| `#c1c7d0`             | `border-border` / `border-outline-variant`          | `--border`                    |
| `#717880`             | `border-outline`                                    | `--outline`                   |
| `#ba1a1a`             | `bg-destructive` / `text-destructive`               | `--destructive`               |
| `#774616`             | `bg-tertiary-container` / `bg-warning`              | `--tertiary-container`        |
| `#fcb67c`             | `text-on-tertiary-container`                        | `--on-tertiary-container`     |

### 3.2 Athlete (`.theme-athlete` palette)

| Hex tipico del design | Class TSX                                             |
| --------------------- | ----------------------------------------------------- |
| `#ffffff`             | `bg-[var(--nc-surface)]`                              |
| `#043555`             | `text-[var(--nc-ink)]`                                |
| `#50768e`             | `text-[var(--nc-muted)]`                              |
| `#226fa3`             | `bg-[var(--nc-primary)]` / `text-[var(--nc-primary)]` |
| `#093858`             | `bg-[var(--nc-deep)]`                                 |
| `#f1f5f9`             | `bg-[var(--nc-track)]`                                |

### 3.3 Color non mappabile → STOP & ASK

Se il design usa un hex che non corrisponde a nessun token (es. `#7b3aff` viola fuori palette):

```
STOP. Chiedi all'utente:
1. Aggiungere il colore alla palette Aura (richiede edit src/index.css + tailwind.config.ts)?
2. Sostituire con un token esistente più vicino (suggerisci alternativa)?
3. Skipparlo (sezione meno critical)?
```

<a id="4-elements"></a>

## 4. Mapping: elementi HTML → primitive shadcn

| HTML del design              | Primitive shadcn                             | Import                         |
| ---------------------------- | -------------------------------------------- | ------------------------------ |
| `<button>` solido            | `<Button>` (variant `default`)               | `@/components/ui/button`       |
| `<button>` outline           | `<Button variant="outline">`                 | idem                           |
| `<button>` ghost             | `<Button variant="ghost">`                   | idem                           |
| `<button>` pill primario     | `<Button className="rounded-full">`          | idem                           |
| `<div class="card">`         | `<Card><CardContent>`                        | `@/components/ui/card`         |
| `<input type="text">`        | `<Input>`                                    | `@/components/ui/input`        |
| `<textarea>`                 | `<Textarea>`                                 | `@/components/ui/textarea`     |
| `<select>`                   | `<Select><SelectTrigger><SelectContent>`     | `@/components/ui/select`       |
| `<span class="badge">`       | `<Badge variant="...">`                      | `@/components/ui/badge`        |
| `<input type="checkbox">`    | `<Checkbox>`                                 | `@/components/ui/checkbox`     |
| `<input type="radio">` group | `<RadioGroup><RadioGroupItem>`               | `@/components/ui/radio-group`  |
| `<input type="range">`       | `<Slider>`                                   | `@/components/ui/slider`       |
| Switch toggle                | `<Switch>`                                   | `@/components/ui/switch`       |
| Tabs                         | `<Tabs><TabsList><TabsTrigger><TabsContent>` | `@/components/ui/tabs`         |
| Dialog/modal                 | `<Dialog><DialogContent>`                    | `@/components/ui/dialog`       |
| Drawer mobile                | `<Drawer>`                                   | `@/components/ui/drawer`       |
| Sheet lateral                | `<Sheet><SheetContent>`                      | `@/components/ui/sheet`        |
| Tooltip                      | `<Tooltip><TooltipContent>`                  | `@/components/ui/tooltip`      |
| Popover                      | `<Popover><PopoverContent>`                  | `@/components/ui/popover`      |
| Avatar                       | `<Avatar><AvatarImage><AvatarFallback>`      | `@/components/ui/avatar`       |
| Progress bar                 | `<Progress value={...}>`                     | `@/components/ui/progress`     |
| Toast notification           | `toast.success(...)` (sonner)                | `sonner`                       |
| Skeleton loading             | `<Skeleton>`                                 | `@/components/ui/skeleton`     |
| Separator                    | `<Separator>`                                | `@/components/ui/separator`    |
| Accordion                    | `<Accordion><AccordionItem>`                 | `@/components/ui/accordion`    |
| ScrollArea                   | `<ScrollArea><ScrollBar>`                    | `@/components/ui/scroll-area`  |
| Toggle group                 | `<ToggleGroup><ToggleGroupItem>`             | `@/components/ui/toggle-group` |

### 4.1 Quando NON usare shadcn

- Componenti domain-specific (AthleteCard, ProgressionInspector, ChatPane) → estensione custom su shadcn
- Layout patterns (3-column workspace, bento) → div+Tailwind diretti
- SVG inline (icone custom, charts) → diretto

<a id="5-typography"></a>

## 5. Mapping: typography del design → tokens

### 5.1 Font family

| CSS del design                                            | TSX class             |
| --------------------------------------------------------- | --------------------- |
| `font-family: 'Manrope'` o `font-family: 'Inter Display'` | `font-display`        |
| `font-family: 'Inter'` o `system-ui`                      | `font-sans` (default) |
| `font-family: 'Geist Mono'` o `monospace`                 | `font-mono`           |

⚠️ Se il design usa altri font (Roboto, Open Sans, Poppins) → **STOP**, non aggiungere font extra. Sostituisci con Manrope/Inter.

### 5.2 Font size

| px design | Tailwind class          | Token Aura                       |
| --------- | ----------------------- | -------------------------------- |
| 8px       | `text-5xs`              |                                  |
| 9px       | `text-4xs`              |                                  |
| 10px      | `text-3xs`              |                                  |
| 11px      | `text-2xs`              |                                  |
| 12px      | `text-xs`               |                                  |
| 14px      | `text-sm`               |                                  |
| 16px      | `text-base`             | `text-body-md`                   |
| 18px      | `text-lg`               |                                  |
| 20px      | `text-xl`               | `text-label-md` (heading minore) |
| 24-28px   | `text-2xl` / `text-3xl` | `text-headline-md`               |
| 32-36px   | `text-4xl`              | (H1 hero)                        |

### 5.3 Font weight

| Design | Tailwind         |
| ------ | ---------------- |
| 400    | `font-normal`    |
| 500    | `font-medium`    |
| 600    | `font-semibold`  |
| 700    | `font-bold`      |
| 800    | `font-extrabold` |

<a id="6-spacing"></a>

## 6. Mapping: spacing del design → Tailwind scale

Tailwind scale: ogni unit = 4px.

| px design | Tailwind              |
| --------- | --------------------- |
| 4px       | `1` (gap-1, p-1, m-1) |
| 8px       | `2`                   |
| 12px      | `3`                   |
| 16px      | `4`                   |
| 20px      | `5`                   |
| 24px      | `6`                   |
| 32px      | `8`                   |
| 40px      | `10`                  |
| 48px      | `12`                  |
| 64px      | `16`                  |
| 80px      | `20`                  |
| 96px      | `24`                  |

### 6.1 Radius

| px design | Tailwind                                        |
| --------- | ----------------------------------------------- |
| 4-6px     | `rounded-sm`                                    |
| 8px       | `rounded`                                       |
| 12px      | `rounded-lg`                                    |
| 16px      | `rounded-xl`                                    |
| 20-24px   | `rounded-2xl` / `rounded-md` (Aura custom 24px) |
| 28-32px   | `rounded-3xl` / `rounded-lg` (Aura custom 32px) |
| 9999px    | `rounded-full`                                  |

### 6.2 Shadow

| Design       | Tailwind / custom                     |
| ------------ | ------------------------------------- |
| Soft ambient | `shadow-sm`                           |
| Card lift    | `shadow` o `shadow-aura`              |
| Heavy modal  | `shadow-lg` o `shadow-2xl`            |
| Custom Aura  | `shadow-[0_8px_30px_rgb(0,0,0,0.04)]` |

<a id="7-tsx-gen"></a>

## 7. Generazione TSX

### 7.1 Struttura file standard (page)

```tsx
import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { CoachLayout } from "@/components/coach/CoachLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// ... altri import shadcn

// Hook custom o store import
import { useStore } from "@/stores/...";

export default function PageName() {
  // 1. Hooks (TUTTI prima di qualsiasi return)
  const data = useStore((s) => s.data);
  const [localState, setLocalState] = useState();
  const derived = useMemo(() => /* ... */, [data]);
  const handler = useCallback(() => { /* ... */ }, []);

  // 2. Early returns
  if (!data) return <CoachLayout title="..."><Loading /></CoachLayout>;

  // 3. Render
  return (
    <CoachLayout title="..." subtitle="...">
      {/* JSX derivato dall'handoff, con TOKEN ONLY */}
      <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-aura">
        {/* ... */}
      </div>
    </CoachLayout>
  );
}
```

### 7.2 Pattern preservazione logica esistente

Se stai **sostituendo** styling di un file esistente:

1. Leggi il file esistente PRIMA di scrivere
2. Identifica blocchi logici (hook, state, handler, query) → **preserva esattamente**
3. Sostituisci SOLO il JSX di rendering
4. Mantieni gli stessi prop names + tipi
5. Mantieni gli imports di logica (rimuovi solo quelli styling-only inutilizzati)

❌ **MAI** riscrivere la business logic perché l'HTML dell'handoff "sembra diverso". L'handoff è SOLO design, non architettura.

<a id="8-audit"></a>

## 8. Audit post-implementazione

```bash
# 1. Hex raw / Tailwind palette generica nel file appena scritto
grep -nE "(#[0-9a-fA-F]{3,8}|rgb\(|bg-(blue|gray|slate|stone|zinc)-[0-9])" \
  src/pages/coach/<NewFile>.tsx

# 2. Token wrong-namespace (Athlete in Coach o viceversa)
# Coach file deve NON contenere --nc-*
grep -n "nc-" src/pages/coach/<NewFile>.tsx
# Athlete file deve NON contenere primary-container, surface-container-
grep -nE "(primary-container|surface-container-)" src/pages/athlete/<NewFile>.tsx

# 3. Hook order (§00-CORE §8) — manual check

# 4. Font extra (Roboto, Poppins, ecc.)
grep -nE "(Roboto|Poppins|Open Sans|Source Sans|Lato)" src/pages/coach/<NewFile>.tsx

# 5. Build gate
npx tsc --noEmit -p tsconfig.app.json
```

<a id="9-failures"></a>

## 9. Failure modes — quando STOP & ASK

| Caso                                                                                                  | Azione                                                                                    |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Color hex non mappabile**                                                                           | `AskUserQuestion`: aggiungere palette? sostituire? skippare?                              |
| **Font non-Aura** (Roboto, Poppins, ...)                                                              | `AskUserQuestion`: sostituire con Manrope/Inter? aggiungere font (richiede edit globale)? |
| **Component custom del design senza equivalente shadcn** (carousel particolare, animazione complessa) | `AskUserQuestion`: implementare custom? semplificare? linkare libreria esterna?           |
| **Layout confligge con responsive existing**                                                          | `AskUserQuestion`: priorità mobile o desktop?                                             |
| **Logica esistente deve cambiare?**                                                                   | `AskUserQuestion`: solo styling o anche behavior?                                         |
| **L'handoff mostra dati ma backend non li espone**                                                    | `AskUserQuestion`: mockare con placeholder? estendere backend?                            |
| **Target ambiguo** (es. "mettilo nella sidebar" ma ci sono 3 sidebar)                                 | `AskUserQuestion`: quale specificamente                                                   |
| **Handoff Design confligge con `docs/DESIGN.md`**                                                     | `AskUserQuestion`: quale source of truth                                                  |

<a id="10-example"></a>

## 10. Esempio end-to-end

**Input utente**:

> Implementa questo nuovo CoachInbox header. Handoff Design (HTML) + screenshot. Va in `src/pages/coach/CoachCheckinInbox.tsx`. Mantieni la logica esistente.

**Handoff Design** (HTML sample):

```html
<header style="background: #f5faff; padding: 24px; border-bottom: 1px solid #c1c7d0;">
  <h1 style="font-family: 'Manrope'; font-size: 28px; font-weight: 700; color: #001e2d;">
    Triage Center
  </h1>
  <button style="background: #005685; color: white; padding: 8px 16px; border-radius: 9999px;">
    Filtra
  </button>
</header>
```

**Output TSX** (parte sostituita):

```tsx
<header className="bg-background p-6 border-b border-outline-variant/40">
  <h1 className="font-display text-headline-md font-bold text-foreground">Triage Center</h1>
  <Button className="rounded-full bg-primary-container text-on-primary-container">Filtra</Button>
</header>
```

**Audit**:

- ✅ Tutti gli hex dell'handoff → token Aura
- ✅ Manrope → `font-display`
- ✅ 28px → `text-headline-md`
- ✅ 9999px border-radius → `rounded-full`
- ✅ `<button>` solido → `<Button>` shadcn
- ✅ Logica `useQuery` esistente preservata (non toccata)

**Commit**:

```
design(coach): implementa da handoff Design header CoachCheckinInbox con token Aura

Co-Authored-By: Claude <noreply@anthropic.com>
```
