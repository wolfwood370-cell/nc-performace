import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CoachLayout } from "@/components/coach/CoachLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Json } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  User,
  Palette,
  Building2,
  Settings,
  Upload,
  Save,
  Loader2,
  ExternalLink,
  CreditCard,
  Bell,
  Scale,
  Calendar,
  Camera as Instagram,
  Globe,
  CheckCircle2,
  ImageIcon,
  Sparkles,
  MessageSquarePlus,
  Lock,
} from "lucide-react";
import { FeedbackDialog } from "@/components/common/FeedbackDialog";
import { cn } from "@/lib/utils";
import { log } from "@/lib/logger";

// Type definitions
interface SocialLinks {
  instagram?: string;
  website?: string;
  youtube?: string;
  twitter?: string;
}

interface NotificationSettings {
  new_message: boolean;
  workout_completed: boolean;
  missed_workout: boolean;
}

interface Preferences {
  unit: "kg" | "lbs";
  checkin_day: number;
  email_notifications: boolean;
  notifications: NotificationSettings;
}

interface CoachProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  brand_color: string | null;
  logo_url: string | null;
  bio: string | null;
  social_links: SocialLinks;
  preferences: Preferences;
}

const DAY_NAMES = [
  { value: "1", label: "Lunedì" },
  { value: "2", label: "Martedì" },
  { value: "3", label: "Mercoledì" },
  { value: "4", label: "Giovedì" },
  { value: "5", label: "Venerdì" },
  { value: "6", label: "Sabato" },
  { value: "0", label: "Domenica" },
];

// Preset brand colors for coaches
const PRESET_COLORS = [
  { value: "#3b82f6", name: "Blue", label: "Blu" },
  { value: "#6366f1", name: "Indigo", label: "Indaco" },
  { value: "#8b5cf6", name: "Violet", label: "Viola" },
  { value: "#ec4899", name: "Pink", label: "Rosa" },
  { value: "#ef4444", name: "Red", label: "Rosso" },
  { value: "#f97316", name: "Orange", label: "Arancione" },
  { value: "#22c55e", name: "Green", label: "Verde" },
  { value: "#14b8a6", name: "Teal", label: "Teal" },
];

const DEFAULT_PREFERENCES: Preferences = {
  unit: "kg",
  checkin_day: 1,
  email_notifications: true,
  notifications: {
    new_message: true,
    workout_completed: true,
    missed_workout: true,
  },
};

export default function CoachSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [brandColor, setBrandColor] = useState("#6366f1");
  const [socialLinks, setSocialLinks] = useState<SocialLinks>({});
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (!user?.email) {
      toast.error("Sessione non valida. Effettua di nuovo il login.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("La nuova password deve avere almeno 8 caratteri");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Le password non coincidono");
      return;
    }
    setChangingPassword(true);
    try {
      // Re-verify current password before allowing change
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInErr) {
        toast.error("Password attuale non corretta");
        return;
      }
      const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updErr) throw updErr;
      toast.success("Password aggiornata con successo");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore durante l'aggiornamento";
      toast.error(msg);
    } finally {
      setChangingPassword(false);
    }
  };

  // Fetch coach profile
  const { data: profile, isLoading } = useQuery({
    queryKey: ["coach-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      if (!data) return null;

      // Bridge cast unavoidable: the generated `Tables<"profiles">` types
      // `social_links` and `preferences` as `Json`, but here we read them
      // as structured `SocialLinks` / `Preferences`. Replacing this would
      // need either zod runtime validation or a typed view.
      const profileData = data as unknown as {
        id: string;
        full_name: string | null;
        avatar_url: string | null;
        brand_color?: string | null;
        logo_url?: string | null;
        bio?: string | null;
        social_links?: SocialLinks | null;
        preferences?: Partial<Preferences> | null;
      };

      return {
        id: profileData.id,
        full_name: profileData.full_name,
        avatar_url: profileData.avatar_url,
        brand_color: profileData.brand_color || "#6366f1",
        logo_url: profileData.logo_url || null,
        bio: profileData.bio || null,
        social_links: profileData.social_links || {},
        preferences: {
          ...DEFAULT_PREFERENCES,
          ...(profileData.preferences || {}),
        },
      } as CoachProfile;
    },
    enabled: !!user?.id,
  });

  // Update form when profile loads
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setBio(profile.bio || "");
      setBrandColor(profile.brand_color || "#6366f1");
      setSocialLinks(profile.social_links || {});
      setPreferences({
        ...DEFAULT_PREFERENCES,
        ...profile.preferences,
      });
      setAvatarPreview(profile.avatar_url);
      setLogoPreview(profile.logo_url);
    }
  }, [profile]);

  // Handle file changes
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  // Compress an image File and return a data URL (JPEG/WebP).
  // We embed the image as a data URL in the profile to avoid the storage backend.
  const fileToCompressedDataURL = async (
    file: File,
    maxSize = 512,
    quality = 0.82,
  ): Promise<string> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Impossibile leggere il file"));
      reader.readAsDataURL(file);
    });

    // For SVG or non-raster images, return as-is.
    if (file.type === "image/svg+xml") return dataUrl;

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("Immagine non valida"));
      im.src = dataUrl;
    });

    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas non supportato");
    ctx.drawImage(img, 0, 0, w, h);

    // Prefer WebP, fallback to JPEG
    const mime = "image/webp";
    return canvas.toDataURL(mime, quality);
  };

  // Kept for API compatibility; routes uploads to the inline data-URL pipeline.
  const uploadFile = async (file: File, _bucket: string, _folder: string): Promise<string> => {
    return fileToCompressedDataURL(file);
  };

  // Save profile mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");

      let avatarUrl = profile?.avatar_url;
      let logoUrl = profile?.logo_url;

      // Upload avatar if changed
      if (avatarFile) {
        avatarUrl = await uploadFile(avatarFile, "coach-avatars", user.id);
      }

      // Upload logo if changed (use coach-branding bucket)
      if (logoFile) {
        logoUrl = await uploadFile(logoFile, "coach-branding", user.id);
      }

      const { data: updated, error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName || null,
          avatar_url: avatarUrl,
          logo_url: logoUrl,
          brand_color: brandColor,
          bio: bio || null,
          // The two casts below stay as `as unknown as Json` because
          // SocialLinks/Preferences are typed records without an index
          // signature — TS rejects the direct `as Json`.
          social_links: socialLinks as unknown as Json,
          preferences: preferences as unknown as Json,
        })
        .eq("id", user.id)
        .select("id");

      if (error) throw error;
      if (!updated || updated.length === 0) {
        throw new Error("PROFILE_MISSING");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-profile"] });
      setAvatarFile(null);
      setLogoFile(null);
      toast.success("Impostazioni salvate con successo!");
    },
    onError: (error: Error) => {
      log.error(error);
      if (error.message === "PROFILE_MISSING") {
        toast.error("Profilo non trovato. Effettua il logout e accedi di nuovo.");
      } else {
        toast.error(`Errore nel salvare: ${error.message}`);
      }
    },
  });

  // Update preferences helper (preserves existing data)
  const updatePreferences = (updates: Partial<Preferences>) => {
    setPreferences((prev) => ({
      ...prev,
      ...updates,
    }));
  };

  const updateNotifications = (key: keyof NotificationSettings, value: boolean) => {
    setPreferences((prev) => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [key]: value,
      },
    }));
  };

  if (isLoading) {
    return (
      <CoachLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[600px] w-full rounded-xl" />
        </div>
      </CoachLayout>
    );
  }

  return (
    <CoachLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Impostazioni</h1>
          <p className="text-muted-foreground mt-1">
            Gestisci il tuo profilo, branding e preferenze di sistema
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="branding" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 h-11">
            <TabsTrigger value="branding" className="gap-2">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Branding & Profilo</span>
              <span className="sm:hidden">Branding</span>
            </TabsTrigger>
            <TabsTrigger value="business" className="gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Business</span>
              <span className="sm:hidden">Business</span>
            </TabsTrigger>
            <TabsTrigger value="preferences" className="gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Preferenze</span>
              <span className="sm:hidden">Pref.</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Branding & Profile */}
          <TabsContent value="branding" className="space-y-6">
            {/* Profile Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Profilo Coach</CardTitle>
                    <CardDescription>Le informazioni visibili ai tuoi atleti</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Avatar Upload */}
                  <div className="space-y-3">
                    <Label>Foto Profilo</Label>
                    <div className="flex items-center gap-4">
                      <Avatar className="h-20 w-20 border-2 border-border">
                        <AvatarImage src={avatarPreview || undefined} />
                        <AvatarFallback className="text-lg bg-primary/10">
                          {fullName?.charAt(0)?.toUpperCase() || "C"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="space-y-2">
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarChange}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => avatarInputRef.current?.click()}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Carica
                        </Button>
                        <p className="text-xs text-muted-foreground">JPG, PNG. Max 2MB</p>
                      </div>
                    </div>
                  </div>

                  {/* Logo Upload */}
                  <div className="space-y-3">
                    <Label>Logo Business</Label>
                    <div className="flex items-center gap-4">
                      <div className="h-20 w-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden">
                        {logoPreview ? (
                          <img
                            src={logoPreview}
                            alt="Logo"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        )}
                      </div>
                      <div className="space-y-2">
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleLogoChange}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => logoInputRef.current?.click()}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Carica Logo
                        </Button>
                        <p className="text-xs text-muted-foreground">Per l'app atleti</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Name & Bio */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nome Completo</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Mario Rossi"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label>Colore Brand</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color.value}
                          type="button"
                          onClick={() => setBrandColor(color.value)}
                          className={cn(
                            "h-12 rounded-lg border-2 transition-all flex items-center justify-center",
                            brandColor === color.value
                              ? "border-foreground ring-2 ring-foreground ring-offset-2 ring-offset-background"
                              : "border-transparent hover:scale-105",
                          )}
                          style={{ backgroundColor: color.value }}
                          title={color.label}
                        >
                          {brandColor === color.value && (
                            <CheckCircle2 className="h-5 w-5 text-white drop-shadow-md" />
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <input
                        type="color"
                        value={brandColor}
                        onChange={(e) => setBrandColor(e.target.value)}
                        className="h-8 w-10 rounded border border-border cursor-pointer"
                        title="Colore personalizzato"
                      />
                      <Input
                        value={brandColor.toUpperCase()}
                        onChange={(e) => setBrandColor(e.target.value)}
                        placeholder="#3B82F6"
                        className="w-28 font-mono text-sm"
                      />
                      <span className="text-xs text-muted-foreground">
                        o scegli un colore personalizzato
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Scrivi una breve descrizione di te e della tua esperienza..."
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Questa bio sarà visibile nell'app atleti
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Social Links */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
                    <Instagram className="h-5 w-5 text-pink-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Link Social</CardTitle>
                    <CardDescription>Collega i tuoi profili social</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="instagram" className="flex items-center gap-2">
                      <Instagram className="h-4 w-4 text-pink-500" />
                      Instagram
                    </Label>
                    <Input
                      id="instagram"
                      value={socialLinks.instagram || ""}
                      onChange={(e) =>
                        setSocialLinks((prev) => ({ ...prev, instagram: e.target.value }))
                      }
                      placeholder="@username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website" className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-blue-500" />
                      Sito Web
                    </Label>
                    <Input
                      id="website"
                      value={socialLinks.website || ""}
                      onChange={(e) =>
                        setSocialLinks((prev) => ({ ...prev, website: e.target.value }))
                      }
                      placeholder="https://miosito.com"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Business (Stripe Placeholder) */}
          <TabsContent value="business" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-violet-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Stripe Connect</CardTitle>
                    <CardDescription>Gestisci i pagamenti e abbonamenti</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="p-6 rounded-xl border border-border bg-gradient-to-br from-violet-500/5 to-primary/5">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                        <CheckCircle2 className="h-6 w-6 text-green-500" />
                      </div>
                      <div>
                        <p className="font-semibold">Account Connesso</p>
                        <p className="text-sm text-muted-foreground">Stripe Connect attivo</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="bg-green-500/10 text-green-600 border-green-500/30"
                    >
                      Attivo
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="p-4 rounded-lg bg-background border border-border">
                      <p className="text-xs text-muted-foreground mb-1">Valuta</p>
                      <p className="font-semibold">EUR (€)</p>
                    </div>
                    <div className="p-4 rounded-lg bg-background border border-border">
                      <p className="text-xs text-muted-foreground mb-1">Piano</p>
                      <p className="font-semibold">Pro Coach</p>
                    </div>
                  </div>

                  <Button variant="outline" className="w-full gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Gestisci su Stripe Dashboard
                  </Button>
                </div>

                <div className="mt-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-amber-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-700 dark:text-amber-400">
                        Prossimamente
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Integrazione completa con Stripe per gestire abbonamenti atleti,
                        fatturazione automatica e report finanziari.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 3: Preferences */}
          <TabsContent value="preferences" className="space-y-6">
            {/* Units */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Scale className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Unità di Misura</CardTitle>
                    <CardDescription>Sistema metrico o imperiale</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={preferences.unit}
                  onValueChange={(value) => updatePreferences({ unit: value as "kg" | "lbs" })}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  <Label
                    htmlFor="metric"
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all",
                      preferences.unit === "kg"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50",
                    )}
                  >
                    <RadioGroupItem value="kg" id="metric" />
                    <div>
                      <p className="font-medium">Metrico</p>
                      <p className="text-sm text-muted-foreground">kg, km, cm</p>
                    </div>
                  </Label>
                  <Label
                    htmlFor="imperial"
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all",
                      preferences.unit === "lbs"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50",
                    )}
                  >
                    <RadioGroupItem value="lbs" id="imperial" />
                    <div>
                      <p className="font-medium">Imperiale</p>
                      <p className="text-sm text-muted-foreground">lbs, mi, ft</p>
                    </div>
                  </Label>
                </RadioGroup>
              </CardContent>
            </Card>

            {/* Notifications */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <Bell className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Notifiche</CardTitle>
                    <CardDescription>Gestisci le notifiche email</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                  <div>
                    <p className="font-medium">Nuovo Messaggio</p>
                    <p className="text-sm text-muted-foreground">Quando un atleta ti scrive</p>
                  </div>
                  <Switch
                    checked={preferences.notifications?.new_message ?? true}
                    onCheckedChange={(checked) => updateNotifications("new_message", checked)}
                  />
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                  <div>
                    <p className="font-medium">Allenamento Completato</p>
                    <p className="text-sm text-muted-foreground">
                      Quando un atleta completa un allenamento
                    </p>
                  </div>
                  <Switch
                    checked={preferences.notifications?.workout_completed ?? true}
                    onCheckedChange={(checked) => updateNotifications("workout_completed", checked)}
                  />
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                  <div>
                    <p className="font-medium">Allenamento Saltato</p>
                    <p className="text-sm text-muted-foreground">
                      Quando un atleta manca un allenamento
                    </p>
                  </div>
                  <Switch
                    checked={preferences.notifications?.missed_workout ?? true}
                    onCheckedChange={(checked) => updateNotifications("missed_workout", checked)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Default Check-in Day */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Check-in Settimanale</CardTitle>
                    <CardDescription>Giorno predefinito per il check-in atleti</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Select
                  value={preferences.checkin_day?.toString() ?? "1"}
                  onValueChange={(value) => updatePreferences({ checkin_day: parseInt(value) })}
                >
                  <SelectTrigger className="w-full md:w-64">
                    <SelectValue placeholder="Seleziona giorno" />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_NAMES.map((day) => (
                      <SelectItem key={day.value} value={day.value}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Password Change */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Lock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Sicurezza</CardTitle>
                    <CardDescription>Cambia la password del tuo account</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Password attuale</Label>
                  <Input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Nuova password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimo 8 caratteri"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Conferma nuova password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Ripeti la nuova password"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleChangePassword}
                    disabled={
                      changingPassword ||
                      !currentPassword ||
                      !newPassword ||
                      !confirmPassword
                    }
                    className="gap-2"
                  >
                    {changingPassword ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Lock className="h-4 w-4" />
                    )}
                    Aggiorna Password
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Feedback / Support */}
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageSquarePlus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Supporto & Feedback</p>
                <p className="text-xs text-muted-foreground">
                  Segnala un bug o suggerisci una funzionalità
                </p>
              </div>
            </div>
            <FeedbackDialog />
          </CardContent>
        </Card>

        {/* Save Button - Fixed at bottom */}
        <div className="sticky bottom-6 mt-8">
          <Card className="border-primary/20 bg-card/95 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Ricorda di salvare le modifiche</p>
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="gap-2"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salva Modifiche
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </CoachLayout>
  );
}
