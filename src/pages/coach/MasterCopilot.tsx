import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowUp, Bot, RefreshCw, Sparkles, User } from "lucide-react";
import { CoachLayout } from "@/components/coach/CoachLayout";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AiQuotaBadge } from "@/components/coach/ai/AiQuotaBadge";
import { FeatureGate } from "@/components/common/FeatureGate";
import { useCopilotChat, type CopilotMessage } from "@/hooks/useCopilotChat";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Quali sono i protocolli migliori per ipertrofia delle gambe?",
  "Riassumi le linee guida sull'allenamento ad alta intensità.",
  "Come strutturo un mesociclo di forza per un atleta intermedio?",
  "Spiegami il concetto di ACWR e come usarlo.",
];

export default function MasterCopilot() {
  const { messages, lastSources, isLoading, sendMessage, reset } = useCopilotChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages or loading state changes
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLDivElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [input]);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const isEmpty = messages.length === 0 && !isLoading;

  return (
    <CoachLayout>
      <div className="flex h-[calc(100vh-4rem)] flex-col bg-background">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">Master Copilot</h1>
              <p className="text-xs text-muted-foreground">
                AI clinico personalizzato sulla tua knowledge base
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AiQuotaBadge />
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={reset} disabled={isLoading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Nuova conversazione
              </Button>
            )}
          </div>
        </div>

        {/* Messages */}
        <ScrollArea ref={scrollRef} className="flex-1">
          <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
            {isEmpty ? (
              <EmptyState onPick={(t) => setInput(t)} />
            ) : (
              <div className="space-y-6">
                {messages.map((m, idx) => (
                  <Bubble key={idx} message={m} />
                ))}
                {isLoading && <TypingBubble />}
                {!isLoading && lastSources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-11">
                    {lastSources.map((s) => (
                      <Badge key={s.chunk_id} variant="secondary" className="text-3xs font-normal">
                        {s.document_title}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border/60 bg-background/80 backdrop-blur-sm">
          <FeatureGate feature="ai_chat_daily" className="m-4">
          <form
            onSubmit={handleSubmit}
            className="mx-auto w-full max-w-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6"
          >
            <div className="relative flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Chiedi al tuo copilot clinico..."
                rows={1}
                disabled={isLoading}
                className="min-h-0 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Invia messaggio"
                disabled={!input.trim() || isLoading}
                className="h-9 w-9 shrink-0 rounded-xl"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-center text-3xs text-muted-foreground">
              Le risposte si basano sui documenti caricati nell'AI Brain.
            </p>
          </form>
          </FeatureGate>
        </div>
      </div>
    </CoachLayout>
  );
}

function Bubble({ message }: { message: CopilotMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted/60 text-foreground rounded-tl-sm",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:my-3 prose-pre:my-2 prose-ul:my-2 prose-ol:my-2">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Bot className="h-4 w-4" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-muted/60 px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 animate-pulse rounded-full bg-foreground/40 [animation-delay:0ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-foreground/40 [animation-delay:200ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-foreground/40 [animation-delay:400ms]" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-2xl font-semibold tracking-tight">Master Copilot</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Il tuo assistente clinico, addestrato sui manuali e sui protocolli che hai caricato nell'AI
        Brain.
      </p>
      <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-foreground/80 transition-all hover:border-primary/40 hover:bg-accent/50 hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
