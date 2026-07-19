import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Dumbbell } from "lucide-react";
import { mapSupabaseError } from "@/lib/errorMapping";
import { supabase } from "@/integrations/supabase/client";
import { MetaHead } from "@/components/MetaHead";
import { Footer } from "@/components/layout/Footer";

/** Resolve where to send an authenticated user based on their profile role. */
async function resolveHomePath(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/auth";
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role === "coach") return "/coach";
  if (profile?.role === "athlete") return "/athlete";
  // No role yet → onboarding wizard picks the role.
  return "/onboarding";
}

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
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("token");
  const { signIn, signUp, user } = useAuth();
  const [loading, setLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");

  // Invite-flow state. `prefillReady === true` switches the visible tab to
  // "signup"; `inviteCoachId` is captured at prefill time so we can pass it
  // to the post-signup RPC even if the row gets marked-used between prefill
  // and submit.
  const [prefillReady, setPrefillReady] = useState(false);
  const [inviteCoachId, setInviteCoachId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Already authenticated? Skip the form entirely — route to the role home.
  useEffect(() => {
    if (!user) return;
    resolveHomePath().then((path) => navigate(path, { replace: true }));
  }, [user, navigate]);

  // Invite tokens are redeemed automatically by the `handle_new_user` DB
  // trigger via email match against `invite_tokens`. No client prefill needed.

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

  const handleForgotPassword = async () => {
    if (!loginEmail) {
      toast.error("Inserisci la tua email prima di procedere");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("forgot-password", {
        body: { email: loginEmail, redirectTo: `${window.location.origin}/reset-password` },
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(loginEmail, loginPassword);
      toast.success("Login effettuato!");
      const path = await resolveHomePath();
      navigate(path, { replace: true });
    } catch (error: unknown) {
      toast.error(mapSupabaseError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Public signups are always athletes: handle_new_user ignores any
      // client-supplied role. Coach accounts are created administratively.
      await signUp(signupEmail, signupPassword, signupName);
      // Invite tokens are auto-redeemed by the `handle_new_user` DB trigger
      // (email match against `invite_tokens`). No client-side RPC needed.
      toast.success("Account creato! Benvenuto!");
      // Invite-flow signups go straight to /athlete because the coach
      // already prefilled the relationship; non-invite signups still pass
      // through /onboarding to capture profile data.
      navigate(inviteToken ? "/athlete" : "/onboarding", { replace: true });
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
        description="Accedi o registrati alla piattaforma NC Performance Hub."
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
            {inviteError && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {inviteError}
              </div>
            )}
            {prefillReady && !inviteError && (
              <div
                role="status"
                className="mb-4 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm text-primary"
              >
                Sei stato invitato dal tuo coach. Completa la registrazione per iniziare.
              </div>
            )}
            <Tabs defaultValue={inviteToken ? "signup" : "login"} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Accedi</TabsTrigger>
                <TabsTrigger value="signup">Registrati</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 mb-4"
                  onClick={handleGoogle}
                  disabled={loading}
                >
                  <GoogleIcon />
                  Continua con Google
                </Button>
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">oppure</span>
                  </div>
                </div>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="coach@example.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full gradient-primary" disabled={loading}>
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
              </TabsContent>

              <TabsContent value="signup">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 mb-4"
                  onClick={handleGoogle}
                  disabled={loading}
                >
                  <GoogleIcon />
                  Registrati con Google
                </Button>
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">oppure</span>
                  </div>
                </div>
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Nome completo</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Mario Rossi"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      required
                      readOnly={prefillReady}
                      aria-readonly={prefillReady}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="mario@example.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                      readOnly={prefillReady}
                      aria-readonly={prefillReady}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>

                  <Button type="submit" className="w-full gradient-primary" disabled={loading}>
                    {loading ? "Creazione account..." : "Crea account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <div className="mt-auto w-full">
          <Footer />
        </div>
      </div>
    </>
  );
}
