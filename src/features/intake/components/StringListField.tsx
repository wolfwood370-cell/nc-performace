// =============================================================================
// src/features/intake/components/StringListField.tsx
// =============================================================================
// Free-text list input (equipment.items): add one entry at a time, removable
// chips, hard caps mirrored from the contract (max 30 items × 60 chars).
// =============================================================================

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface StringListFieldProps {
  items: string[];
  onChange: (items: string[]) => void;
  maxItems: number;
  maxLength: number;
  ariaLabel?: string;
}

export function StringListField({
  items,
  onChange,
  maxItems,
  maxLength,
  ariaLabel,
}: StringListFieldProps) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const entry = draft.trim();
    if (entry === "" || items.length >= maxItems) return;
    onChange([...items, entry]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          maxLength={maxLength}
          aria-label={ariaLabel}
          placeholder="Es. bilanciere"
          className="h-12 flex-1"
        />
        <button
          type="button"
          onClick={add}
          disabled={draft.trim() === "" || items.length >= maxItems}
          className="h-12 rounded-full bg-[var(--nc-primary)] px-5 text-sm font-semibold text-[var(--nc-surface)] disabled:opacity-40"
        >
          Aggiungi
        </button>
      </div>
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="flex items-center gap-1 rounded-full bg-[var(--nc-track)] py-1 pl-3 pr-1 text-sm text-[var(--nc-ink)]"
            >
              {item}
              <button
                type="button"
                aria-label={`Rimuovi ${item}`}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--nc-muted)]"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {items.length >= maxItems && (
        <p className="text-xs text-[var(--nc-muted)]">
          Hai raggiunto il massimo di {maxItems} voci.
        </p>
      )}
    </div>
  );
}
