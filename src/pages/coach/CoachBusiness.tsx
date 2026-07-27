import { useState } from "react";
import { CoachLayout } from "@/components/coach/CoachLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Clock,
  Plus,
  MoreHorizontal,
  Trash2,
  CreditCard,
  TrendingUp,
  Package,
  Euro,
} from "lucide-react";
import { useCoachBusinessData } from "@/hooks/useCoachBusinessData";
import { useBillingPlans } from "@/hooks/useBillingPlans";
import { RequestPaymentDialog } from "@/components/coach/business/RequestPaymentDialog";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

/** The two sellable services. Everything else about the plan row (cadence,
 * tier, coaching_mode, whether a duration is required) derives from this
 * single choice — the coach never edits those fields directly. */
type PlanService = "autonomous_monthly" | "coached_premium";

/** Display-only preview: the AUTHORITATIVE days-per-block is the DB generated
 * column billing_plans.term_days (duration_blocks * 28). If the two diverge,
 * the preview lies — keep them in sync. */
const GIORNI_PER_BLOCCO = 28;

function getInitials(name: string | null): string {
  return (
    name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "??"
  );
}

function getStatusBadge(status: string) {
  switch (status) {
    case "active":
      return (
        <Badge variant="default" className="bg-primary/20 text-primary border-primary/30">
          Attivo
        </Badge>
      );
    case "trial":
      return <Badge variant="secondary">Prova</Badge>;
    case "past_due":
      return <Badge variant="destructive">Scaduto</Badge>;
    case "canceled":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Cancellato
        </Badge>
      );
    default:
      return <Badge variant="outline">Nessuno</Badge>;
  }
}

export default function CoachBusiness() {
  const {
    athleteSubscriptions,
    businessMetrics,
    isLoading: businessLoading,
  } = useCoachBusinessData();

  const {
    plans,
    isLoadingPlans,
    createPlan,
    isCreatingPlan,
    deletePlan,
    generateCheckout,
    isGeneratingCheckout,
  } = useBillingPlans();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const emptyPlanForm = {
    service: "autonomous_monthly" as PlanService,
    name: "",
    price: "",
    durationBlocks: "",
    description: "",
  };
  const [newPlan, setNewPlan] = useState(emptyPlanForm);

  // Payment request dialog state
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedAthlete, setSelectedAthlete] = useState<{ id: string; name: string } | null>(null);

  const isPremiumService = newPlan.service === "coached_premium";
  // Number(), NOT parseInt: "2.5" must be rejected (preview null, button
  // disabled), never silently truncated to a duration different from what
  // the coach typed. The duration IS the commercial number of the sale.
  const previewBlocks = Number(newPlan.durationBlocks);
  const durationPreview =
    Number.isInteger(previewBlocks) && previewBlocks >= 1
      ? `${previewBlocks} ${previewBlocks === 1 ? "blocco" : "blocchi"} = ${previewBlocks * GIORNI_PER_BLOCCO} giorni ≈ ${previewBlocks * 4} settimane`
      : null;

  const handleCreatePlan = () => {
    const priceInCents = Math.round(parseFloat(newPlan.price) * 100);
    if (!newPlan.name || priceInCents <= 0) return;
    // A premium path is prepaid: it MUST carry its duration (the DB CHECK
    // billing_plans_prepaid_needs_duration would reject it anyway).
    if (isPremiumService && !durationPreview) return;
    createPlan(
      isPremiumService
        ? {
            name: newPlan.name,
            price_amount: priceInCents,
            billing_interval: "one_time",
            tier: "premium",
            coaching_mode: "coached",
            duration_blocks: previewBlocks,
            description: newPlan.description || undefined,
          }
        : {
            name: newPlan.name,
            price_amount: priceInCents,
            billing_interval: "block",
            tier: "monthly",
            coaching_mode: "autonomous",
            duration_blocks: null,
            description: newPlan.description || undefined,
          },
      {
        onSuccess: () => {
          setIsCreateDialogOpen(false);
          setNewPlan(emptyPlanForm);
        },
      },
    );
  };

  const openPaymentDialog = (athleteId: string, athleteName: string) => {
    setSelectedAthlete({ id: athleteId, name: athleteName });
    setPaymentDialogOpen(true);
  };

  const isLoading = businessLoading || isLoadingPlans;

  if (isLoading) {
    return (
      <CoachLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </CoachLayout>
    );
  }

  return (
    <CoachLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Business Hub</h1>
            <p className="text-muted-foreground">Gestisci piani, abbonamenti e pagamenti Stripe</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Nuovo Piano
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crea Nuovo Piano</DialogTitle>
                <DialogDescription>
                  Definisci un piano di coaching. Sarà sincronizzato con Stripe al primo checkout.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Servizio</Label>
                  <Select
                    value={newPlan.service}
                    onValueChange={(v) => setNewPlan({ ...newPlan, service: v as PlanService })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="autonomous_monthly">
                        Programmazione mensile (cliente autonomo)
                      </SelectItem>
                      <SelectItem value="coached_premium">
                        Percorso premium (cliente seguito)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-name">Nome Piano</Label>
                  <Input
                    id="plan-name"
                    placeholder="e.g., Elite Coaching"
                    value={newPlan.name}
                    onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="plan-price">
                      {isPremiumService ? "Prezzo totale (€)" : "Prezzo per blocco (€)"}
                    </Label>
                    <Input
                      id="plan-price"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="150.00"
                      value={newPlan.price}
                      onChange={(e) => setNewPlan({ ...newPlan, price: e.target.value })}
                    />
                  </div>
                  {isPremiumService && (
                    <div className="space-y-2">
                      <Label htmlFor="plan-duration">Durata in blocchi da 4 settimane</Label>
                      <Input
                        id="plan-duration"
                        type="number"
                        min="1"
                        step="1"
                        placeholder="6"
                        value={newPlan.durationBlocks}
                        onChange={(e) => setNewPlan({ ...newPlan, durationBlocks: e.target.value })}
                      />
                    </div>
                  )}
                </div>
                {isPremiumService && (
                  <p className="text-sm text-muted-foreground">
                    {durationPreview ??
                      "Indica la durata: es. 6 blocchi = 168 giorni ≈ 24 settimane"}
                  </p>
                )}
                <div className="space-y-2">
                  <Label htmlFor="plan-desc">Descrizione</Label>
                  <Textarea
                    id="plan-desc"
                    placeholder="Cosa include questo piano..."
                    value={newPlan.description}
                    onChange={(e) => setNewPlan({ ...newPlan, description: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Annulla
                </Button>
                <Button
                  onClick={handleCreatePlan}
                  disabled={isCreatingPlan || (isPremiumService && !durationPreview)}
                >
                  {isCreatingPlan ? "Creazione..." : "Crea Piano"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* KPI Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                MRR Stimato
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">
                €{businessMetrics.estimatedMRR.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Ricavo ricorrente mensile</p>
            </CardContent>
          </Card>

          <Card className="border-secondary/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Clienti Attivi
              </CardTitle>
              <Users className="h-4 w-4 text-secondary-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {businessMetrics.activeClients}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                su {athleteSubscriptions.length} atleti totali
              </p>
            </CardContent>
          </Card>

          <Card className="border-accent/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                In Sospeso
              </CardTitle>
              <Clock className="h-4 w-4 text-accent-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {businessMetrics.pendingPayments}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                €{businessMetrics.pendingAmount.toFixed(2)} in sospeso
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Billing Plans */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <CardTitle>Piani Attivi</CardTitle>
            </div>
            <CardDescription>I tuoi piani di coaching con integrazione Stripe</CardDescription>
          </CardHeader>
          <CardContent>
            {plans.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nessun piano ancora. Crea il primo per iniziare a ricevere pagamenti.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {plans.map((plan) => (
                  <Card key={plan.id} className="relative group">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{plan.name}</CardTitle>
                          <CardDescription className="text-xs">
                            {plan.billing_interval === "block"
                              ? "Ogni 4 settimane"
                              : plan.billing_interval === "one_time"
                                ? "Una Tantum"
                                : plan.billing_interval === "month"
                                  ? "Mensile"
                                  : plan.billing_interval === "year"
                                    ? "Annuale"
                                    : "—"}
                          </CardDescription>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Altre opzioni"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deletePlan(plan.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Archivia Piano
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        €{(plan.price_amount / 100).toFixed(2)}
                        <span className="text-sm font-normal text-muted-foreground">
                          {plan.billing_interval === "block"
                            ? "/4 settimane"
                            : plan.billing_interval === "month"
                              ? "/mese"
                              : plan.billing_interval === "year"
                                ? "/anno"
                                : ""}
                        </span>
                      </div>
                      {plan.stripe_price_id && (
                        <Badge variant="outline" className="mt-2 text-xs">
                          <CreditCard className="h-3 w-3 mr-1" />
                          Stripe collegato
                        </Badge>
                      )}
                      {plan.description && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {plan.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Athletes Table with Payment Request */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <CardTitle>Abbonamenti Clienti</CardTitle>
            </div>
            <CardDescription>Gestisci abbonamenti e richiedi pagamenti via Stripe</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Atleta</TableHead>
                    <TableHead>Piano</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Rinnovo</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {athleteSubscriptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nessun atleta assegnato
                      </TableCell>
                    </TableRow>
                  ) : (
                    athleteSubscriptions.map((athlete) => (
                      <TableRow key={athlete.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={athlete.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">
                                {getInitials(athlete.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{athlete.full_name || "Senza nome"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-muted-foreground">
                            {athlete.subscription_tier || "—"}
                          </span>
                        </TableCell>
                        <TableCell>{getStatusBadge(athlete.subscription_status)}</TableCell>
                        <TableCell>
                          {athlete.current_period_end
                            ? format(new Date(athlete.current_period_end), "d MMM yyyy", {
                                locale: it,
                              })
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() =>
                              openPaymentDialog(athlete.id, athlete.full_name || "Atleta")
                            }
                            disabled={plans.length === 0}
                          >
                            <Euro className="h-3.5 w-3.5" />
                            Richiedi Pagamento
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Payment Request Dialog */}
      {selectedAthlete && (
        <RequestPaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          athleteId={selectedAthlete.id}
          athleteName={selectedAthlete.name}
          plans={plans}
          onGenerateCheckout={generateCheckout}
          isGenerating={isGeneratingCheckout}
        />
      )}
    </CoachLayout>
  );
}
