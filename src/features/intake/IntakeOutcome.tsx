// =============================================================================
// src/features/intake/IntakeOutcome.tsx
// =============================================================================
// Renders the REAL edge-function outcome — no client re-evaluation. Copy for
// the routed-out reasons approved by Nick 2026-07-14 (point D): neutral,
// no clinical scores or labels (art. 9). routedOut dominates ok upstream
// (submit.ts); the minor case is the only one where nothing was persisted.
// =============================================================================

import { CheckCircle2, Info } from "lucide-react";
import type { SubmitOutcome } from "./submit";

const ROUTED_OUT_COPY: Record<string, string> = {
  minor: "Il servizio richiede la maggiore età. Nessun dato è stato registrato.",
  pregnancy:
    "Hai segnalato una gravidanza: serve prima un confronto col tuo medico. Il tuo coach è stato avvisato.",
  dca_flag:
    "Dalle tue risposte è meglio un confronto con un professionista prima di iniziare. Il tuo coach è stato avvisato.",
};

const ROUTED_OUT_FALLBACK =
  "Serve un confronto con un professionista prima di iniziare. Il tuo coach è stato avvisato.";

interface IntakeOutcomeProps {
  outcome: Exclude<SubmitOutcome, { kind: "invalidPayload" } | { kind: "missingConsents" }>;
  onRetry: () => void;
  onSignOut: () => void;
}

function goToApp() {
  // Hard reload on purpose: useAuth has no refetch, the in-memory profile
  // still says onboarding_completed=false (same workaround as the legacy wizard).
  window.location.replace("/athlete");
}

export function IntakeOutcome({ outcome, onRetry, onSignOut }: IntakeOutcomeProps) {
  const content = (() => {
    switch (outcome.kind) {
      case "success":
        return {
          icon: <CheckCircle2 className="h-12 w-12 text-[var(--nc-primary)]" aria-hidden />,
          title: "Questionario inviato",
          body: "Grazie! Le tue risposte sono state registrate: il tuo percorso parte da qui.",
          cta: { label: "Vai alla tua area", action: goToApp },
        };
      case "routedOut": {
        const messages = outcome.reasons
          .map((reason) => ROUTED_OUT_COPY[reason])
          .filter((msg): msg is string => Boolean(msg));
        return {
          icon: <Info className="h-12 w-12 text-[var(--nc-primary)]" aria-hidden />,
          title: "Serve un passaggio in più",
          body: messages.length > 0 ? messages.join(" ") : ROUTED_OUT_FALLBACK,
          cta: outcome.persisted
            ? { label: "Vai alla tua area", action: goToApp }
            : { label: "Esci", action: onSignOut },
        };
      }
      case "alreadySubmitted":
        return {
          icon: <CheckCircle2 className="h-12 w-12 text-[var(--nc-primary)]" aria-hidden />,
          title: "Questionario già inviato",
          body: "Avevi già completato l'intake: non serve rifarlo.",
          cta: { label: "Vai alla tua area", action: goToApp },
        };
      case "authError":
        return {
          icon: <Info className="h-12 w-12 text-[var(--nc-primary)]" aria-hidden />,
          title: "Sessione non valida",
          body: "Accedi di nuovo per completare il questionario: le risposte sono salvate su questo dispositivo.",
          cta: { label: "Vai all'accesso", action: () => window.location.replace("/auth") },
        };
      default:
        return {
          icon: <Info className="h-12 w-12 text-[var(--nc-primary)]" aria-hidden />,
          title: "Qualcosa è andato storto",
          body: "Non siamo riusciti a inviare il questionario. Controlla la connessione e riprova: le risposte sono salvate.",
          cta: { label: "Riprova", action: onRetry },
        };
    }
  })();

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-5">
      <div className="w-full max-w-md space-y-4 rounded-3xl border border-[var(--nc-track)] bg-[var(--nc-surface)] p-8 text-center">
        <div className="flex justify-center">{content.icon}</div>
        <h1 className="font-display text-xl font-bold text-[var(--nc-ink)]">{content.title}</h1>
        <p className="text-sm leading-relaxed text-[var(--nc-muted)]">{content.body}</p>
        <button
          type="button"
          onClick={content.cta.action}
          className="h-12 w-full rounded-full bg-[var(--nc-primary)] text-sm font-semibold text-[var(--nc-surface)]"
        >
          {content.cta.label}
        </button>
      </div>
    </div>
  );
}
