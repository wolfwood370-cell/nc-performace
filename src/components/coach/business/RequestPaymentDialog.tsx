import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Euro, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { BillingPlan } from "@/hooks/useBillingPlans";

interface RequestPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athleteId: string;
  athleteName: string;
  plans: BillingPlan[];
  onGenerateCheckout: (args: { planId: string; athleteId: string }) => Promise<{ url: string }>;
  isGenerating: boolean;
}

export function RequestPaymentDialog({
  open,
  onOpenChange,
  athleteId,
  athleteName,
  plans,
  onGenerateCheckout,
  isGenerating,
}: RequestPaymentDialogProps) {
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  const handleGenerate = async () => {
    if (!selectedPlanId) return;
    try {
      const result = await onGenerateCheckout({ planId: selectedPlanId, athleteId });
      setCheckoutUrl(result.url);
      toast({ title: "Link generato!", description: "Copia il link e invialo all'atleta." });
    } catch {
      // Error handled in hook
    }
  };

  const handleCopy = async () => {
    if (!checkoutUrl) return;
    await navigator.clipboard.writeText(checkoutUrl);
    toast({
      title: "Link copiato!",
      description: "Il link di pagamento è stato copiato negli appunti.",
    });
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setSelectedPlanId("");
      setCheckoutUrl(null);
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Richiedi Pagamento</DialogTitle>
          <DialogDescription>
            Genera un link di pagamento Stripe per {athleteName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!checkoutUrl ? (
            <>
              <div className="space-y-2">
                <Label>Seleziona Piano</Label>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Scegli un piano..." />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        <span className="flex items-center gap-2">
                          {plan.name} — €{(plan.price_amount / 100).toFixed(2)}
                          {plan.billing_interval === "block"
                            ? "/4 settimane"
                            : plan.billing_interval === "month"
                              ? "/mese"
                              : plan.billing_interval === "year"
                                ? "/anno"
                                : " una tantum"}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedPlan && (
                <div className="rounded-lg border bg-muted/50 p-3 text-sm space-y-1">
                  <p className="font-medium">{selectedPlan.name}</p>
                  <p className="text-muted-foreground">
                    €{(selectedPlan.price_amount / 100).toFixed(2)}{" "}
                    {selectedPlan.billing_interval === "block"
                      ? "/ 4 settimane"
                      : selectedPlan.billing_interval === "month"
                        ? "/ mese"
                        : selectedPlan.billing_interval === "year"
                          ? "/ anno"
                          : "una tantum"}
                  </p>
                  {selectedPlan.description && (
                    <p className="text-muted-foreground text-xs">{selectedPlan.description}</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border bg-primary/5 border-primary/20 p-4 text-center space-y-2">
                <Euro className="h-8 w-8 mx-auto text-primary" />
                <p className="font-medium text-sm">Link di pagamento pronto!</p>
                <p className="text-xs text-muted-foreground break-all">{checkoutUrl}</p>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 gap-2" onClick={handleCopy}>
                  <Copy className="h-4 w-4" />
                  Copia Link
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => window.open(checkoutUrl, "_blank")}
                >
                  <ExternalLink className="h-4 w-4" />
                  Apri
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {!checkoutUrl ? (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Annulla
              </Button>
              <Button onClick={handleGenerate} disabled={!selectedPlanId || isGenerating}>
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Generazione...
                  </>
                ) : (
                  "Genera Link"
                )}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => handleClose(false)}>
              Chiudi
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
