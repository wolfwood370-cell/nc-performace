import { useEffect, useCallback, useState } from "react";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/hooks/useHapticFeedback";

interface ConfettiProps {
  trigger: boolean;
  duration?: number;
  onComplete?: () => void;
}

function Confetti({ trigger, duration = 3000, onComplete }: ConfettiProps) {
  const fireConfetti = useCallback(() => {
    const end = Date.now() + duration;
    const colors = ["hsl(263, 70%, 60%)", "hsl(160, 84%, 50%)", "hsl(38, 92%, 55%)"];

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors,
      });
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      } else {
        onComplete?.();
      }
    };

    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors,
    });

    frame();
  }, [duration, onComplete]);

  useEffect(() => {
    if (trigger) {
      fireConfetti();
    }
  }, [trigger, fireConfetti]);

  return null;
}

// Standalone — premium confetti burst (usato internamente da CelebrationOverlay)
function triggerConfetti() {
  const colors = ["hsl(263, 70%, 60%)", "hsl(160, 84%, 50%)", "hsl(38, 92%, 55%)"];

  confetti({
    particleCount: 120,
    spread: 90,
    origin: { y: 0.6 },
    colors,
    scalar: 1.1,
    ticks: 150,
  });

  setTimeout(() => {
    confetti({
      particleCount: 40,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.7 },
      colors,
    });
  }, 150);

  setTimeout(() => {
    confetti({
      particleCount: 40,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.7 },
      colors,
    });
  }, 300);
}

// Trophy/gold confetti for PRs — refined, not gaudy
function triggerPRConfetti() {
  const goldColors = [
    "hsl(45, 95%, 60%)",
    "hsl(38, 92%, 55%)",
    "hsl(50, 100%, 70%)",
    "hsl(0, 0%, 100%)",
  ];

  confetti({
    particleCount: 80,
    spread: 60,
    origin: { y: 0.55 },
    colors: goldColors,
    shapes: ["circle"],
    scalar: 1.1,
    startVelocity: 38,
    gravity: 0.85,
    ticks: 180,
  });

  // Sparkle ring
  setTimeout(() => {
    confetti({
      particleCount: 30,
      spread: 360,
      startVelocity: 18,
      origin: { y: 0.5 },
      colors: goldColors,
      ticks: 100,
      gravity: 0.4,
      scalar: 0.7,
    });
  }, 200);
}

// ============================================================
// Premium PR Celebration Overlay (visual + haptic)
// ============================================================

type CelebrationKind = "pr" | "perfect-week" | "workout";

interface CelebrationDetail {
  kind: CelebrationKind;
  title?: string;
  subtitle?: string;
}

const EVENT = "elevate:celebrate";

/**
 * Fire a global premium celebration. Use this anywhere in the app.
 * Renders the <CelebrationOverlay /> mounted in App.
 */
function celebrate(detail: CelebrationDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CelebrationDetail>(EVENT, { detail }));
}

const HAPTIC_PATTERNS: Record<CelebrationKind, number[]> = {
  // Triumphant multi-beat — strong, pause, double-tap finale
  pr: [80, 60, 80, 60, 200],
  "perfect-week": [60, 40, 60, 40, 60, 40, 180],
  workout: [50, 50, 100],
};

/**
 * Mount once at app root. Listens for celebrate() events and renders
 * a premium glowing burst overlay + haptic pattern + confetti.
 */
export function CelebrationOverlay() {
  const [active, setActive] = useState<CelebrationDetail | null>(null);

  useEffect(() => {
    let dismissTimer: number | undefined;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<CelebrationDetail>).detail;
      setActive(detail);

      // Haptic — multi-beat triumphant pattern
      try {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate(HAPTIC_PATTERNS[detail.kind] ?? HAPTIC_PATTERNS.workout);
        } else {
          triggerHaptic(detail.kind === "pr" ? "heavy" : "success");
        }
      } catch {
        /* noop */
      }

      // Confetti
      if (detail.kind === "pr") {
        triggerPRConfetti();
      } else {
        triggerConfetti();
      }

      // auto-dismiss (clear any pending timer to avoid leaks on rapid events)
      if (dismissTimer) window.clearTimeout(dismissTimer);
      dismissTimer = window.setTimeout(() => setActive(null), 2400);
    };

    window.addEventListener(EVENT, handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      if (dismissTimer) window.clearTimeout(dismissTimer);
    };
  }, []);

  if (!active) return null;

  const isPR = active.kind === "pr";
  const title =
    active.title ??
    (isPR ? "Nuovo Record!" : active.kind === "perfect-week" ? "Settimana Perfetta" : "Completato");
  const subtitle = active.subtitle ?? (isPR ? "Hai superato il tuo limite" : "Continua così");

  return (
    <div
      className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center"
      aria-live="polite"
      role="status"
    >
      {/* Radial glow */}
      <div
        className={cn(
          "absolute inset-0 animate-fade-in",
          isPR
            ? "bg-[radial-gradient(circle_at_center,hsl(45_95%_60%/0.25),transparent_55%)]"
            : "bg-[radial-gradient(circle_at_center,color-mix(in_srgb,hsl(var(--primary))_22%,transparent),transparent_55%)]",
        )}
      />
      {/* Burst card */}
      <div className="relative animate-scale-in">
        <div
          className={cn(
            "flex flex-col items-center gap-2 px-8 py-6 rounded-2xl",
            "bg-card/90 backdrop-blur-xl border shadow-2xl",
            isPR
              ? "border-amber-400/40 shadow-amber-500/20"
              : "border-primary/30 shadow-primary/20",
          )}
        >
          <div
            className={cn(
              "h-14 w-14 rounded-full flex items-center justify-center text-2xl font-bold",
              isPR
                ? "bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 shadow-lg shadow-amber-500/40"
                : "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground",
            )}
            aria-hidden
          >
            {isPR ? "★" : "✓"}
          </div>
          <div className="text-center">
            <div className="text-base font-bold tracking-tight">{title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
