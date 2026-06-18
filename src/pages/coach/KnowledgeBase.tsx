import { useCallback, useState, DragEvent, ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CoachLayout } from "@/components/coach/CoachLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BrainCircuit,
  Upload,
  FileText,
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Database,
  Trash2,
  Cpu,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { log } from "@/lib/logger";
import { extractPdfText } from "@/lib/pdf";
import { AiQuotaBadge } from "@/components/coach/ai/AiQuotaBadge";

type DocStatus = "pending" | "processing" | "processed" | "failed";

interface KnowledgeDoc {
  id: string;
  title: string;
  status: DocStatus;
  error_message: string | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

interface PendingFile {
  id: string;
  file: File;
  textContent?: string;
  error?: string;
}

const ACCEPTED_TYPES = [".pdf", ".txt"];
const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function statusBadge(status: DocStatus) {
  switch (status) {
    case "processed":
      return (
        <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 gap-1">
          <CheckCircle2 className="h-3 w-3" /> Indicizzato
        </Badge>
      );
    case "processing":
      return (
        <Badge className="bg-violet-500/15 text-violet-400 border border-violet-500/30 gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Training...
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-rose-500/15 text-rose-400 border border-rose-500/30 gap-1">
          <AlertCircle className="h-3 w-3" /> Fallito
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> In coda
        </Badge>
      );
  }
}

export default function KnowledgeBase() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [readingLabel, setReadingLabel] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [statusLine, setStatusLine] = useState<string>("");

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["knowledge-documents", user?.id],
    queryFn: async (): Promise<KnowledgeDoc[]> => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("knowledge_documents")
        .select("id, title, status, error_message, chunk_count, created_at, updated_at")
        .eq("coach_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as KnowledgeDoc[];
    },
    enabled: !!user?.id,
    refetchInterval: (query) => {
      const docs = (query.state.data ?? []) as KnowledgeDoc[];
      const hasInFlight = docs.some((d) => d.status === "pending" || d.status === "processing");
      return hasInFlight ? 3000 : false;
    },
  });

  const processedCount = documents.filter((d) => d.status === "processed").length;
  const totalChunks = documents.reduce((acc, d) => acc + (d.chunk_count ?? 0), 0);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    // Immediate UI feedback: show the "reading" overlay BEFORE we touch
    // potentially huge files. Yield once so React paints the loader before
    // file.text() blocks the main thread.
    setIsReading(true);
    setReadingLabel(
      list.length === 1
        ? `Lettura di "${list[0].name}"... attendi`
        : `Lettura di ${list.length} documenti... attendi`,
    );
    await new Promise((r) => setTimeout(r, 0));

    const next: PendingFile[] = [];
    try {
      for (const file of list) {
        setReadingLabel(`Lettura "${file.name}" (${formatBytes(file.size)})...`);
        // Yield to the event loop so the label updates between files.
        await new Promise((r) => setTimeout(r, 0));

        const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
        if (!ACCEPTED_TYPES.includes(ext)) {
          toast.error(`${file.name}: formato non supportato (solo .pdf, .txt)`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
          toast.error(`${file.name}: troppo grande (max ${MAX_FILE_SIZE_MB}MB)`);
          continue;
        }

        const entry: PendingFile = { id: crypto.randomUUID(), file };

        if (ext === ".txt") {
          try {
            entry.textContent = await file.text();
          } catch {
            entry.error = "Lettura file fallita";
          }
        } else if (ext === ".pdf") {
          // Client-side extraction via pdfjs-dist (no upload required).
          // Audit B1 closure — see src/lib/pdf.ts for worker setup.
          try {
            const text = await extractPdfText(file);
            if (!text.trim()) {
              entry.error = "PDF senza testo estraibile (forse scansione/immagine).";
            } else {
              entry.textContent = text;
            }
          } catch (err) {
            log.error("PDF extraction failed:", err);
            entry.error =
              err instanceof Error
                ? `Estrazione PDF fallita: ${err.message}`
                : "Estrazione PDF fallita";
          }
        } else {
          entry.error = `Estensione ${ext} non supportata`;
        }

        next.push(entry);
      }
      setPending((prev) => [...prev, ...next]);
    } finally {
      setIsReading(false);
      setReadingLabel("");
    }
  }, []);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const onSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      handleFiles(e.target.files);
      e.target.value = "";
    }
  };

  const removePending = (id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Eliminare "${title}" dall'AI Brain? L'azione è irreversibile.`)) return;
    const { error } = await supabase.from("knowledge_documents").delete().eq("id", id);
    if (error) {
      toast.error("Eliminazione fallita: " + error.message);
      return;
    }
    toast.success("Documento rimosso dall'AI Brain");
    queryClient.invalidateQueries({ queryKey: ["knowledge-documents"] });
  };

  const trainAI = async () => {
    const trainable = pending.filter((p) => p.textContent && !p.error);
    if (trainable.length === 0) {
      toast.error("Nessun file pronto per il training");
      return;
    }

    setIsTraining(true);
    setProgress(0);
    setStatusLine("Inizializzazione del cluster di embedding...");

    let succeeded = 0;
    const total = trainable.length;

    for (let i = 0; i < trainable.length; i++) {
      const item = trainable[i];
      setStatusLine(`Slicing "${item.file.name}" in vector chunks (${i + 1}/${total})...`);

      try {
        // Step 1: create document row
        const { data: doc, error: docError } = await supabase
          .from("knowledge_documents")
          .insert({
            coach_id: user!.id,
            title: item.file.name,
            status: "pending",
          })
          .select("id")
          .single();

        if (docError || !doc) throw docError ?? new Error("Insert failed");

        queryClient.invalidateQueries({ queryKey: ["knowledge-documents"] });

        // Step 2: invoke edge function (long-running)
        const { error: fnError } = await supabase.functions.invoke("ingest-knowledge", {
          body: {
            documentId: doc.id,
            textContent: item.textContent,
          },
        });

        if (fnError) {
          // Function logged the failure on the doc; surface a friendly toast.
          throw new Error(fnError.message ?? "Edge function error");
        }

        succeeded += 1;
      } catch (err) {
        log.error("Training error:", err);
        const msg = err instanceof Error ? err.message : "Errore sconosciuto";
        toast.error(`${item.file.name}: ${msg}`);
      }

      setProgress(Math.round(((i + 1) / total) * 100));
    }

    queryClient.invalidateQueries({ queryKey: ["knowledge-documents"] });
    setIsTraining(false);
    setStatusLine("");
    setProgress(0);
    setPending([]);

    if (succeeded > 0) {
      toast.success(`${succeeded}/${total} documenti inviati al training. L'AI sta indicizzando.`);
    }
  };

  const trainableCount = pending.filter((p) => p.textContent && !p.error).length;

  return (
    <CoachLayout>
      <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center">
                <BrainCircuit className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">AI Brain</h1>
                <p className="text-sm text-muted-foreground">
                  Carica i tuoi manuali. Allena la copilot sulla tua metodologia.
                </p>
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="flex gap-3">
            <div className="px-4 py-2 rounded-lg border border-border/50 bg-card">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">
                Documenti
              </div>
              <div className="text-lg font-semibold flex items-center gap-2">
                <Database className="h-4 w-4 text-violet-400" />
                {processedCount}
              </div>
            </div>
            <div className="px-4 py-2 rounded-lg border border-border/50 bg-card">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">
                Vector Chunks
              </div>
              <div className="text-lg font-semibold flex items-center gap-2">
                <Cpu className="h-4 w-4 text-cyan-400" />
                {totalChunks.toLocaleString("it-IT")}
              </div>
            </div>
            <AiQuotaBadge className="self-center" />
          </div>
        </div>

        {/* Uploader */}
        <Card className="border-violet-500/20 bg-gradient-to-br from-card to-violet-950/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-violet-400" />
              Training Console
            </CardTitle>
            <CardDescription>
              Trascina i file qui sotto. Formati supportati: <code>.txt</code>, <code>.pdf</code>{" "}
              (max {MAX_FILE_SIZE_MB}MB)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={cn(
                "relative border-2 border-dashed rounded-xl transition-all",
                "p-10 text-center cursor-pointer",
                isDragging
                  ? "border-violet-500 bg-violet-500/10 scale-[1.01]"
                  : "border-border/60 hover:border-violet-500/50 hover:bg-violet-500/5",
              )}
            >
              <input
                type="file"
                multiple
                accept=".pdf,.txt,application/pdf,text/plain"
                onChange={onSelect}
                disabled={isTraining || isReading}
                className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                aria-label="Carica documenti"
              />
              {isReading ? (
                <>
                  <Loader2 className="h-10 w-10 mx-auto mb-3 text-violet-400 animate-spin" />
                  <p className="text-sm font-medium">
                    {readingLabel || "Lettura del documento... attendi"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    File di grandi dimensioni: il browser sta estraendo il testo. Non chiudere la
                    pagina.
                  </p>
                </>
              ) : (
                <>
                  <Upload
                    className={cn(
                      "h-10 w-10 mx-auto mb-3 transition-colors",
                      isDragging ? "text-violet-400" : "text-muted-foreground",
                    )}
                  />
                  <p className="text-sm font-medium">
                    {isDragging
                      ? "Rilascia per caricare"
                      : "Trascina i file o clicca per selezionare"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    I documenti vengono divisi in chunk vettoriali da 1000 caratteri ed embeddati
                    con OpenAI
                  </p>
                </>
              )}
            </div>

            {/* Pending list */}
            {pending.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  In coda ({pending.length})
                </div>
                {pending.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border bg-card",
                      item.error ? "border-rose-500/30" : "border-border/50",
                    )}
                  >
                    <FileText
                      className={cn(
                        "h-5 w-5 flex-shrink-0",
                        item.error ? "text-rose-400" : "text-violet-400",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.file.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(item.file.size)}
                        {item.error && <span className="text-rose-400 ml-2">· {item.error}</span>}
                        {!item.error && item.textContent && (
                          <span className="text-emerald-400 ml-2">
                            · {item.textContent.length.toLocaleString("it-IT")} caratteri pronti
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Rimuovi documento"
                      onClick={() => removePending(item.id)}
                      disabled={isTraining}
                      className="h-8 w-8"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Training progress */}
            {isTraining && (
              <div className="space-y-2 p-4 rounded-lg bg-violet-500/5 border border-violet-500/20">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                  <span className="font-medium">{statusLine}</span>
                </div>
                <Progress value={progress} className="h-1.5" />
                <p className="text-2xs text-muted-foreground">
                  L'embedding può richiedere fino a 60 secondi per documento. Non chiudere la
                  pagina.
                </p>
              </div>
            )}

            {/* Train button */}
            <Button
              onClick={trainAI}
              disabled={trainableCount === 0 || isTraining}
              size="lg"
              className="w-full gap-2 bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white border-0"
            >
              {isTraining ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Training in corso...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Train AI ({trainableCount} {trainableCount === 1 ? "file" : "file"})
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Document List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-cyan-400" />
              Knowledge Base ({documents.length})
            </CardTitle>
            <CardDescription>Documenti già appresi dalla copilot</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BrainCircuit className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nessun documento ancora indicizzato.</p>
                <p className="text-xs mt-1">Carica il primo manuale qui sopra per iniziare.</p>
              </div>
            ) : (
              <ScrollArea className="max-h-[480px] pr-2">
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                        doc.status === "failed"
                          ? "border-rose-500/30 bg-rose-500/5"
                          : "border-border/50 bg-card hover:border-border",
                      )}
                    >
                      <div
                        className={cn(
                          "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
                          doc.status === "processed" && "bg-emerald-500/10",
                          doc.status === "processing" && "bg-violet-500/10",
                          doc.status === "failed" && "bg-rose-500/10",
                          doc.status === "pending" && "bg-muted",
                        )}
                      >
                        <FileText
                          className={cn(
                            "h-5 w-5",
                            doc.status === "processed" && "text-emerald-400",
                            doc.status === "processing" && "text-violet-400",
                            doc.status === "failed" && "text-rose-400",
                            doc.status === "pending" && "text-muted-foreground",
                          )}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{doc.title}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span>
                            {formatDistanceToNow(new Date(doc.created_at), {
                              addSuffix: true,
                              locale: it,
                            })}
                          </span>
                          {doc.chunk_count > 0 && (
                            <>
                              <span>·</span>
                              <span>{doc.chunk_count} chunk</span>
                            </>
                          )}
                          {doc.error_message && (
                            <>
                              <span>·</span>
                              <span className="text-rose-400 truncate">{doc.error_message}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {statusBadge(doc.status)}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Elimina documento"
                        onClick={() => handleDelete(doc.id, doc.title)}
                        className="h-8 w-8 text-muted-foreground hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </CoachLayout>
  );
}
