// =============================================================================
// src/components/coach/InviteAthleteDialog.tsx
// =============================================================================
// Coach-facing modal to invite an athlete.
//
// PRIMARY flow — native Supabase invite via the `invite-athlete` edge function:
//   1. Coach fills in first name, last name, email.
//   2. "Invia invito" → supabase.functions.invoke("invite-athlete"): the edge
//      function verifies the caller is a coach, calls
//      auth.admin.generateLink({ type: "invite" }) with user_metadata
//      { coach_id, full_name, ... } and emails the one-time action link via
//      Resend (verified domain). The invite link is NEVER exposed to this
//      client — the email is bound to the address entered by the coach.
//   3. On signup the `handle_new_user` trigger links athlete<->coach from
//      user_metadata.coach_id and pre-populates the profile name.
//   4. If the account already exists, the edge function attaches the athlete
//      to this coach when possible (`attached` / `alreadyLinked` responses)
//      and re-sends the invite email with a fresh link unless the athlete
//      already completed onboarding (`resent` flag).
//
// SECONDARY fallback — explicit "Genera link manuale" button: legacy
// `invite_tokens` INSERT + shareable {origin}/auth?token=<uuid> URL, redeemed
// server-side by `handle_new_user` via email match. Kept until the native
// flow is proven; scheduled for later cleanup.
//
// Prop API preserved:
//   - `trigger`: optional custom button (defaults to "Invita atleta" CTA)
//   - `onAthleteInvited`: optional callback fired after a successful invite
//     (parent pages can refresh their athlete list / counters).
// =============================================================================

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { UserPlus, Loader2, Copy, Check, RefreshCcw, Mail, MailCheck, Link2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";

const inviteFormSchema = z.object({
  firstName: z.string().min(1, "Il nome è obbligatorio").max(60, "Il nome è troppo lungo"),
  lastName: z.string().min(1, "Il cognome è obbligatorio").max(60, "Il cognome è troppo lungo"),
  email: z.string().email("Indirizzo email non valido"),
  // Machine values (F0 enums); set on the profile by handle_new_user at signup.
  coachingMode: z.enum(["coached", "autonomous"], {
    required_error: "Seleziona la modalità",
  }),
  tier: z.enum(["premium", "monthly"], {
    required_error: "Seleziona il piano",
  }),
});

type InviteFormData = z.infer<typeof inviteFormSchema>;

interface InviteAthleteDialogProps {
  onAthleteInvited?: () => void;
  trigger?: React.ReactNode;
}

interface SentInvite {
  email: string;
  fullName: string;
  kind: "sent" | "attached" | "alreadyLinked";
  // Tri-state: true = invite re-sent, false = explicit no-resend from the new
  // edge fn (active account guaranteed), undefined = response without the flag
  // (older edge fn) — activation is unknown there, so the copy must not claim it.
  resent?: boolean;
}

interface GeneratedInvite {
  url: string;
  fullName: string;
  email: string;
}

// Maps edge-function errors to Italian user-facing messages.
async function invokeErrorToMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const status = error.context.status;
    let code: string | undefined;
    let serverError: string | undefined;
    try {
      const body = await error.context.json();
      code = typeof body?.code === "string" ? body.code : undefined;
      serverError = typeof body?.error === "string" ? body.error : undefined;
    } catch {
      // Non-JSON body: fall back to status-based messages below.
    }
    if (serverError === "You cannot invite yourself") {
      return "Non puoi invitare te stesso.";
    }
    if (status === 401) {
      return "Sessione non valida o scaduta: accedi di nuovo.";
    }
    if (status === 403) {
      return "Solo un account coach può invitare atleti.";
    }
    if (status === 409 || code === "user_already_exists") {
      return "Esiste già un account con questa email: non è collegabile automaticamente al tuo roster.";
    }
    if (status === 502) {
      return "Invio dell'email non riuscito. Riprova tra qualche minuto.";
    }
    return "Impossibile inviare l'invito (errore del server). Riprova.";
  }
  // FunctionsFetchError / FunctionsRelayError / network failures: the library
  // messages are English — show a generic Italian message instead.
  return "Connessione non riuscita. Controlla la rete e riprova.";
}

export function InviteAthleteDialog({ onAthleteInvited, trigger }: InviteAthleteDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<"email" | "link" | null>(null);
  const [sent, setSent] = useState<SentInvite | null>(null);
  const [generated, setGenerated] = useState<GeneratedInvite | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<InviteFormData>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
    },
  });

  const requireUser = () => {
    if (!user?.id) {
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Devi effettuare l'accesso per invitare atleti.",
      });
      return false;
    }
    return true;
  };

  // PRIMARY: native invite → email sent by the edge function.
  const onSubmit = async (data: InviteFormData) => {
    if (!requireUser()) return;

    setPending("email");
    try {
      const athleteEmail = data.email.toLowerCase().trim();
      const firstName = data.firstName.trim();
      const lastName = data.lastName.trim();

      const { data: result, error } = await supabase.functions.invoke("invite-athlete", {
        body: {
          athleteEmail,
          firstName,
          lastName,
          coachingMode: data.coachingMode,
          tier: data.tier,
        },
      });

      if (error) throw new Error(await invokeErrorToMessage(error));
      if (result?.error) {
        // Defensive: 2xx with an error body should not happen with the current
        // edge function — surface a generic Italian message, not the raw string.
        throw new Error("Impossibile inviare l'invito (errore del server). Riprova.");
      }

      const fullName = `${firstName} ${lastName}`.trim();
      const kind: SentInvite["kind"] = result?.alreadyLinked
        ? "alreadyLinked"
        : result?.attached
          ? "attached"
          : "sent";
      // Backwards-compatible tri-state: only an explicit boolean is trusted —
      // a response without the flag keeps the pre-resend copy (no activation claim).
      const resent = typeof result?.resent === "boolean" ? result.resent : undefined;
      setSent({ email: athleteEmail, fullName, kind, resent });

      toast({
        title:
          kind === "sent"
            ? "Invito inviato"
            : kind === "attached"
              ? "Atleta collegato"
              : resent
                ? "Invito re-inviato"
                : "Atleta già collegato",
        description:
          kind === "sent"
            ? `Email di invito inviata a ${athleteEmail}.`
            : kind === "attached"
              ? resent
                ? "L'atleta risultava già registrato: collegato al tuo roster e invito re-inviato via email."
                : resent === false
                  ? "L'atleta risultava già registrato con account attivo: collegato al tuo roster, nessuna email inviata."
                  : "L'atleta risultava già registrato: è stato collegato al tuo roster."
              : resent
                ? "L'atleta non aveva ancora attivato l'account: invito re-inviato via email."
                : resent === false
                  ? "Questo atleta è già collegato a te e il suo account è attivo."
                  : "Questo atleta è già collegato a te.",
      });

      onAthleteInvited?.();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Impossibile inviare l'invito. Riprova.";
      toast({
        variant: "destructive",
        title: "Errore",
        description: message,
      });
    } finally {
      setPending(null);
    }
  };

  // SECONDARY fallback: manual one-time link via legacy `invite_tokens`.
  // The native invite link is never exposed here — this generates a separate
  // legacy token redeemed by `handle_new_user` via email match.
  const onGenerateManual = async (data: InviteFormData) => {
    if (!requireUser()) return;

    setPending("link");
    try {
      const athleteEmail = data.email.toLowerCase().trim();
      const fullName = `${data.firstName.trim()} ${data.lastName.trim()}`.trim();
      const token = crypto.randomUUID();

      const { error } = await supabase.from("invite_tokens").insert({
        coach_id: user!.id,
        email: athleteEmail,
        full_name: fullName,
        token,
      });

      if (error) {
        // Unique-token collision is astronomically unlikely with UUIDv4
        // but we surface a clean message just in case.
        const message =
          error.code === "23505"
            ? "Esiste già un invito attivo per questa email."
            : error.message || "Errore nella generazione del link.";
        throw new Error(message);
      }

      const url = `${window.location.origin}/auth?token=${token}`;
      setGenerated({ url, fullName, email: athleteEmail });

      toast({
        title: "Link manuale creato",
        description: "Copia il link e mandalo all'atleta.",
      });

      onAthleteInvited?.();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Impossibile generare l'invito. Riprova.";
      toast({
        variant: "destructive",
        title: "Errore",
        description: message,
      });
    } finally {
      setPending(null);
    }
  };

  const handleCopy = async () => {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.url);
      setCopied(true);
      toast({
        title: "Link copiato",
        description: "Incollalo nella chat con l'atleta.",
      });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({
        variant: "destructive",
        title: "Clipboard non disponibile",
        description: "Seleziona il link e copialo manualmente.",
      });
    }
  };

  const handleInviteAnother = () => {
    form.reset();
    setSent(null);
    setGenerated(null);
    setCopied(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (pending !== null && !next) return;
    if (!next) {
      form.reset();
      setSent(null);
      setGenerated(null);
      setCopied(false);
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gradient-primary">
            <UserPlus className="h-4 w-4 mr-2" />
            Invita atleta
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Invita Atleta
          </DialogTitle>
          <DialogDescription>
            L'atleta riceve un'email con il link di attivazione dell'account. In alternativa puoi
            generare un link manuale da condividere tu.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
              <div className="flex items-start gap-3">
                <MailCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-primary mb-0.5">
                    {sent.kind === "sent"
                      ? `Invito inviato via email a ${sent.email}`
                      : sent.kind === "attached"
                        ? "Atleta collegato al tuo roster"
                        : sent.resent
                          ? "Invito re-inviato"
                          : "Atleta già collegato a te"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {sent.kind === "sent"
                      ? `${sent.fullName} riceverà un'email con il link di attivazione dell'account.`
                      : sent.kind === "attached"
                        ? sent.resent
                          ? `${sent.fullName} (${sent.email}) — account già esistente collegato al tuo roster, invito re-inviato via email.`
                          : sent.resent === false
                            ? `${sent.fullName} (${sent.email}) — account già attivo, collegato al tuo roster, nessuna email inviata.`
                            : `${sent.fullName} (${sent.email}) — account già esistente, nessuna email inviata.`
                        : sent.resent
                          ? `${sent.fullName} (${sent.email}) non aveva ancora attivato l'account: nuova email di invito inviata.`
                          : sent.resent === false
                            ? `${sent.fullName} (${sent.email}) fa già parte del tuo roster e il suo account è attivo.`
                            : `${sent.fullName} (${sent.email}) fa già parte del tuo roster.`}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={handleInviteAnother}>
                <RefreshCcw className="h-4 w-4 mr-2" />
                Invita un altro
              </Button>
              <Button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="gradient-primary"
              >
                Chiudi
              </Button>
            </div>
          </div>
        ) : generated ? (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="font-medium text-primary mb-0.5">{generated.fullName}</p>
              <p className="text-muted-foreground text-xs">{generated.email}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-url">URL di registrazione (fallback manuale)</Label>
              <div className="flex gap-2">
                <Input
                  id="invite-url"
                  type="text"
                  value={generated.url}
                  readOnly
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  aria-label="Copia link negli appunti"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Il link è valido fino al primo utilizzo. Nota: il link manuale non imposta modalità
                e piano — potrai impostarli in seguito dal profilo dell'atleta.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={handleInviteAnother}>
                <RefreshCcw className="h-4 w-4 mr-2" />
                Invita un altro
              </Button>
              <Button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="gradient-primary"
              >
                Chiudi
              </Button>
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Mario"
                          autoComplete="given-name"
                          maxLength={60}
                          disabled={pending !== null}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cognome</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Rossi"
                          autoComplete="family-name"
                          maxLength={60}
                          disabled={pending !== null}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="mario.rossi@email.com"
                        autoComplete="email"
                        disabled={pending !== null}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="coachingMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Modalità</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={pending !== null}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleziona" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="coached">Coached (seguito da te)</SelectItem>
                          <SelectItem value="autonomous">Autonoma</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Piano</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={pending !== null}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleziona" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="premium">Premium</SelectItem>
                          <SelectItem value="monthly">Mensile</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex items-center justify-between gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={form.handleSubmit(onGenerateManual)}
                  disabled={pending !== null}
                >
                  {pending === "link" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4 mr-2" />
                  )}
                  Genera link manuale
                </Button>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenChange(false)}
                    disabled={pending !== null}
                  >
                    Annulla
                  </Button>
                  <Button type="submit" disabled={pending !== null} className="gradient-primary">
                    {pending === "email" ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Invio…
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-2" />
                        Invia invito
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
