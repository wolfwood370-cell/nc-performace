// =============================================================================
// src/pages/Auth.tsx
// =============================================================================
// Passwordless-first sign-in: type your address, get one email carrying a link
// AND a code, use whichever is handier.
//
// There is NO public registration. The platform is invite-only, so the door is
// the coach's invitation, not a form — a self-service tab could only ever lead
// to a dead end. Password login survives as a SECONDARY, collapsed option
// because coach accounts have one; athletes never need it.
//
// The login email comes from the `request-login-link` edge function (Resend,
// NC-brand sender) and NOT from `signInWithOtp`: one source, one email.
// =============================================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { ChevronDown, Dumbbell, MailCheck } from "lucide-react";
import { mapSupabaseError } from "@/lib/errorMapping";
import { supabase } from "@/integrations/supabase/client";
import { MetaHead } from "@/components/MetaHead";
import { Footer } from "@/components/layout/Footer";
import { resolveHomePath } from "@/lib/auth/resolveHomePath";
import { describeLoginLinkError } from "@/lib/auth/loginLinkError";
import { isCompleteOtp, normalizeOtpInput, OTP_MAX_LENGTH } from "@/lib/auth/otp";

const GoogleIcon = () => (
  <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"
    />
  </svg>
);

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, verifyOtp, user } = useAuth();
  const [loading, setLoading] = useState(false);

  // One address for every path on this page: passwordless, password login and
  // "Password dimenticata?" all read it.
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [code, setCode] = useState("");

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState("");

  // Already authenticated? Skip the form entirely — route to the role home.
  useEffect(() => {
    if (!user) return;
    resolveHomePath().then((path) => navigate(path, { replace: true }));
  }, [user, navigate]);

  const goHome = async () => {
    const path = await resolveHomePath();
    navigate(path, { replace: true });
  };

  /** Core of the primary path; reused by "Invia di nuovo". */
  const requestLink = async () => {
    const address = email.trim().toLowerCase();
    if (!address) {
      toast.error("Inserisci la tua email");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("request-login-link", {
        body: { email: address, redirectTo: `${window.location.origin}/attiva` },
      });
      if (error) throw error;
      setLinkSent(true);
      // Deliberately generic: the endpoint does not reveal whether the address
      // has an account, and neither may this copy.
      toast.success("Controlla la tua casella di posta");
    } catch (error: unknown) {
      const status = error instanceof FunctionsHttpError ? error.context.status : null;
      toast.error(describeLoginLinkError(status));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestLink = async (e: React.FormEvent) => {
    e.preventDefault();
    await requestLink();
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await verifyOtp(email, code);
      toast.success("Accesso effettuato!");
      await goHome();
    } catch (error: unknown) {
      toast.error(mapSupabaseError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      // OAuth nativo Supabase: il browser viene rediretto a Google e torna su
      // /auth, dove l'`useEffect` su `user` instrada al ruolo corretto. Andare
      // su `/` farebbe scattare il redirect bare-root verso /auth (loop).
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth`,
          // Forza la scelta dell'account anche se l'utente è già loggato in Google
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        toast.error(mapSupabaseError(error));
        setLoading(false);
      }
      // In caso di successo il browser sta già redirezionando a Google: il
      // ritorno su /auth è gestito dall'useEffect sopra.
    } catch (error: unknown) {
      toast.error(mapSupabaseError(error));
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      toast.success("Login effettuato!");
      await goHome();
    } catch (error: unknown) {
      toast.error(mapSupabaseError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("Inserisci la tua email prima di procedere");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("forgot-password", {
        body: { email, redirectTo: `${window.location.origin}/reset-password` },
      });
      if (error) throw error;
      if (data && (data as { error?: string }).error) {
        throw new Error((data as { error: string }).error);
      }
      toast.success("Email di recupero inviata! Controlla la tua casella di posta.");
    } catch (error: unknown) {
      toast.error(mapSupabaseError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <MetaHead
        title="Accedi"
        description="Accedi alla piattaforma NC Performance Hub con un link o un codice, senza password."
      />
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Dumbbell className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold">NC Performance Hub</CardTitle>
            <CardDescription>Piattaforma per coaching ibrido</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRequestLink} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="mario@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {!linkSent && (
                <>
                  <Button type="submit" className="w-full gradient-primary" disabled={loading}>
                    {loading ? "Invio in corso..." : "Ricevi il link di accesso"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Ti inviamo un link per entrare. Nessuna password da ricordare.
                  </p>
                </>
              )}
            </form>

            {linkSent && (
              <div className="mt-4 space-y-4">
                <div
                  role="status"
                  className="flex gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-3 text-sm text-primary"
                >
                  <MailCheck className="h-5 w-5 shrink-0" />
                  <span>
                    Se l'indirizzo è registrato, ti abbiamo inviato un'email con un link per entrare
                    e un codice.
                  </span>
                </div>

                <form onSubmit={handleVerifyCode} className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="login-code">Codice dall'email</Label>
                    <Input
                      id="login-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="12345678"
                      maxLength={OTP_MAX_LENGTH}
                      value={code}
                      onChange={(e) => setCode(normalizeOtpInput(e.target.value))}
                      className="font-mono tracking-[0.3em]"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full gradient-primary"
                    disabled={loading || !isCompleteOtp(code)}
                  >
                    {loading ? "Verifica in corso..." : "Entra"}
                  </Button>
                </form>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-primary transition-colors"
                    onClick={requestLink}
                    disabled={loading}
                  >
                    Invia di nuovo
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-primary transition-colors"
                    onClick={() => {
                      setLinkSent(false);
                      setCode("");
                    }}
                    disabled={loading}
                  >
                    Usa un altro indirizzo
                  </button>
                </div>
              </div>
            )}

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">oppure</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full h-11"
              onClick={handleGoogle}
              disabled={loading}
            >
              <GoogleIcon />
              Continua con Google
            </Button>

            {/* Secondary and collapsed: coaches have a password, athletes never
                need one. Plain state rather than a Collapsible primitive — the
                repo has none, and this needs no library. */}
            <div className="mt-4 border-t border-border pt-4">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
                onClick={() => setPasswordOpen((open) => !open)}
                aria-expanded={passwordOpen}
                aria-controls="password-login"
              >
                Accedi con password
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${passwordOpen ? "rotate-180" : ""}`}
                />
              </button>

              {passwordOpen && (
                <form id="password-login" onSubmit={handlePasswordLogin} className="mt-3 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Accesso in corso..." : "Accedi"}
                  </Button>
                  <button
                    type="button"
                    className="w-full text-sm text-muted-foreground hover:text-primary transition-colors"
                    onClick={handleForgotPassword}
                    disabled={loading}
                  >
                    Password dimenticata?
                  </button>
                </form>
              )}
            </div>
          </CardContent>
        </Card>
        <div className="mt-auto w-full">
          <Footer />
        </div>
      </div>
    </>
  );
}
