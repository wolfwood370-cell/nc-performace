// =============================================================================
// src/components/athlete/SessionRpeGuide.tsx
// =============================================================================
// The familiarization card for the session-RPE scale — the prerequisite the
// source declares («the athlete should be familiarized with this scale …
// before beginning to collect reliable measures», Haddad 2017 on Foster).
//
// Deliberately stateless beyond a local open/closed flag: it is not forced,
// it does not remember who saw it (no localStorage, no column) — it is
// always there, one tap away, next to the question. EVERY word comes from
// src/lib/effort/sessionRpe.ts: this file contains no scale text of its own.
// =============================================================================

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SESSION_RPE_ANCHORS,
  SESSION_RPE_COMPARABILITY,
  SESSION_RPE_DEFINITION,
  SESSION_RPE_EXAMPLES,
  SESSION_RPE_GUIDE_ANCHORS_LABEL,
  SESSION_RPE_GUIDE_EXAMPLES_LABEL,
  SESSION_RPE_GUIDE_TITLE,
  SESSION_RPE_TIMING,
  SESSION_RPE_VALUES,
} from "@/lib/effort/sessionRpe";

export function SessionRpeGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="session-rpe-guide-panel"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 text-sm font-medium",
          "text-brand-container hover:brightness-110 transition-all",
          "active:scale-95",
        )}
      >
        <HelpCircle className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        {SESSION_RPE_GUIDE_TITLE}
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id="session-rpe-guide-panel"
          className={cn(
            "mt-3 rounded-2xl p-4 text-left",
            "bg-surface-container border border-outline-variant/30",
          )}
        >
          <p className="text-sm font-medium text-on-surface mb-3">{SESSION_RPE_DEFINITION}</p>

          <ol className="space-y-1 mb-3" aria-label={SESSION_RPE_GUIDE_ANCHORS_LABEL}>
            {SESSION_RPE_VALUES.map((n) => (
              <li key={n} className="flex items-baseline gap-2 text-sm">
                <span className="font-display font-bold tabular-nums w-6 text-right text-brand-container shrink-0">
                  {n}
                </span>
                <span className="text-on-surface">{SESSION_RPE_ANCHORS[n]}</span>
              </li>
            ))}
          </ol>

          <ul className="space-y-2 mb-3" aria-label={SESSION_RPE_GUIDE_EXAMPLES_LABEL}>
            {SESSION_RPE_EXAMPLES.map((esempio) => (
              <li key={esempio} className="text-xs text-on-surface-variant">
                {esempio}
              </li>
            ))}
          </ul>

          <p className="text-xs text-on-surface-variant italic mb-1">{SESSION_RPE_TIMING}</p>
          <p className="text-xs text-on-surface-variant">{SESSION_RPE_COMPARABILITY}</p>
        </div>
      )}
    </div>
  );
}
